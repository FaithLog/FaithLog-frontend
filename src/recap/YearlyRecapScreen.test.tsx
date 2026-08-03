import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const native = vi.hoisted(() => ({
  announcements: vi.fn(),
  animationStops: vi.fn(),
  appState: 'active',
  appStateListener: null as null | ((state: string) => void),
  appStateRemove: vi.fn(),
  fontScale: 1,
  preferencesReject: false,
  reduceMotion: false,
  screenReader: false,
  scrollTo: vi.fn(),
  stagger: vi.fn(),
  timing: vi.fn(),
}));

const experienceMocks = vi.hoisted(() => ({
  generation: 7,
  getPreviousYearRecap: vi.fn(),
  markPresented: vi.fn(),
}));

vi.mock('./yearlyRecapAssets', () => ({
  getFaithLogRecapLogo: () => ({uri: 'faithlog-logo'}),
}));
vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: vi.fn(() => experienceMocks.generation),
  isAuthSessionRequestAllowed: vi.fn(
    (generation: number) => generation === experienceMocks.generation,
  ),
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {},
}));
vi.mock('../auth/accessTokenResolver', () => ({
  resolveCurrentAccessToken: vi.fn(async () => 'access-token'),
}));
vi.mock('./yearlyRecapApi', () => ({
  createYearlyRecapApi: vi.fn(() => ({
    getPreviousYearRecap: experienceMocks.getPreviousYearRecap,
    markPresented: experienceMocks.markPresented,
  })),
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  const ScrollView = ReactModule.forwardRef<unknown, React.PropsWithChildren<Record<string, unknown>>>(
    ({children, ...props}, ref) => ReactModule.createElement(
      'ScrollView',
      {...props, ref},
      children as React.ReactNode,
    ),
  );

  class Value {
    value: number;
    constructor(value: number) {
      this.value = value;
    }
    interpolate() {
      return this.value;
    }
    setValue(value: number) {
      this.value = value;
    }
    stopAnimation() {
      native.animationStops();
    }
  }

  const timing = (value: Value, config: {toValue: number}) => {
    native.timing(value, config);
    return {
      start(callback?: (result: {finished: boolean}) => void) {
        value.setValue(config.toValue);
        callback?.({finished: true});
      },
      stop: native.animationStops,
    };
  };
  const stagger = (delay: number, animations: Array<{start: () => void}>) => {
    native.stagger(delay, animations);
    return {
      start(callback?: (result: {finished: boolean}) => void) {
        animations.forEach((animation) => animation.start());
        callback?.({finished: true});
      },
      stop: native.animationStops,
    };
  };

  return {
    AccessibilityInfo: {
      addEventListener: vi.fn(() => ({remove: vi.fn()})),
      announceForAccessibility: native.announcements,
      isReduceMotionEnabled: vi.fn(async () => {
        if (native.preferencesReject) throw new Error('unavailable');
        return native.reduceMotion;
      }),
      isScreenReaderEnabled: vi.fn(async () => {
        if (native.preferencesReject) throw new Error('unavailable');
        return native.screenReader;
      }),
    },
    Animated: {Value, View: host('AnimatedView'), stagger, timing},
    AppState: {
      get currentState() {
        return native.appState;
      },
      addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
        native.appStateListener = listener;
        return {remove: native.appStateRemove};
      }),
    },
    Image: host('Image'),
    Modal: ({children, visible, ...props}: React.PropsWithChildren<{visible: boolean}>) =>
      visible ? ReactModule.createElement('Modal', props, children) : null,
    PanResponder: {create: vi.fn((handlers: Record<string, unknown>) => ({panHandlers: handlers}))},
    Pressable: host('Pressable'),
    SafeAreaView: host('SafeAreaView'),
    ScrollView,
    StyleSheet: {create: <T,>(styles: T) => styles},
    Text: host('Text'),
    useWindowDimensions: () => ({fontScale: native.fontScale, height: 844, width: 390}),
    View: host('View'),
  };
});

