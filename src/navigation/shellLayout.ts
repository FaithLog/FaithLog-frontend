import {Dimensions, Platform, StatusBar} from 'react-native';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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

  if (navigationBarHeight >= 36) {
    return clamp(navigationBarHeight + getAndroidBottomFloatingGap('buttons'), 48, 78);
  }

  return getAndroidBottomFloatingGap('gesture');
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

function getAndroidBottomFloatingGap(mode: 'buttons' | 'gesture') {
  const windowHeight = Dimensions.get('window').height;
  const ratio = mode === 'buttons' ? 0.012 : 0.014;
  const maxGap = mode === 'buttons' ? 16 : 18;

  return clamp(Math.round(windowHeight * ratio), 10, maxGap);
}
