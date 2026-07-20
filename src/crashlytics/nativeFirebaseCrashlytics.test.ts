import {beforeEach, describe, expect, it, vi} from 'vitest';

const {firebaseCrashlytics, reactNative} = vi.hoisted(() => ({
  firebaseCrashlytics: {
    getCrashlytics: vi.fn(),
    setCrashlyticsCollectionEnabled: vi.fn(),
  },
  reactNative: {
    NativeModules: {
      RNFBAppModule: {} as object | undefined,
      RNFBCrashlyticsModule: {} as object | undefined,
    },
    Platform: {OS: 'ios'},
  },
}));

vi.mock('react-native', () => reactNative);
vi.mock('@react-native-firebase/crashlytics', () => firebaseCrashlytics);

import {
  initializeNativeFirebaseCrashlytics,
  resetNativeFirebaseCrashlyticsForTests,
} from './nativeFirebaseCrashlytics';

describe('native Firebase Crashlytics initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNativeFirebaseCrashlyticsForTests();
    reactNative.Platform.OS = 'ios';
    reactNative.NativeModules.RNFBAppModule = {};
    reactNative.NativeModules.RNFBCrashlyticsModule = {};
    firebaseCrashlytics.getCrashlytics.mockReturnValue({app: 'default'});
    firebaseCrashlytics.setCrashlyticsCollectionEnabled.mockResolvedValue(undefined);
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
  });

  it('enables production collection once on the existing default Firebase app', async () => {
    await Promise.all([
      initializeNativeFirebaseCrashlytics(),
      initializeNativeFirebaseCrashlytics(),
    ]);

    expect(firebaseCrashlytics.getCrashlytics).toHaveBeenCalledOnce();
    expect(firebaseCrashlytics.getCrashlytics).toHaveBeenCalledWith();
    expect(firebaseCrashlytics.setCrashlyticsCollectionEnabled).toHaveBeenCalledOnce();
    expect(firebaseCrashlytics.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(
      {app: 'default'},
      true,
    );
  });

  it('disables collection outside production', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';

    await initializeNativeFirebaseCrashlytics();

    expect(firebaseCrashlytics.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(
      {app: 'default'},
      false,
    );
  });

  it('does nothing on web or when either native Firebase module is unavailable', async () => {
    reactNative.Platform.OS = 'web';
    await initializeNativeFirebaseCrashlytics();

    resetNativeFirebaseCrashlyticsForTests();
    reactNative.Platform.OS = 'android';
    reactNative.NativeModules.RNFBCrashlyticsModule = undefined;
    await initializeNativeFirebaseCrashlytics();

    expect(firebaseCrashlytics.getCrashlytics).not.toHaveBeenCalled();
    expect(firebaseCrashlytics.setCrashlyticsCollectionEnabled).not.toHaveBeenCalled();
  });

  it('never blocks startup or logs the native error when setup rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    firebaseCrashlytics.setCrashlyticsCollectionEnabled.mockRejectedValueOnce(
      new Error('native setup failed with private context'),
    );

    await expect(initializeNativeFirebaseCrashlytics()).resolves.toBeUndefined();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();

    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});