import {Image, ScrollView} from 'react-native';
import {YearlyRecapScreen} from './YearlyRecapScreen';
import {useYearlyRecapExperience} from './useYearlyRecapExperience';
import type {YearlyRecap, YearlyRecapPenaltySummary} from './yearlyRecapTypes';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const RECAP: YearlyRecap = {
  recapYear: 2026,
  hasRecapData: true,
  presentation: {
    shouldAutoPresent: true,
    homeCardVisible: true,
    homeCardVisibleUntil: '2027-01-14T23:59:59+09:00',
    firstPresentedAt: null,
  },
  campusJourney: {campuses: []},
  devotion: {
    quietTimeCount: 10,
    bibleReadingCount: 8,
    prayerCount: 12,
    allCompletedDayCount: 5,
    submittedWeekCount: 4,
    longestStreakDays: 3,
    mostActiveMonth: 8,
  },
  prayerActivity: {submittedWeekCount: 0, participatedSeasonCount: 0},
  commentActivity: {writtenCount: 6},
  penaltySummary: {
    totalCount: 3,
    totalAmount: 15_000,
    paidCount: 2,
    paidAmount: 10_000,
    unpaidCount: 1,
    unpaidAmount: 5_000,
  },
};

const mounted: ReactTestRenderer[] = [];
let latestExperience: ReturnType<typeof useYearlyRecapExperience> | null = null;

