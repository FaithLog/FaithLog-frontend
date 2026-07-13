import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  appStateHandlers: [] as Array<(state: string) => void>,
  dimensionHandlers: [] as Array<() => void>,
  keyboardHandlers: new Map<string, Array<() => void>>(),
  removals: [] as Array<ReturnType<typeof vi.fn>>,
}));

function subscription() {
  const remove = vi.fn();
  mocks.removals.push(remove);
  return {remove};
}

vi.mock('react', () => ({useSyncExternalStore: vi.fn()}));
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: vi.fn((_event: string, handler: (state: string) => void) => {
      mocks.appStateHandlers.push(handler);
      return subscription();
    }),
  },
  Dimensions: {
    addEventListener: vi.fn((_event: string, handler: () => void) => {
      mocks.dimensionHandlers.push(handler);
      return subscription();
    }),
    get: (kind: string) => ({height: kind === 'screen' ? 844 : 820, width: 390}),
  },
  Keyboard: {
    addListener: vi.fn((event: string, handler: () => void) => {
      const handlers = mocks.keyboardHandlers.get(event) ?? [];
      handlers.push(handler);
      mocks.keyboardHandlers.set(event, handlers);
      return subscription();
    }),
  },
  NativeModules: {AndroidNavigationMode: {navigationMode: 'gesture'}},
  Platform: {OS: 'android'},
  StatusBar: {currentHeight: 24},
}));

import {AppState, Dimensions, Keyboard} from 'react-native';
import {createAndroidShellLayoutStore} from './shellLayout';

describe('Android shell layout singleton store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.appStateHandlers.length = 0;
    mocks.dimensionHandlers.length = 0;
    mocks.keyboardHandlers.clear();
    mocks.removals.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => vi.useRealTimers());

  it('installs one global listener set for multiple subscribers', () => {
    const store = createAndroidShellLayoutStore();
    const unsubscribeA = store.subscribe(vi.fn());
    const unsubscribeB = store.subscribe(vi.fn());

    expect(AppState.addEventListener).toHaveBeenCalledOnce();
    expect(Dimensions.addEventListener).toHaveBeenCalledOnce();
    expect(Keyboard.addListener).toHaveBeenCalledTimes(2);
    unsubscribeA();
    expect(mocks.removals.every((remove) => !remove.mock.calls.length)).toBe(true);
    unsubscribeB();
  });

  it('removes the global listener set after the last subscriber', () => {
    const store = createAndroidShellLayoutStore();
    const unsubscribeA = store.subscribe(vi.fn());
    const unsubscribeB = store.subscribe(vi.fn());
    unsubscribeA();
    unsubscribeB();
    expect(mocks.removals).toHaveLength(4);
    expect(mocks.removals.every((remove) => remove.mock.calls.length === 1)).toBe(true);
  });

  it('supports StrictMode setup-cleanup-setup without retaining listeners', () => {
    const store = createAndroidShellLayoutStore();
    store.subscribe(vi.fn())();
    const unsubscribe = store.subscribe(vi.fn());
    expect(AppState.addEventListener).toHaveBeenCalledTimes(2);
    expect(Dimensions.addEventListener).toHaveBeenCalledTimes(2);
    expect(Keyboard.addListener).toHaveBeenCalledTimes(4);
    expect(mocks.removals.slice(0, 4).every((remove) => remove.mock.calls.length === 1)).toBe(true);
    unsubscribe();
  });

  it('cancels both delayed keyboard-hide refresh timers during cleanup', () => {
    const store = createAndroidShellLayoutStore();
    const unsubscribe = store.subscribe(vi.fn());
    mocks.keyboardHandlers.get('keyboardDidHide')?.[0]?.();
    expect(vi.getTimerCount()).toBe(2);
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(240);
    expect(vi.getTimerCount()).toBe(0);
  });
});
