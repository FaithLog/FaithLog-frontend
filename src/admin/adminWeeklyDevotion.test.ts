import {describe, expect, it, vi} from 'vitest';

import type {
  AdminWeeklyDevotion,
  AdminWeeklyDevotionAdapter,
  AdminWeeklyDevotionRequest,
} from '../api/adminWeeklyDevotionApi';
import {
  AdminWeeklyDevotionCoordinator,
  AdminWeeklyDevotionExportGate,
  formatAdminWeekRange,
  getAdminWeekStartDate,
  moveAdminWeek,
} from './adminWeeklyDevotion';

const WEEK = '2026-07-13';
const PREVIOUS_WEEK = '2026-07-06';
const NEXT_WEEK = '2026-07-20';

describe('admin weekly devotion dates', () => {
  it('defaults to the local Monday and moves exactly one week', () => {
    expect(getAdminWeekStartDate(new Date(2026, 6, 19, 23, 59))).toBe(WEEK);
    expect(moveAdminWeek(WEEK, -1)).toBe(PREVIOUS_WEEK);
    expect(moveAdminWeek(WEEK, 1)).toBe(NEXT_WEEK);
    expect(formatAdminWeekRange(WEEK)).toBe('2026.07.13 - 07.19');
  });
});

describe('AdminWeeklyDevotionCoordinator', () => {
  it('preloads only the previous week on latest-week entry', async () => {
    const adapter = createAdapter();
    const coordinator = new AdminWeeklyDevotionCoordinator(adapter);

    await coordinator.select(createRequest(WEEK), WEEK);
    await vi.waitFor(() => expect(adapter.fetchWeek).toHaveBeenCalledTimes(2));

    expect(adapter.fetchWeek).toHaveBeenNthCalledWith(1, createRequest(WEEK));
    expect(adapter.fetchWeek).toHaveBeenNthCalledWith(2, createRequest(PREVIOUS_WEEK));
    expect(adapter.fetchWeek).not.toHaveBeenCalledWith(createRequest(NEXT_WEEK));
  });

  it('caches adjacent weeks after moving into history', async () => {
    const adapter = createAdapter();
    const coordinator = new AdminWeeklyDevotionCoordinator(adapter);

    await coordinator.select(createRequest(PREVIOUS_WEEK), WEEK);
    await vi.waitFor(() => expect(adapter.fetchWeek).toHaveBeenCalledTimes(3));

    expect(adapter.fetchWeek).toHaveBeenCalledWith(createRequest('2026-06-29'));
    expect(adapter.fetchWeek).toHaveBeenCalledWith(createRequest(WEEK));

    await coordinator.select(createRequest(WEEK), WEEK);
    expect(adapter.fetchWeek).toHaveBeenCalledTimes(3);
  });

  it('keys cache entries by campus, auth generation, and week', async () => {
    const adapter = createAdapter();
    const coordinator = new AdminWeeklyDevotionCoordinator(adapter);

    await coordinator.load(createRequest(WEEK));
    await coordinator.load({...createRequest(WEEK), campusId: 2});
    await coordinator.load({...createRequest(WEEK), authGeneration: 8});
    await coordinator.load(createRequest(WEEK));

    expect(adapter.fetchWeek).toHaveBeenCalledTimes(3);
  });

  it('marks a late response stale so it cannot replace the latest selection', async () => {
    const first = deferred<AdminWeeklyDevotion>();
    const second = deferred<AdminWeeklyDevotion>();
    const adapter = createAdapter();
    vi.mocked(adapter.fetchWeek)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const coordinator = new AdminWeeklyDevotionCoordinator(adapter);

    const oldSelection = coordinator.select(createRequest(PREVIOUS_WEEK), WEEK);
    const latestSelection = coordinator.select(createRequest(WEEK), WEEK);
    second.resolve(createWeek(WEEK));
    await expect(latestSelection).resolves.toMatchObject({status: 'applied'});
    first.resolve(createWeek(PREVIOUS_WEEK));
    await expect(oldSelection).resolves.toEqual({status: 'stale'});
  });
});

describe('AdminWeeklyDevotionExportGate', () => {
  it('deduplicates repeated Excel taps until the first download settles', async () => {
    const pending = deferred<{bytes: Uint8Array; fileName: string}>();
    const exportWeek = vi.fn(() => pending.promise);
    const gate = new AdminWeeklyDevotionExportGate(exportWeek);

    const first = gate.run(createRequest(WEEK));
    const second = gate.run(createRequest(WEEK));

    expect(first).toBe(second);
    expect(exportWeek).toHaveBeenCalledOnce();
    pending.resolve({bytes: new Uint8Array([80, 75]), fileName: 'weekly.xlsx'});
    await expect(first).resolves.toMatchObject({fileName: 'weekly.xlsx'});
  });
});

function createRequest(weekStartDate: string): AdminWeeklyDevotionRequest {
  return {
    accessToken: 'access-token',
    authGeneration: 7,
    campusId: 1,
    weekStartDate,
  };
}

function createWeek(weekStartDate: string): AdminWeeklyDevotion {
  return {
    activeMemberCount: 2,
    missingCount: 1,
    missingMembers: [{email: 'missing@example.test', name: '미제출자', userId: 2}],
    submittedCount: 1,
    submittedMembers: [],
    totalPenaltyAmount: 0,
    weekEndDate: moveAdminWeek(weekStartDate, 1),
    weekStartDate,
  };
}

function createAdapter(): AdminWeeklyDevotionAdapter & {
  fetchWeek: ReturnType<typeof vi.fn<AdminWeeklyDevotionAdapter['fetchWeek']>>;
} {
  const fetchWeek = vi.fn<AdminWeeklyDevotionAdapter['fetchWeek']>(async (request) =>
    createWeek(request.weekStartDate),
  );

  return {
    exportWeek: vi.fn(async () => ({
      bytes: new Uint8Array([80, 75]),
      fileName: 'weekly.xlsx',
    })),
    fetchWeek,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return {promise, resolve};
}