describe('YearlyRecapScreen rendered behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    native.appState = 'active';
    native.appStateListener = null;
    native.fontScale = 1;
    native.preferencesReject = false;
    native.reduceMotion = false;
    native.screenReader = false;
    latestExperience = null;
    experienceMocks.generation = 7;
    experienceMocks.getPreviousYearRecap.mockReset().mockResolvedValue(RECAP);
    experienceMocks.markPresented.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    act(() => mounted.splice(0).forEach((renderer) => renderer.unmount()));
    vi.useRealTimers();
  });

  it('renders the real modal, reports onLayout once, and advances only by swipe or button', async () => {
    const onFirstFrame = vi.fn();
    const renderer = await renderScreen({onFirstFrame});
    const modal = renderer.root.find((node) => isHostType(node.type, 'Modal'));
    expect(modal.props.accessibilityViewIsModal).toBeUndefined();
    const modalSurface = renderer.root.find((node) =>
      isHostType(node.type, 'View') && node.props.accessibilityViewIsModal === true);
    expect(modalSurface.props.onAccessibilityEscape).toBeTypeOf('function');
    expect(renderer.root.findByType(Image).props.source).toEqual({uri: 'faithlog-logo'});
    expect(readText(renderer)).toContain('10일');
    expect(readText(renderer)).toContain('8일');
    expect(readText(renderer)).toContain('12일');
    expect(native.stagger).toHaveBeenCalledWith(120, expect.any(Array));
    expect(native.stagger.mock.calls[0]?.[1]).toHaveLength(3);
    const stopsBeforeModalShow = native.animationStops.mock.calls.length;
    act(() => modal.props.onShow());
    expect(native.animationStops).toHaveBeenCalledTimes(stopsBeforeModalShow);
    expect(native.stagger).toHaveBeenCalledOnce();

    const scroll = renderer.root.findByType(ScrollView);
    act(() => {
      scroll.props.onLayout({nativeEvent: {layout: {height: 600}}});
      scroll.props.onLayout({nativeEvent: {layout: {height: 600}}});
    });
    expect(onFirstFrame).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(65_000);
    expect(readText(renderer)).toContain('2026년, 나의 지난 한 해');
    native.scrollTo.mockClear();
    act(() => findByLabel(renderer, '다음 회고 장면').props.onPress());
    expect(native.scrollTo).toHaveBeenCalledWith({animated: false, y: 0});
    expect(readText(renderer)).toContain('내가 이어온 경건생활');
    expect(native.stagger).toHaveBeenCalledOnce();

    const gestureSurface = renderer.root.find((node) => typeof node.props.onPanResponderRelease === 'function');
    expect(gestureSurface.props.onMoveShouldSetPanResponder({}, {dx: 100, dy: -20})).toBe(false);
    expect(gestureSurface.props.onMoveShouldSetPanResponder({}, {dx: 4, dy: -80})).toBe(true);
    act(() => gestureSurface.props.onPanResponderRelease({}, {dx: 4, dy: -60}));
    expect(readText(renderer)).toContain('꾸준히 남긴 경건생활');
  });

  it('reports presented exactly once only after both Modal onShow and rendered layout', async () => {
    const onFirstFrame = vi.fn();
    const renderer = await renderScreen({onFirstFrame});
    const modal = renderer.root.find((node) => isHostType(node.type, 'Modal'));
    const scroll = renderer.root.findByType(ScrollView);

    act(() => {
      scroll.props.onLayout({nativeEvent: {layout: {height: 600}}});
      scroll.props.onLayout({nativeEvent: {layout: {height: 600}}});
    });
    expect(onFirstFrame).not.toHaveBeenCalled();

    act(() => modal.props.onShow());
    expect(onFirstFrame).toHaveBeenCalledOnce();
    act(() => {
      modal.props.onShow();
      scroll.props.onLayout({nativeEvent: {layout: {height: 600}}});
    });
    expect(onFirstFrame).toHaveBeenCalledOnce();
  });

  it.each([
    ['Reduce Motion', true, false],
    ['screen reader', false, true],
  ])('shows content immediately without animation for %s', async (_label, reduceMotion, screenReader) => {
    native.reduceMotion = reduceMotion;
    native.screenReader = screenReader;
    const renderer = await renderScreen();

    expect(renderer.root.find((node) => isHostType(node.type, 'Modal')).props.animationType)
      .toBe('none');
    expect(native.timing).not.toHaveBeenCalled();
    expect(native.stagger).not.toHaveBeenCalled();
    expect(readText(renderer)).toContain('2026년, 나의 지난 한 해');
    expect(readText(renderer)).toContain('10일');
    expect(readText(renderer)).toContain('8일');
    expect(readText(renderer)).toContain('12일');
  });

  it.each(['unknown', 'extension'])(
    'fails closed to static content when AppState is %s',
    async (appState) => {
      native.appState = appState;
      const renderer = await renderScreen();

      expect(renderer.root.find((node) => isHostType(node.type, 'Modal')).props.animationType)
        .toBe('none');
      expect(native.timing).not.toHaveBeenCalled();
      expect(native.stagger).not.toHaveBeenCalled();
      expect(readText(renderer)).toContain('2026년, 나의 지난 한 해');
    },
  );

  it('fails closed to static content when accessibility preferences are unavailable', async () => {
    native.preferencesReject = true;
    const renderer = await renderScreen();

    expect(renderer.root.find((node) => isHostType(node.type, 'Modal')).props.animationType)
      .toBe('none');
    expect(native.timing).not.toHaveBeenCalled();
    expect(native.stagger).not.toHaveBeenCalled();
    expect(readText(renderer)).toContain('2026년, 나의 지난 한 해');
  });

  it('announces each chapter title together with its key metric summary', async () => {
    native.screenReader = true;
    const renderer = await renderScreen();
    expect(native.announcements).not.toHaveBeenCalled();
    const gestureSurface = renderer.root.find(
      (node) => typeof node.props.onMoveShouldSetPanResponder === 'function',
    );
    expect(gestureSurface.props.onMoveShouldSetPanResponder({}, {dx: 4, dy: -80})).toBe(false);
    act(() => renderer.root.find((node) => isHostType(node.type, 'Modal')).props.onShow());
    expect(native.announcements).toHaveBeenLastCalledWith(
      '내 기록. 2026년, 나의 지난 한 해. 큐티한 날 10일, 말씀 읽은 날 8일, 기도한 날 12일',
    );
    act(() => findByLabel(renderer, '다음 회고 장면').props.onPress());

    expect(native.announcements).toHaveBeenLastCalledWith(
      '내 기록. 내가 이어온 경건생활. 큐티한 날 10일, 말씀 읽은 날 8일, 기도한 날 12일',
    );
    expect(native.announcements).toHaveBeenCalledTimes(2);
  });

  it('ignores legacy poll data across every rendered scene and keeps comment count independent', async () => {
    const legacyRecap = {
      ...RECAP,
      commentActivity: {writtenCount: 23},
      pollActivity: {
        participatedCount: 997,
        wedServicePollCount: 997,
        saturdayLeaderPollCount: 0,
        coffeePollCount: 0,
        mealPollCount: 0,
        customPollCount: 0,
        commentCount: 991,
      },
    } as YearlyRecap;
    const renderer = await renderScreen({recap: legacyRecap});
    const surface = walkAllScenes(renderer);

    expect(surface).toContain('작성한 댓글 23개');
    expect(surface.match(/작성한 댓글 23개/g)).toHaveLength(1);
    expect(surface).not.toMatch(
      /투표|poll|참여한 투표|예배 투표|리더 투표|커피 투표|밥 투표|일반 투표|997회|991개/i,
    );
  });

  it('renders an exact compact zero comment count when the field is present', async () => {
    const renderer = await renderScreen({recap: {
      ...RECAP,
      commentActivity: {writtenCount: 0},
    }});
    advanceUntilText(renderer, '내가 작성한 댓글');

    expect(readText(renderer).replace(/\s+/g, ' ')).toContain('작성한 댓글 0개');
    expect(currentSurface(renderer)).toContain('내 기록. 작성한 댓글 0개');
  });

  it('keeps devotion, prayer, and campus facts while presenting only personal copy', async () => {
    const renderer = await renderScreen({recap: {
      ...RECAP,
      campusJourney: {campuses: [{
        campusId: 10,
        campusName: '서울 캠퍼스',
        joinedDate: '2026-03-10',
        joinedDuringRecapYear: true,
      }]},
      prayerActivity: {submittedWeekCount: 22, participatedSeasonCount: 2},
    }});
    const surface = walkAllScenes(renderer);

    expect(surface).toMatch(/큐티한 날 10일/);
    expect(surface).toMatch(/말씀 읽은 날 8일/);
    expect(surface).toMatch(/기도한 날 12일/);
    expect(surface).toMatch(/QT·말씀·기도 완료 5일/);
    expect(surface).toMatch(/경건생활 제출 4주/);
    expect(surface).toMatch(/최장 연속 실천 3일/);
    expect(surface).toMatch(/가장 많이 기록한 달 8월/);
    expect(surface).toMatch(/기도제목을 제출한 주 22주/);
    expect(surface).toMatch(/내가 참여한 기도 시즌 2회/);
    expect(surface).toContain('2026년 3월 10일부터 서울 캠퍼스에서 내 여정을 시작했어요');
    expect(surface).not.toMatch(/우리의|우리 모두|캠퍼스 전체|전체 사용자|순위|상위|백분위|평균|비교/);
  });

  it.each([
    ['zero', penaltySummary({}), '내 기록. 경건 벌금 없음'],
    ['paid only', penaltySummary({
      totalCount: 2,
      totalAmount: 5_000,
      paidCount: 2,
      paidAmount: 5_000,
    }), '내 기록. 총 경건 벌금 2건 · 5,000원'],
    ['unpaid only', penaltySummary({
      totalCount: 2,
      totalAmount: 7_000,
      unpaidCount: 2,
      unpaidAmount: 7_000,
    }), '내 기록. 미납 2건 · 7,000원'],
    ['mixed', penaltySummary({
      totalCount: 3,
      totalAmount: 15_000,
      paidCount: 2,
      paidAmount: 10_000,
      unpaidCount: 1,
      unpaidAmount: 5_000,
    }), '내 기록. 납부 완료 2건 · 10,000원'],
    ['zero amount with a count', penaltySummary({
      totalCount: 1,
      paidCount: 1,
    }), '내 기록. 총 경건 벌금 1건 · 0원'],
    ['positive amount with zero count', penaltySummary({
      totalAmount: 1,
      paidAmount: 1,
    }), '내 기록. 총 경건 벌금 0건 · 1원'],
  ])('renders a neutral %s penalty state with count and KRW', async (_label, summary, fact) => {
    const renderer = await renderScreen({recap: {...RECAP, penaltySummary: summary}});
    advanceUntilText(renderer, '내 경건 벌금 정산');
    const surface = currentSurface(renderer);

    expect(surface).toContain(fact);
    if (summary.totalCount === 0 && summary.totalAmount === 0) {
      expect(readText(renderer)).toContain('경건 벌금 없음');
      expect(surface).not.toMatch(/총 경건 벌금 0건|납부 완료 0건|미납 0건/);
    } else {
      expect(surface).toContain(
        `내 기록. 총 경건 벌금 ${summary.totalCount.toLocaleString('ko-KR')}건 · ${summary.totalAmount.toLocaleString('ko-KR')}원`,
      );
      expect(surface).toContain(
        `내 기록. 납부 완료 ${summary.paidCount.toLocaleString('ko-KR')}건 · ${summary.paidAmount.toLocaleString('ko-KR')}원`,
      );
      expect(surface).toContain(
        `내 기록. 미납 ${summary.unpaidCount.toLocaleString('ko-KR')}건 · ${summary.unpaidAmount.toLocaleString('ko-KR')}원`,
      );
      const unpaid = renderer.root.find((node) =>
        node.props.accessibilityLabel?.startsWith('내 기록. 미납'));
      expect(unpaid.props.accessibilityRole).not.toBe('alert');
      expect(unpaid.props.accessibilityLiveRegion).not.toBe('assertive');
    }
    expect(surface).not.toMatch(/경고|위험|체납|빨리|즉시|불이익|납부하세요|미납자/);
  });

  it('renders maximum-safe penalty values without rounding', async () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const renderer = await renderScreen({recap: {
      ...RECAP,
      penaltySummary: penaltySummary({
        totalCount: maximum,
        totalAmount: maximum,
        paidCount: maximum - 1,
        paidAmount: maximum - 1,
        unpaidCount: 1,
        unpaidAmount: 1,
      }),
    }});
    advanceUntilText(renderer, '내 경건 벌금 정산');

    expect(currentSurface(renderer)).toContain(
      '내 기록. 총 경건 벌금 9,007,199,254,740,991건 · 9,007,199,254,740,991원',
    );
  });

  it('announces mixed and zero penalties as the signed-in user record', async () => {
    native.screenReader = true;
    const mixedRenderer = await renderScreen();
    act(() => mixedRenderer.root.find((node) => isHostType(node.type, 'Modal')).props.onShow());
    advanceUntilText(mixedRenderer, '내 경건 벌금 정산');
    expect(native.announcements).toHaveBeenLastCalledWith(
      '내 기록. 내 경건 벌금 정산. 총 경건 벌금 3건 · 15,000원, 납부 완료 2건 · 10,000원, 미납 1건 · 5,000원',
    );

    native.announcements.mockClear();
    const zeroRenderer = await renderScreen({recap: {
      ...RECAP,
      penaltySummary: penaltySummary({}),
    }});
    act(() => zeroRenderer.root.find((node) => isHostType(node.type, 'Modal')).props.onShow());
    advanceUntilText(zeroRenderer, '내 경건 벌금 정산');
    expect(native.announcements).toHaveBeenLastCalledWith(
      '내 기록. 내 경건 벌금 정산. 경건 벌금 없음',
    );
  });

  it('prefixes every rendered screen-reader chapter announcement with 내 기록', async () => {
    native.screenReader = true;
    const renderer = await renderScreen({recap: {
      ...RECAP,
      campusJourney: {campuses: [{
        campusId: 10,
        campusName: '서울 캠퍼스',
        joinedDate: '2026-03-10',
        joinedDuringRecapYear: true,
      }]},
      prayerActivity: {submittedWeekCount: 2, participatedSeasonCount: 1},
    }});
    act(() => renderer.root.find((node) => isHostType(node.type, 'Modal')).props.onShow());
    walkAllScenes(renderer);

    expect(native.announcements).toHaveBeenCalledTimes(getProgressMax(renderer));
    expect(native.announcements.mock.calls.every(([announcement]) =>
      typeof announcement === 'string' && announcement.startsWith('내 기록. ')))
      .toBe(true);
    expect(native.announcements).toHaveBeenCalledWith(expect.stringContaining(
      '서울 캠퍼스에서 내 여정을 시작했어요',
    ));
  });

  it('fails comment and penalty sections closed when their fields are absent', async () => {
    const {commentActivity: _comment, penaltySummary: _penalty, ...baseRecap} = RECAP;
    const renderer = await renderScreen({recap: baseRecap});
    const surface = walkAllScenes(renderer);

    expect(surface).toContain('내가 이어온 경건생활');
    expect(surface).not.toMatch(/작성한 댓글|경건 벌금|납부 완료|미납/);
  });

  it('keeps a screen-reader user able to navigate backward from the closing chapter', async () => {
    native.screenReader = true;
    const renderer = await renderScreen();
    act(() => renderer.root.find((node) => isHostType(node.type, 'Modal')).props.onShow());
    advanceToEnd(renderer);

    expect(findByLabel(renderer, '연간 회고 마치기')).toBeDefined();
    act(() => findByLabel(renderer, '이전 회고 장면').props.onPress());
    expect(readText(renderer)).toContain('내 경건 벌금 정산');
  });

  it('keeps large-text content scrollable, yields vertical gestures, and pauses on background', async () => {
    native.fontScale = 2;
    const renderer = await renderScreen();
    const scroll = renderer.root.findByType(ScrollView);
    const gestureSurface = renderer.root.find((node) => typeof node.props.onMoveShouldSetPanResponder === 'function');
    act(() => {
      scroll.props.onContentSizeChange(0, 1_200);
      scroll.props.onLayout({nativeEvent: {layout: {height: 400}}});
    });

    expect(gestureSurface.props.onMoveShouldSetPanResponder({}, {dx: 4, dy: -80})).toBe(false);
    expect(renderer.root.findAll((node) =>
      isHostType(node.type, 'Text') && node.props.numberOfLines !== undefined))
      .toHaveLength(0);
    const firstMetric = renderer.root.find(
      (node) => node.props.accessibilityLabel === '내 기록. 큐티한 날 10일',
    );
    expect(firstMetric.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({flexBasis: '100%'}),
    ]));
    advanceUntilText(renderer, '내 경건 벌금 정산');
    const penaltyMetric = renderer.root.find((node) =>
      node.props.accessibilityLabel === '내 기록. 총 경건 벌금 3건 · 15,000원');
    expect(penaltyMetric.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({flexBasis: '100%'}),
    ]));
    expect(scroll.findAll((node) => node.props.accessibilityLabel === '다음 회고 장면'))
      .toHaveLength(0);
    expect(native.appStateListener).not.toBeNull();
    const stopsBeforeBackground = native.animationStops.mock.calls.length;
    const timingsBeforeBackground = native.timing.mock.calls.length;
    const staggersBeforeBackground = native.stagger.mock.calls.length;
    act(() => native.appStateListener?.('background'));
    expect(native.animationStops.mock.calls.length).toBeGreaterThan(stopsBeforeBackground);
    act(() => native.appStateListener?.('active'));
    expect(native.timing).toHaveBeenCalledTimes(timingsBeforeBackground);
    expect(native.stagger).toHaveBeenCalledTimes(staggersBeforeBackground);
    const sceneBeforeWait = renderer.root.find((node) =>
      node.props.accessibilityRole === 'progressbar').props.accessibilityValue.now;
    vi.advanceTimersByTime(65_000);
    expect(renderer.root.find((node) =>
      node.props.accessibilityRole === 'progressbar').props.accessibilityValue.now)
      .toBe(sceneBeforeWait);
    expect(readText(renderer)).toContain('내 경건 벌금 정산');
    act(() => renderer.unmount());
    mounted.splice(mounted.indexOf(renderer), 1);
    expect(native.appStateRemove).toHaveBeenCalledOnce();
  });

  it('renders no recap modal for no-data, loading, or error states', async () => {
    experienceMocks.getPreviousYearRecap.mockResolvedValueOnce({...RECAP, hasRecapData: false});
    const noData = await renderExperience();
    expect(noData.root.findAll((node) => isHostType(node.type, 'Modal'))).toHaveLength(0);

    let resolveLoading!: (recap: YearlyRecap) => void;
    experienceMocks.getPreviousYearRecap.mockImplementationOnce(() =>
      new Promise<YearlyRecap>((resolve) => {
        resolveLoading = resolve;
      }));
    const loading = await renderExperience();
    expect(loading.root.findAll((node) => isHostType(node.type, 'Modal'))).toHaveLength(0);

    experienceMocks.getPreviousYearRecap.mockRejectedValueOnce(new Error('network unavailable'));
    const failed = await renderExperience();
    expect(failed.root.findAll((node) => isHostType(node.type, 'Modal'))).toHaveLength(0);
    expect(experienceMocks.markPresented).not.toHaveBeenCalled();

    await act(async () => {
      resolveLoading(RECAP);
      await Promise.resolve();
    });
  });

  it('drives the presented POST from the rendered Modal layout exactly once across A to B to A', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<RenderedExperienceProbe campusId={1} entryTarget={null} />);
      await Promise.resolve();
    });
    mounted.push(renderer);
    expect(experienceMocks.getPreviousYearRecap).toHaveBeenCalledOnce();
    expect(experienceMocks.markPresented).not.toHaveBeenCalled();

    const modal = renderer.root.find((node) => isHostType(node.type, 'Modal'));
    const scroll = renderer.root.findByType(ScrollView);
    await act(async () => {
      modal.props.onShow();
      expect(experienceMocks.markPresented).not.toHaveBeenCalled();
      scroll.props.onLayout({nativeEvent: {layout: {height: 600}}});
      scroll.props.onLayout({nativeEvent: {layout: {height: 600}}});
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(experienceMocks.markPresented).toHaveBeenCalledOnce();

    act(() => latestExperience?.close());
    act(() => renderer.update(<RenderedExperienceProbe campusId={2} entryTarget="campusSelect" />));
    act(() => renderer.update(<RenderedExperienceProbe campusId={1} entryTarget={null} />));
    expect(experienceMocks.getPreviousYearRecap).toHaveBeenCalledOnce();
    expect(experienceMocks.markPresented).toHaveBeenCalledOnce();
  });
});

