import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {FaithLogApiError} from './apiError';
import {
  ADMIN_WEEKLY_DEVOTION_CONTRACT_STATUS,
  createMockAdminWeeklyDevotionAdapter,
  createProductionAdminWeeklyDevotionAdapter,
  createProvisionalAdminWeeklyDevotionTransport,
  parseAdminWeeklyDevotion,
} from './adminWeeklyDevotionApi';

const VALID_WEEK = {
  activeMemberCount: 3,
  missingCount: 1,
  missingMembers: [
    {email: 'missing@example.test', name: '김미제출', userId: 3},
  ],
  submittedCount: 2,
  submittedMembers: [
    {
      bibleReadingCount: 4,
      dailyChecks: [
        {
          bibleReading: true,
          prayer: true,
          quietTime: true,
          recordDate: '2026-07-13',
        },
      ],
      email: 'member@example.test',
      name: '홍제출',
      penalty: {amount: 2500, chargeItemId: 10, status: 'UNPAID'},
      prayerCount: 6,
      quietTimeCount: 5,
      saturdayLateMinutes: 15,
      submittedAt: '2026-07-19T10:00:00+09:00',
      userId: 1,
    },
    {
      bibleReadingCount: 7,
      dailyChecks: [],
      email: 'paid@example.test',
      name: '박납부',
      penalty: {amount: 0, chargeItemId: 11, status: 'PAID'},
      prayerCount: 7,
      quietTimeCount: 7,
      saturdayLateMinutes: 0,
      submittedAt: '2026-07-19T09:00:00+09:00',
      userId: 2,
    },
  ],
  totalPenaltyAmount: 2500,
  weekEndDate: '2026-07-19',
  weekStartDate: '2026-07-13',
};

const REQUEST = {
  accessToken: 'admin-access-token',
  authGeneration: 4,
  campusId: 33,
  weekStartDate: '2026-07-13',
};

describe('admin weekly devotion provisional validator', () => {
  it('keeps submitted counts, actual penalty state, daily detail, and missing members', () => {
    expect(parseAdminWeeklyDevotion(VALID_WEEK)).toEqual(VALID_WEEK);
  });

  it.each([
    {...VALID_WEEK, weekStartDate: '2026-07-14'},
    {...VALID_WEEK, submittedCount: -1},
    {...VALID_WEEK, submittedMembers: [{...VALID_WEEK.submittedMembers[0], penalty: {}}]},
    {...VALID_WEEK, missingMembers: [{userId: 3, name: '이름'}]},
  ])('fails closed for an invalid provisional response', (value) => {
    expect(() => parseAdminWeeklyDevotion(value)).toThrow(FaithLogApiError);
  });
});

describe('admin weekly devotion adapters', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_ADMIN_WEEKLY_DEVOTION_MOCK_SCENARIO = 'success';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_ADMIN_WEEKLY_DEVOTION_MOCK_SCENARIO;
  });

  it('keeps mock and production adapters on one interface shape', async () => {
    const mock = createMockAdminWeeklyDevotionAdapter();
    const production = createProductionAdminWeeklyDevotionAdapter();

    expect(Object.keys(mock).sort()).toEqual(Object.keys(production).sort());
    await expect(mock.fetchWeek(REQUEST)).resolves.toMatchObject({
      missingCount: 1,
      submittedCount: 2,
    });
  });

  it('fails closed before calling a provisional production endpoint', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) => new Response());
    const adapter = createProductionAdminWeeklyDevotionAdapter({fetchImpl});

    expect(ADMIN_WEEKLY_DEVOTION_CONTRACT_STATUS).toBe('pending');
    await expect(adapter.fetchWeek(REQUEST)).rejects.toSatisfy(isContractPending);
    await expect(adapter.exportWeek(REQUEST)).rejects.toSatisfy(isContractPending);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('confirmed provisional binary transport', () => {
  it('uses the exact export URL and Authorization while returning raw bytes', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4]);
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) =>
      new Response(bytes, {
        headers: {
          'Content-Disposition': 'attachment; filename="faithlog-devotion-33-2026-07-13.xlsx"',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        status: 200,
      }),
    );
    const transport = createProvisionalAdminWeeklyDevotionTransport({
      apiBaseUrl: 'https://api.example.test',
      contractConfirmed: true,
      fetchImpl,
    });

    await expect(transport.exportWeek(REQUEST)).resolves.toEqual({
      bytes,
      fileName: 'faithlog-devotion-33-2026-07-13.xlsx',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/admin/campuses/33/devotions/weeks/2026-07-13/export',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          Authorization: 'Bearer admin-access-token',
        }),
        method: 'GET',
      }),
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Content-Type');
  });

  it.each([
    [401, 'sessionExpired'],
    [403, 'permissionDenied'],
  ] as const)('separates HTTP %i as %s', async (status, kind) => {
    const transport = createProvisionalAdminWeeklyDevotionTransport({
      apiBaseUrl: 'https://api.example.test',
      contractConfirmed: true,
      fetchImpl: vi.fn(async (_input: string, _init?: RequestInit) =>
        new Response(null, {status}),
      ),
    });

    await expect(transport.exportWeek(REQUEST)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(FaithLogApiError);
      expect((error as FaithLogApiError).detail).toMatchObject({kind, status});
      return true;
    });
  });
});

function isContractPending(error: unknown) {
  expect(error).toBeInstanceOf(FaithLogApiError);
  expect((error as FaithLogApiError).detail).toMatchObject({
    code: 'API_CONTRACT_PENDING',
    kind: 'error',
  });
  return true;
}
