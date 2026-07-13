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
import {AccessibilityInfo} from 'react-native';
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
    const shareExport = vi.fn(async () => undefined);
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

  it('releases the export gate after a request timeout so retry can succeed', async () => {
    const adapter = createAdapter();
    adapter.exportWeek
      .mockRejectedValueOnce(new FaithLogApiError({
        code: 'REQUEST_TIMEOUT',
        kind: 'offline',
        message: 'timeout',
      }))
      .mockResolvedValueOnce({
        bytes: new Uint8Array([80, 75]),
        fileName: 'weekly.xlsx',
      });
    const shareExport = vi.fn(async () => undefined);
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

    const findButton = () => renderer.root.findByProps({
      accessibilityLabel: '주차별 경건 현황 Excel 다운로드',
    });
    await act(async () => {
      await findButton().props.onPress();
    });
    expect(findButton().props.disabled).toBe(false);
    await act(async () => {
      await findButton().props.onPress();
    });

    expect(adapter.exportWeek).toHaveBeenCalledTimes(2);
    expect(shareExport).toHaveBeenCalledOnce();
  });

  it('never renders or announces internal contract terminology', async () => {
    const adapter = createAdapter();
    const pendingError = new FaithLogApiError({
      code: 'API_CONTRACT_PENDING',
      kind: 'error',
      message: 'internal contract detail',
    });
    adapter.fetchWeek.mockRejectedValue(pendingError);
    adapter.exportWeek.mockRejectedValue(pendingError);
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = track(createSection(adapter));
    });
    await act(async () => {
      await renderer.root.findByProps({
        accessibilityLabel: '주차별 경건 현황 Excel 다운로드',
      }).props.onPress();
    });

    const internalTerms = /REST Docs|API|production|endpoint|엔드포인트/i;
    expect(readText(renderer)).not.toMatch(internalTerms);
    const announcements = vi.mocked(AccessibilityInfo.announceForAccessibility).mock.calls
      .flatMap((call) => call)
      .join(' ');
    expect(announcements).not.toMatch(internalTerms);
  });

  it('drops an export result when the campus changes before sharing', async () => {
    const pendingExport = deferred<Awaited<ReturnType<AdminWeeklyDevotionAdapter['exportWeek']>>>();
    const adapter = createAdapter();
    adapter.exportWeek.mockReturnValueOnce(pendingExport.promise);
    const shareExport = vi.fn(async () => undefined);
    const dependencies = {
      adapter,
      getNow: () => new Date(2026, 6, 13, 9),
      resolveRequest: async (weekStartDate: string) => ({...REQUEST, weekStartDate}),
      shareExport,
    };
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = track(create(
        <AdminWeeklyDevotionSection
          campusId={1}
          dependencies={dependencies}
          setAuthState={vi.fn()}
        />,
      ));
    });

    const button = renderer.root.findByProps({
      accessibilityLabel: '주차별 경건 현황 Excel 다운로드',
    });
    let exportPromise!: Promise<void>;
    act(() => {
      exportPromise = button.props.onPress();
    });
    act(() => {
      renderer.update(
        <AdminWeeklyDevotionSection
          campusId={2}
          dependencies={dependencies}
          setAuthState={vi.fn()}
        />,
      );
    });
    await act(async () => {
      pendingExport.resolve({
        bytes: new Uint8Array([80, 75]),
        fileName: 'campus-1-weekly.xlsx',
      });
      await exportPromise;
    });

    expect(shareExport).not.toHaveBeenCalled();
    expect(readText(renderer)).not.toContain('campus-1-weekly.xlsx');
  });

  it('allows the new campus to export while the previous campus export is still pending', async () => {
    const oldExport = deferred<Awaited<ReturnType<AdminWeeklyDevotionAdapter['exportWeek']>>>();
    const adapter = createAdapter();
    adapter.exportWeek
      .mockReturnValueOnce(oldExport.promise)
      .mockResolvedValueOnce({
        bytes: new Uint8Array([80, 75]),
        fileName: 'campus-2-weekly.xlsx',
      });
    const shareExport = vi.fn(async () => undefined);
    let activeCampusId = 1;
    const dependencies = {
      adapter,
      getNow: () => new Date(2026, 6, 13, 9),
      resolveRequest: async (weekStartDate: string) => ({
        ...REQUEST,
        campusId: activeCampusId,
        weekStartDate,
      }),
      shareExport,
    };
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = track(create(
        <AdminWeeklyDevotionSection
          campusId={1}
          dependencies={dependencies}
          setAuthState={vi.fn()}
        />,
      ));
    });
    const oldButton = renderer.root.findByProps({
      accessibilityLabel: '주차별 경건 현황 Excel 다운로드',
    });
    await act(async () => {
      void oldButton.props.onPress();
      await Promise.resolve();
    });
    expect(adapter.exportWeek).toHaveBeenCalledOnce();

    activeCampusId = 2;
    act(() => {
      renderer.update(
        <AdminWeeklyDevotionSection
          campusId={2}
          dependencies={dependencies}
          setAuthState={vi.fn()}
        />,
      );
    });
    const newButton = renderer.root.findByProps({
      accessibilityLabel: '주차별 경건 현황 Excel 다운로드',
    });
    expect(newButton.props.disabled).toBe(false);
    await act(async () => {
      await newButton.props.onPress();
    });

    expect(adapter.exportWeek).toHaveBeenCalledTimes(2);
    expect(shareExport).toHaveBeenCalledOnce();
    expect(shareExport).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'campus-2-weekly.xlsx',
    }));
  });

  it('reuses the original campus export after an A to B to A round trip', async () => {
    const campusAExport = deferred<Awaited<ReturnType<AdminWeeklyDevotionAdapter['exportWeek']>>>();
    const adapter = createAdapter();
    adapter.exportWeek
      .mockReturnValueOnce(campusAExport.promise)
      .mockResolvedValueOnce({
        bytes: new Uint8Array([80, 75]),
        fileName: 'campus-2-weekly.xlsx',
      });
    const shareExport = vi.fn(async () => undefined);
    let activeCampusId = 1;
    const dependencies = {
      adapter,
      getNow: () => new Date(2026, 6, 13, 9),
      resolveRequest: async (weekStartDate: string) => ({
        ...REQUEST,
        campusId: activeCampusId,
        weekStartDate,
      }),
      shareExport,
    };
    let renderer!: ReactTestRenderer;
    let firstCampusPromise!: Promise<void>;

    await act(async () => {
      renderer = track(create(
        <AdminWeeklyDevotionSection
          campusId={1}
          dependencies={dependencies}
          setAuthState={vi.fn()}
        />,
      ));
    });
    await act(async () => {
      firstCampusPromise = renderer.root.findByProps({
        accessibilityLabel: '주차별 경건 현황 Excel 다운로드',
      }).props.onPress();
      await Promise.resolve();
    });

    activeCampusId = 2;
    act(() => {
      renderer.update(
        <AdminWeeklyDevotionSection
          campusId={2}
          dependencies={dependencies}
          setAuthState={vi.fn()}
        />,
      );
    });
    await act(async () => {
      await renderer.root.findByProps({
        accessibilityLabel: '주차별 경건 현황 Excel 다운로드',
      }).props.onPress();
    });

    activeCampusId = 1;
    act(() => {
      renderer.update(
        <AdminWeeklyDevotionSection
          campusId={1}
          dependencies={dependencies}
          setAuthState={vi.fn()}
        />,
      );
    });
    expect(renderer.root.findByProps({
      accessibilityLabel: '주차별 경건 현황 Excel 다운로드',
    }).props.disabled).toBe(true);
    expect(adapter.exportWeek).toHaveBeenCalledTimes(2);

    await act(async () => {
      campusAExport.resolve({
        bytes: new Uint8Array([80, 75]),
        fileName: 'campus-1-weekly.xlsx',
      });
      await firstCampusPromise;
    });
    expect(adapter.exportWeek).toHaveBeenCalledTimes(2);
    expect(shareExport).toHaveBeenCalledTimes(2);
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

  it('renders loading, empty, offline retry, and permission-denied as distinct states', async () => {
    const pendingWeek = deferred<AdminWeeklyDevotion>();
    const loadingAdapter = createAdapter();
    loadingAdapter.fetchWeek.mockImplementation((request) =>
      request.weekStartDate === WEEK
        ? pendingWeek.promise
        : Promise.resolve(createWeek(request.weekStartDate)),
    );
    let loadingRenderer!: ReactTestRenderer;
    await act(async () => {
      loadingRenderer = track(createSection(loadingAdapter));
    });
    expect(findHostType(loadingRenderer, 'Loading')).toHaveLength(1);
    await act(async () => {
      pendingWeek.resolve(createWeek(WEEK));
    });

    const emptyAdapter = createAdapter();
    emptyAdapter.fetchWeek.mockImplementation(async (request) =>
      createEmptyWeek(request.weekStartDate),
    );
    let emptyRenderer!: ReactTestRenderer;
    await act(async () => {
      emptyRenderer = track(createSection(emptyAdapter));
    });
    expect(findHostType(emptyRenderer, 'Empty')).toHaveLength(1);

    const offlineAdapter = createAdapter();
    offlineAdapter.fetchWeek
      .mockRejectedValueOnce(new FaithLogApiError({
        code: 'MOCK_OFFLINE',
        kind: 'offline',
        message: 'offline',
      }))
      .mockImplementation(async (request) => createWeek(request.weekStartDate));
    let offlineRenderer!: ReactTestRenderer;
    await act(async () => {
      offlineRenderer = track(createSection(offlineAdapter));
    });
    const offline = findHostType(offlineRenderer, 'Offline')[0]!;
    await act(async () => {
      offline.props.onActionPress();
    });
    expect(readText(offlineRenderer)).toContain('홍제출');

    const forbiddenAdapter = createAdapter();
    forbiddenAdapter.fetchWeek.mockRejectedValue(new FaithLogApiError({
      kind: 'permissionDenied',
      message: 'forbidden',
      status: 403,
    }));
    let forbiddenRenderer!: ReactTestRenderer;
    await act(async () => {
      forbiddenRenderer = track(createSection(forbiddenAdapter));
    });
    expect(findHostType(forbiddenRenderer, 'PermissionDenied')).toHaveLength(1);
  });

  it('renders submitted and missing sections and opens daily detail from a row', async () => {
    const adapter = createAdapter();
    adapter.fetchWeek.mockImplementation(async (request) => {
      const week = createWeek(request.weekStartDate);
      return {
        ...week,
        activeMemberCount: 2,
        missingCount: 1,
        missingMembers: [{email: 'missing@example.test', name: '김미제출', userId: 2}],
        submittedMembers: [{
          ...week.submittedMembers[0]!,
          dailyChecks: [{
            bibleReading: true,
            prayer: true,
            quietTime: true,
            recordDate: request.weekStartDate,
          }],
        }],
      };
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = track(createSection(adapter));
    });

    expect(readText(renderer)).toContain('제출자  1 명');
    expect(readText(renderer)).toContain('미제출자  1 명');
    expect(readText(renderer)).toContain('김미제출');
    const row = renderer.root.findByProps({
      accessibilityLabel:
        '홍제출, 큐티 5회, 성경 4회, 기도 6회, 토요일 지각 15분, 벌금 2,500원, 상태 미납, 일별 상세 열기',
    });
    act(() => row.props.onPress());
    expect(renderer.root.findByProps({accessibilityLabel: '홍제출 일별 상세'})).toBeDefined();
    expect(readText(renderer)).toContain('✓');
  });

  it('bounds the initial member render and reveals the next batch on demand', async () => {
    const adapter = createAdapter();
    adapter.fetchWeek.mockImplementation(async (request) => {
      const week = createWeek(request.weekStartDate);
      const submittedMembers = Array.from({length: 51}, (_, index) => ({
        ...week.submittedMembers[0]!,
        email: `member-${index + 1}@example.test`,
        name: `제출자 ${index + 1}`,
        userId: index + 1,
      }));
      return {
        ...week,
        activeMemberCount: submittedMembers.length,
        submittedCount: submittedMembers.length,
        submittedMembers,
      };
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = track(createSection(adapter));
    });

    expect(renderer.root.findAllByProps({
      accessibilityHint: '선택하면 월요일부터 일요일까지 일별 상세를 확인합니다.',
    })).toHaveLength(50);
    const more = renderer.root.findByProps({accessibilityLabel: '제출자 더 보기'});
    act(() => more.props.onPress());
    expect(renderer.root.findAllByProps({
      accessibilityHint: '선택하면 월요일부터 일요일까지 일별 상세를 확인합니다.',
    })).toHaveLength(51);
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

function createEmptyWeek(weekStartDate: string): AdminWeeklyDevotion {
  const week = createWeek(weekStartDate);
  return {
    ...week,
    activeMemberCount: 0,
    missingCount: 0,
    missingMembers: [],
    submittedCount: 0,
    submittedMembers: [],
    totalPenaltyAmount: 0,
  };
}

function createSection(adapter: AdminWeeklyDevotionAdapter) {
  return create(
    <AdminWeeklyDevotionSection
      campusId={1}
      dependencies={{
        adapter,
        getNow: () => new Date(2026, 6, 13, 9),
        resolveRequest: async (weekStartDate) => ({...REQUEST, weekStartDate}),
        shareExport: vi.fn(),
      }}
      setAuthState={vi.fn()}
    />,
  );
}

function findHostType(renderer: ReactTestRenderer, type: string) {
  return renderer.root.findAll((node) => String(node.type) === type);
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