function RenderedExperienceProbe({
  campusId,
  entryTarget,
}: {
  campusId: number;
  entryTarget: null | 'campusSelect';
}) {
  const experience = useYearlyRecapExperience({
    canAutoPresent: entryTarget === null,
    userId: 42,
  });
  latestExperience = experience;
  return experience.recap ? <YearlyRecapScreen
    onClose={experience.close}
    onFirstFrame={experience.markFirstFramePresented}
    recap={experience.recap}
    visible={experience.visible}
  /> : React.createElement('Probe', {campusId});
}

async function renderExperience() {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<RenderedExperienceProbe campusId={1} entryTarget={null} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  mounted.push(renderer);
  return renderer;
}

async function renderScreen(overrides: Partial<React.ComponentProps<typeof YearlyRecapScreen>> = {}) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<YearlyRecapScreen
      onClose={vi.fn()}
      onFirstFrame={vi.fn()}
      recap={RECAP}
      visible
      {...overrides}
    />, {
      createNodeMock: (element) =>
        String(element.type) === 'ScrollView' ? {scrollTo: native.scrollTo} : {},
    });
    await Promise.resolve();
  });
  mounted.push(renderer);
  return renderer;
}

function findByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
}

function readText(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => isHostType(node.type, 'Text'))
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === 'string')
    .join(' ');
}

