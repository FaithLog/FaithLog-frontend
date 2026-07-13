import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const nativeState = vi.hoisted(() => ({
  appStateListener: null as null | ((state: string) => void),
  authGeneration: 7,
}));

vi.mock('react-native', () => ({
  AccessibilityInfo: {announceForAccessibility: vi.fn()},
  AppState: {
    addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
      nativeState.appStateListener = listener;
      return {remove: vi.fn()};
    }),
  },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: {create: <T,>(value: T) => value},
  Text: 'Text',
  View: 'View',
}));

vi.mock('../components/IconexIcon', () => ({IconexIcon: 'IconexIcon'}));
vi.mock('../components/ui', () => ({
  Empty: 'Empty',
  ErrorState: 'ErrorState',
  Loading: 'Loading',
  Offline: 'Offline',
  PermissionDenied: 'PermissionDenied',
}));
vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: vi.fn(() => nativeState.authGeneration),
  isAuthSessionGenerationCurrent: vi.fn(
    (generation: number) => generation === nativeState.authGeneration,
  ),
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {},
}));

import {AdminWeeklyDevotionSection} from './AdminWeeklyDevotionSection';
import {FaithLogApiError} from '../api/apiError';
import {StaleAuthSessionReadError} from '../api/tokenStorage';
import type {
  AdminWeeklyDevotion,
  AdminWeeklyDevotionAdapter,
  AdminWeeklyDevotionRequest,
} from '../api/adminWeeklyDevotionApi';

const WEEK = '2026-07-13';
const NEXT_WEEK = '2026-07-20';
const REQUEST: AdminWeeklyDevotionRequest = {
  accessToken: 'access-token',
  authGeneration: 7,
  campusId: 1,
  weekStartDate: WEEK,
};
const mountedRenderers: ReactTestRenderer[] = [];

