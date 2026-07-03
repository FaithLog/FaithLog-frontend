import {Dimensions, Platform, StatusBar} from 'react-native';

const windowHeight = Dimensions.get('window').height;

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

  return clamp(Math.round(windowHeight * 0.012), 8, 16);
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

  return 300;
}
