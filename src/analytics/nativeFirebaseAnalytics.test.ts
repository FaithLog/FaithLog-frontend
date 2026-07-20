import {beforeEach, describe, expect, it, vi} from 'vitest';

const {firebaseAnalytics, reactNative} = vi.hoisted(() => ({
  firebaseAnalytics: {
    getAnalytics: vi.fn(),
    logEvent: vi.fn(),
    logLogin: vi.fn(),
    logScreenView: vi.fn(),
    logSignUp: vi.fn(),
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
  logNativeAnalyticsEvent,
  logNativeAnalyticsScreen,
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
    firebaseAnalytics.logEvent.mockResolvedValue(undefined);
    firebaseAnalytics.logLogin.mockResolvedValue(undefined);
    firebaseAnalytics.logScreenView.mockResolvedValue(undefined);
    firebaseAnalytics.logSignUp.mockResolvedValue(undefined);
    firebaseAnalytics.setAnalyticsCollectionEnabled.mockResolvedValue(undefined);
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
  });

  it('disables collection outside production and never sends app events', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';

    await initializeNativeFirebaseAnalytics();
    await logNativeAnalyticsEvent({name: 'login', parameters: {method: 'email'}});
    await logNativeAnalyticsScreen('login');

    expect(firebaseAnalytics.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(
      {app: 'default'},
      false,
    );
    expect(firebaseAnalytics.logEvent).not.toHaveBeenCalled();
    expect(firebaseAnalytics.logLogin).not.toHaveBeenCalled();
    expect(firebaseAnalytics.logScreenView).not.toHaveBeenCalled();
    expect(firebaseAnalytics.logSignUp).not.toHaveBeenCalled();
  });

  it('uses Firebase recommended login and sign-up helpers in production', async () => {
    await logNativeAnalyticsEvent({name: 'login', parameters: {method: 'email'}});
    await logNativeAnalyticsEvent({name: 'sign_up', parameters: {method: 'email'}});

    expect(firebaseAnalytics.logLogin).toHaveBeenCalledWith(
      {app: 'default'},
      {method: 'email'},
    );
    expect(firebaseAnalytics.logSignUp).toHaveBeenCalledWith(
      {app: 'default'},
      {method: 'email'},
    );
  });

  it('sends production events through the existing default Firebase app', async () => {
    await logNativeAnalyticsEvent({
      name: 'poll_response_complete',
      parameters: {action_result: 'success', poll_type: 'meal'},
    });
    await logNativeAnalyticsScreen('poll_detail');

    expect(firebaseAnalytics.logEvent).toHaveBeenCalledWith(
      {app: 'default'},
      'poll_response_complete',
      {action_result: 'success', poll_type: 'meal'},
    );
    expect(firebaseAnalytics.logScreenView).toHaveBeenCalledWith(
      {app: 'default'},
      {screen_class: 'poll_detail', screen_name: 'poll_detail'},
    );
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