function currentSurface(renderer: ReactTestRenderer) {
  const labels = renderer.root.findAll((node) =>
    typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string')
    .map((node) => node.props.accessibilityLabel as string);
  return `${readText(renderer)} ${labels.join(' ')}`;
}

function getProgressMax(renderer: ReactTestRenderer) {
  return renderer.root.find((node) => node.props.accessibilityRole === 'progressbar')
    .props.accessibilityValue.max as number;
}

function walkAllScenes(renderer: ReactTestRenderer) {
  const scenes: string[] = [];
  const maximum = getProgressMax(renderer);
  for (let index = 0; index < maximum; index += 1) {
    scenes.push(currentSurface(renderer));
    if (index < maximum - 1) {
      act(() => findByLabel(renderer, '다음 회고 장면').props.onPress());
    }
  }
  return scenes.join('\n');
}

function advanceUntilText(renderer: ReactTestRenderer, text: string) {
  const maximum = getProgressMax(renderer);
  for (let index = 0; index < maximum && !readText(renderer).includes(text); index += 1) {
    act(() => findByLabel(renderer, '다음 회고 장면').props.onPress());
  }
  expect(readText(renderer)).toContain(text);
}

function advanceToEnd(renderer: ReactTestRenderer) {
  const maximum = getProgressMax(renderer);
  for (let index = 1; index < maximum; index += 1) {
    act(() => findByLabel(renderer, '다음 회고 장면').props.onPress());
  }
}

function penaltySummary(
  overrides: Partial<YearlyRecapPenaltySummary>,
): YearlyRecapPenaltySummary {
  return {
    totalCount: 0,
    totalAmount: 0,
    paidCount: 0,
    paidAmount: 0,
    unpaidCount: 0,
    unpaidAmount: 0,
    ...overrides,
  };
}

function isHostType(type: unknown, name: string) {
  return typeof type === 'string' && String(type) === name;
}
