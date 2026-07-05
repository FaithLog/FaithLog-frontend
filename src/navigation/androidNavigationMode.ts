import {NativeModules, Platform} from 'react-native';

export type AndroidNavigationMode = 'buttons' | 'gesture' | 'unknown';

type AndroidNavigationModeNativeModule = {
  getNavigationMode?: () => unknown;
  navigationMode?: unknown;
};

function isAndroidNavigationMode(value: unknown): value is AndroidNavigationMode {
  return value === 'buttons' || value === 'gesture' || value === 'unknown';
}

export function getAndroidNavigationMode(): AndroidNavigationMode {
  if (Platform.OS !== 'android') {
    return 'unknown';
  }

  const nativeModule = NativeModules.AndroidNavigationMode as
    | AndroidNavigationModeNativeModule
    | undefined;

  try {
    const methodValue = nativeModule?.getNavigationMode?.();

    if (isAndroidNavigationMode(methodValue)) {
      return methodValue;
    }
  } catch {
    // Fall back to constants or layout heuristics when native settings are unavailable.
  }

  if (isAndroidNavigationMode(nativeModule?.navigationMode)) {
    return nativeModule.navigationMode;
  }

  return 'unknown';
}
