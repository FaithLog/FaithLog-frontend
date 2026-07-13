import {useSyncExternalStore} from 'react';
import {AppState, Dimensions, Keyboard, Platform, StatusBar} from 'react-native';

import {getAndroidNavigationMode} from './androidNavigationMode';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const ANDROID_MIN_BUTTON_NAV_HEIGHT = 36;
const ANDROID_MAX_STABLE_NAV_HEIGHT = 120;
const ANDROID_BUTTON_NAV_DEFAULT_INSET = 56;

export type AndroidShellLayoutInsets = {
  bottomNavInset: number;
  shellContentBottomPadding: number;
  topSafeInset: number;
};

export function getAndroidShellLayoutInsets(): AndroidShellLayoutInsets {
  return {
    bottomNavInset: getAndroidBottomNavInset(),
    shellContentBottomPadding: getAndroidShellContentBottomPadding(),
    topSafeInset: getAndroidTopSafeInset(),
  };
}

export function useAndroidShellLayoutInsets() {
  return useSyncExternalStore(
    androidShellLayoutStore.subscribe,
    androidShellLayoutStore.getSnapshot,
    androidShellLayoutStore.getServerSnapshot,
  );
}

type StoreListener = () => void;

function createAndroidShellLayoutStore() {
  let snapshot = getAndroidShellLayoutInsets();
  let cleanup: (() => void) | null = null;
  let keyboardVisible = false;
  const listeners = new Set<StoreListener>();

  const refresh = () => {
    if (keyboardVisible) return;
    const next = getAndroidShellLayoutInsets();
    if (
      next.bottomNavInset === snapshot.bottomNavInset &&
      next.shellContentBottomPadding === snapshot.shellContentBottomPadding &&
      next.topSafeInset === snapshot.topSafeInset
    ) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const start = () => {
    if (Platform.OS !== 'android' || cleanup) return;
    const refreshTimers = new Set<ReturnType<typeof setTimeout>>();
    const scheduleRefresh = (delayMs: number) => {
      const timer = setTimeout(() => {
        refreshTimers.delete(timer);
        refresh();
      }, delayMs);
      refreshTimers.add(timer);
    };
    const subscriptions = [
      AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') refresh();
      }),
      Dimensions.addEventListener('change', refresh),
      Keyboard.addListener('keyboardDidShow', () => {
        keyboardVisible = true;
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        keyboardVisible = false;
        refresh();
        scheduleRefresh(80);
        scheduleRefresh(240);
      }),
    ];
    refresh();
    cleanup = () => {
      refreshTimers.forEach((timer) => clearTimeout(timer));
      subscriptions.forEach((subscription) => subscription.remove());
      keyboardVisible = false;
      cleanup = null;
    };
  };

  return {
    getServerSnapshot: () => snapshot,
    getSnapshot: () => snapshot,
    subscribe(listener: StoreListener) {
      listeners.add(listener);
      start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) cleanup?.();
      };
    },
  };
}

const androidShellLayoutStore = createAndroidShellLayoutStore();

export function getAndroidTopSafeInset() {
  if (Platform.OS !== 'android') {
    return 0;
  }

  const statusBarHeight = StatusBar.currentHeight ?? 24;
  return clamp(statusBarHeight + 8, 30, 42);
}

export function getAndroidBottomNavInset() {
  if (Platform.OS !== 'android') {
    return 0;
  }

  const navigationBarHeight = getAndroidNavigationBarHeight();
  const navigationMode = getAndroidNavigationMode();

  if (navigationMode === 'buttons') {
    return getAndroidButtonNavigationInset(navigationBarHeight);
  }

  if (navigationMode === 'gesture') {
    return getAndroidGestureNavigationInset(navigationBarHeight);
  }

  if (
    navigationBarHeight >= ANDROID_MIN_BUTTON_NAV_HEIGHT &&
    navigationBarHeight <= ANDROID_MAX_STABLE_NAV_HEIGHT
  ) {
    return getAndroidButtonNavigationInset(navigationBarHeight);
  }

  return getAndroidGestureNavigationInset(navigationBarHeight);
}

export function getAndroidShellContentBottomPadding() {
  if (Platform.OS !== 'android') {
    return 0;
  }

  return 84 + getAndroidBottomNavInset();
}

export function getAndroidShellKeyboardBottomPadding() {
  if (Platform.OS !== 'android') {
    return 0;
  }

  const windowHeight = Dimensions.get('window').height;
  return clamp(Math.round(windowHeight * 0.12), 96, 132);
}

function getAndroidNavigationBarHeight() {
  const windowHeight = Dimensions.get('window').height;
  const screenHeight = Dimensions.get('screen').height;
  const statusBarHeight = StatusBar.currentHeight ?? 24;
  const navigationBarHeight = screenHeight - windowHeight - statusBarHeight;

  return Math.max(0, Math.round(navigationBarHeight));
}

function getAndroidButtonNavigationInset(navigationBarHeight: number) {
  const baseInset =
    navigationBarHeight >= ANDROID_MIN_BUTTON_NAV_HEIGHT
      ? navigationBarHeight
      : ANDROID_BUTTON_NAV_DEFAULT_INSET;

  return clamp(Math.round(baseInset) + 8, 48, 72);
}

function getAndroidGestureNavigationInset(navigationBarHeight: number) {
  if (navigationBarHeight > 0 && navigationBarHeight < ANDROID_MIN_BUTTON_NAV_HEIGHT) {
    return clamp(
      Math.round(navigationBarHeight * 0.5) + getAndroidBottomFloatingGap('gesture'),
      18,
      30,
    );
  }

  return getAndroidBottomFloatingGap('gesture');
}

function getAndroidBottomFloatingGap(mode: 'buttons' | 'gesture') {
  const windowHeight = Dimensions.get('window').height;
  const ratio = mode === 'buttons' ? 0.012 : 0.014;
  const maxGap = mode === 'buttons' ? 16 : 18;

  return clamp(Math.round(windowHeight * ratio), 10, maxGap);
}