describe('AdminWeeklyDevotionSection runtime behavior', () => {
  beforeEach(() => {
    nativeState.appStateListener = null;
    nativeState.authGeneration = 7;
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      for (const renderer of mountedRenderers.splice(0)) {
        renderer.unmount();
      }
    });
  });

  it('single-flights download, file write, and share across rapid taps', async () => {
    const adapter = createAdapter();
    const shareExport = vi.fn(async () => 'file:///weekly.xlsx');
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = track(create(
        <AdminWeeklyDevotionSection
          campusId={1}
          dependencies={{
            adapter,
            getNow: () => new Date(2026, 6, 13, 9),
            resolveRequest: async (weekStartDate) => ({...REQUEST, weekStartDate}),
            shareExport,
          }}
          setAuthState={vi.fn()}
        />,
      ));
    });

    const button = renderer.root.findByProps({
      accessibilityLabel: '주차별 경건 현황 Excel 다운로드',
    });
    await act(async () => {
      const first = button.props.onPress();
      const second = button.props.onPress();
      await Promise.all([first, second]);
    });

    expect(adapter.exportWeek).toHaveBeenCalledOnce();
    expect(shareExport).toHaveBeenCalledOnce();
  });

  it('hides the previous table immediately when the selected week changes', async () => {
    const nextRequest = deferred<AdminWeeklyDevotionRequest | null>();
    const adapter = createAdapter();
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = track(create(
        <AdminWeeklyDevotionSection
          campusId={1}
          dependencies={{
            adapter,
            getNow: () => new Date(2026, 6, 13, 9),
            resolveRequest: (weekStartDate) =>
              weekStartDate === NEXT_WEEK
                ? nextRequest.promise
                : Promise.resolve({...REQUEST, weekStartDate}),
            shareExport: vi.fn(),
          }}
          setAuthState={vi.fn()}
        />,
      ));
    });
    expect(readText(renderer)).toContain('홍제출');

    const nextButton = renderer.root.findByProps({
      accessibilityLabel: '다음 주 주차별 현황 조회',
    });
    act(() => {
      nextButton.props.onPress();
    });

    expect(readText(renderer)).not.toContain('홍제출');
    expect(renderer.root.findAll((node) => String(node.type) === 'Loading')).toHaveLength(1);
    nextRequest.resolve(null);
  });

  it('reads every submitted table value from the row accessibility label', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = track(create(
        <AdminWeeklyDevotionSection
          campusId={1}
          dependencies={{
            adapter: createAdapter(),
            getNow: () => new Date(2026, 6, 13, 9),
            resolveRequest: async (weekStartDate) => ({...REQUEST, weekStartDate}),
            shareExport: vi.fn(),
          }}
          setAuthState={vi.fn()}
        />,
      ));
    });

    const row = renderer.root.findByProps({
      accessibilityLabel:
        '홍제출, 큐티 5회, 성경 4회, 기도 6회, 토요일 지각 15분, 벌금 2,500원, 상태 미납, 일별 상세 열기',
    });
    expect(row.props.accessibilityRole).toBe('button');
  });

  it('silently cancels a stale secure-storage read instead of rejecting the effect', async () => {
    await expect(act(async () => {
      track(create(
        <AdminWeeklyDevotionSection
          campusId={1}
          dependencies={{
            adapter: createAdapter(),
            getNow: () => new Date(2026, 6, 13, 9),
            resolveRequest: async () => {
              throw new StaleAuthSessionReadError(7 as never);
            },
            shareExport: vi.fn(),
          }}
          setAuthState={vi.fn()}
        />,
      ));
      await Promise.resolve();
    })).resolves.toBeUndefined();
  });

  it('does not expire a new login when an old-generation prefetch returns 401', async () => {
    const oldPrefetch = deferred<AdminWeeklyDevotion>();
    const adapter = createAdapter();
    adapter.fetchWeek.mockImplementation(async (request) => {
      if (request.weekStartDate === '2026-07-06') {
        return oldPrefetch.promise;
      }
      return createWeek(request.weekStartDate);
    });
    const setAuthState = vi.fn();

    await act(async () => {
      track(create(
        <AdminWeeklyDevotionSection
          campusId={1}
          dependencies={{
            adapter,
            getNow: () => new Date(2026, 6, 13, 9),
            resolveRequest: async (weekStartDate) => ({...REQUEST, weekStartDate}),
            shareExport: vi.fn(),
          }}
          setAuthState={setAuthState}
        />,
      ));
    });
    await vi.waitFor(() => expect(adapter.fetchWeek).toHaveBeenCalledTimes(2));

    nativeState.authGeneration = 9;
    await act(async () => {
      oldPrefetch.reject(new FaithLogApiError({
        authSessionGeneration: 7,
        kind: 'sessionExpired',
        message: 'old session expired',
        status: 401,
      }));
      await Promise.resolve();
    });

    expect(setAuthState).not.toHaveBeenCalled();
  });

  it('renders a safe error state for a current secure-storage failure', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = track(create(
        <AdminWeeklyDevotionSection
          campusId={1}
          dependencies={{
            adapter: createAdapter(),
            getNow: () => new Date(2026, 6, 13, 9),
            resolveRequest: async () => {
              throw new Error('secure storage unavailable');
            },
            shareExport: vi.fn(),
          }}
          setAuthState={vi.fn()}
        />,
      ));
    });

    expect(renderer.root.findAll((node) => String(node.type) === 'ErrorState')).toHaveLength(1);
  });

  it('rolls the default latest week forward when the app becomes active on Monday', async () => {
    let now = new Date(2026, 6, 19, 23, 59);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = track(create(
        <AdminWeeklyDevotionSection
          campusId={1}
          dependencies={{
            adapter: createAdapter(),
            getNow: () => now,
            resolveRequest: async (weekStartDate) => ({...REQUEST, weekStartDate}),
            shareExport: vi.fn(),
          }}
          setAuthState={vi.fn()}
        />,
      ));
    });
    expect(readText(renderer)).toContain('2026.07.13 - 07.19');

    now = new Date(2026, 6, 20, 0, 1);
    await act(async () => {
      nativeState.appStateListener?.('active');
    });

    expect(readText(renderer)).toContain('2026.07.20 - 07.26');
  });
});

function createAdapter(): AdminWeeklyDevotionAdapter & {
  exportWeek: ReturnType<typeof vi.fn<AdminWeeklyDevotionAdapter['exportWeek']>>;
  fetchWeek: ReturnType<typeof vi.fn<AdminWeeklyDevotionAdapter['fetchWeek']>>;
} {
  return {
    exportWeek: vi.fn(async () => ({
      bytes: new Uint8Array([80, 75]),
      fileName: 'weekly.xlsx',
    })),
    fetchWeek: vi.fn(async (request) => createWeek(request.weekStartDate)),
  };
}

function createWeek(weekStartDate: string): AdminWeeklyDevotion {
  const end = new Date(`${weekStartDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    activeMemberCount: 1,
    missingCount: 0,
    missingMembers: [],
    submittedCount: 1,
    submittedMembers: [{
      bibleReadingCount: 4,
      dailyChecks: [],
      email: 'submitted@example.test',
      name: '홍제출',
      penalty: {amount: 2500, chargeItemId: 10, status: 'UNPAID'},
      prayerCount: 6,
      quietTimeCount: 5,
      saturdayLateMinutes: 15,
      submittedAt: `${weekStartDate}T09:00:00+09:00`,
      userId: 1,
    }],
    totalPenaltyAmount: 2500,
    weekEndDate: end.toISOString().slice(0, 10),
    weekStartDate,
  };
}

function readText(renderer: ReactTestRenderer) {
  return renderer.root
    .findAll((node) => String(node.type) === 'Text')
    .flatMap((node) => node.children)
    .join(' ');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return {promise, reject, resolve};
}

function track(renderer: ReactTestRenderer) {
  mountedRenderers.push(renderer);
  return renderer;
}
