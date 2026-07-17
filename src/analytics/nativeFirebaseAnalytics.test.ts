import {beforeEach, describe, expect, it, vi} from 'vitest';

const {firebaseAnalytics, reactNative} = vi.hoisted(() => ({
  firebaseAnalytics: {
    getAnalytics: vi.fn(),
    setAnalyticsCollectionEnabled: vi.fn(),
  },
  reactNative: {
    NativeModules: {
      RNFBAnalyticsModule: {} as object | undefined,
      RNFBAppModule: {} as object | undefined,
    },
    Platform: {OS: 'ios'},
  },
}));

vi.mock('react-native', () => reactNative);
vi.mock('@react-native-firebase/analytics', () => firebaseAnalytics);

import {
  initializeNativeFirebaseAnalytics,
  resetNativeFirebaseAnalyticsForTests,
} from './nativeFirebaseAnalytics';

describe('native Firebase Analytics initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNativeFirebaseAnalyticsForTests();
    reactNative.Platform.OS = 'ios';
    reactNative.NativeModules.RNFBAppModule = {};
    reactNative.NativeModules.RNFBAnalyticsModule = {};
    firebaseAnalytics.getAnalytics.mockReturnValue({app: 'default'});
    firebaseAnalytics.setAnalyticsCollectionEnabled.mockResolvedValue(undefined);
  });

  it('reuses the default native Firebase app and enables automatic collection once', async () => {
    await Promise.all([
      initializeNativeFirebaseAnalytics(),
      initializeNativeFirebaseAnalytics(),
    ]);

    expect(firebaseAnalytics.getAnalytics).toHaveBeenCalledOnce();
    expect(firebaseAnalytics.getAnalytics).toHaveBeenCalledWith();
    expect(firebaseAnalytics.setAnalyticsCollectionEnabled).toHaveBeenCalledOnce();
    expect(firebaseAnalytics.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(
      {app: 'default'},
      true,
    );
  });

  it('does nothing on web or when either native Firebase module is unavailable', async () => {
    reactNative.Platform.OS = 'web';
    await initializeNativeFirebaseAnalytics();

    resetNativeFirebaseAnalyticsForTests();
    reactNative.Platform.OS = 'ios';
    reactNative.NativeModules.RNFBAnalyticsModule = undefined;
    await initializeNativeFirebaseAnalytics();

    expect(firebaseAnalytics.getAnalytics).not.toHaveBeenCalled();
    expect(firebaseAnalytics.setAnalyticsCollectionEnabled).not.toHaveBeenCalled();
  });

  it('fails closed without logging identifiers when native setup rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    firebaseAnalytics.setAnalyticsCollectionEnabled.mockRejectedValueOnce(
      new Error('native setup failed'),
    );

    await expect(initializeNativeFirebaseAnalytics()).resolves.toBeUndefined();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();

    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});
