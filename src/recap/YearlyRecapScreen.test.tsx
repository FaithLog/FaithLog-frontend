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
import type {YearlyRecap} from './yearlyRecapTypes';

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
  pollActivity: {
    participatedCount: 0,
    wedServicePollCount: 0,
    saturdayLeaderPollCount: 0,
    coffeePollCount: 0,
    mealPollCount: 0,
    customPollCount: 0,
    commentCount: 0,
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
    expect(readText(renderer)).toContain('2026년, FaithLog와 함께한 기록');
    native.scrollTo.mockClear();
    act(() => findByLabel(renderer, '다음 회고 장면').props.onPress());
    expect(native.scrollTo).toHaveBeenCalledWith({animated: false, y: 0});
    expect(readText(renderer)).toContain('매일의 작은 실천이 모였어요');
    expect(native.stagger).toHaveBeenCalledOnce();

    const gestureSurface = renderer.root.find((node) => typeof node.props.onPanResponderRelease === 'function');
    expect(gestureSurface.props.onMoveShouldSetPanResponder({}, {dx: 100, dy: -20})).toBe(false);
    expect(gestureSurface.props.onMoveShouldSetPanResponder({}, {dx: 4, dy: -80})).toBe(true);
    act(() => gestureSurface.props.onPanResponderRelease({}, {dx: 4, dy: -60}));
    expect(readText(renderer)).toContain('이어온 믿음의 리듬');
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
    expect(readText(renderer)).toContain('2026년, FaithLog와 함께한 기록');
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
      expect(readText(renderer)).toContain('2026년, FaithLog와 함께한 기록');
    },
  );

  it('fails closed to static content when accessibility preferences are unavailable', async () => {
    native.preferencesReject = true;
    const renderer = await renderScreen();

    expect(renderer.root.find((node) => isHostType(node.type, 'Modal')).props.animationType)
      .toBe('none');
    expect(native.timing).not.toHaveBeenCalled();
    expect(native.stagger).not.toHaveBeenCalled();
    expect(readText(renderer)).toContain('2026년, FaithLog와 함께한 기록');
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
      '2026년, FaithLog와 함께한 기록. 큐티한 날 10일, 말씀 읽은 날 8일, 기도한 날 12일',
    );
    act(() => findByLabel(renderer, '다음 회고 장면').props.onPress());

    expect(native.announcements).toHaveBeenLastCalledWith(
      '매일의 작은 실천이 모였어요. 큐티한 날 10일, 말씀 읽은 날 8일, 기도한 날 12일',
    );
    expect(native.announcements).toHaveBeenCalledTimes(2);
  });

  it('keeps a screen-reader user able to navigate backward from the closing chapter', async () => {
    native.screenReader = true;
    const renderer = await renderScreen();
    act(() => renderer.root.find((node) => isHostType(node.type, 'Modal')).props.onShow());
    act(() => findByLabel(renderer, '다음 회고 장면').props.onPress());
    act(() => findByLabel(renderer, '다음 회고 장면').props.onPress());
    act(() => findByLabel(renderer, '다음 회고 장면').props.onPress());

    expect(findByLabel(renderer, '연간 회고 마치기')).toBeDefined();
    act(() => findByLabel(renderer, '이전 회고 장면').props.onPress());
    expect(readText(renderer)).toContain('이어온 믿음의 리듬');
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
      (node) => node.props.accessibilityLabel === '큐티한 날 10일',
    );
    expect(firstMetric.props.style).toEqual(expect.arrayContaining([
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
    vi.advanceTimersByTime(65_000);
    expect(readText(renderer)).toContain('2026년, FaithLog와 함께한 기록');
    act(() => renderer.unmount());
    mounted.splice(mounted.indexOf(renderer), 1);
    expect(native.appStateRemove).toHaveBeenCalledOnce();
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

    const scroll = renderer.root.findByType(ScrollView);
    await act(async () => {
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

function isHostType(type: unknown, name: string) {
  return typeof type === 'string' && String(type) === name;
}
