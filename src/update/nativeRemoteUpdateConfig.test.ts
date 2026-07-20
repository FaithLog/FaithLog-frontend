import {beforeEach, describe, expect, it, vi} from 'vitest';

const {application, firebaseRemoteConfig, reactNative, remoteConfigInstance} = vi.hoisted(() => {
  const instance = {
    fetchAndActivate: vi.fn(),
    getValue: vi.fn(),
    setConfigSettings: vi.fn(),
    setDefaults: vi.fn(),
  };
  return {
    application: {nativeBuildVersion: '35' as string | null},
    firebaseRemoteConfig: vi.fn(() => instance),
    reactNative: {
      NativeModules: {
        RNFBAppModule: {} as object | undefined,
        RNFBRemoteConfigModule: {} as object | undefined,
      },
      Platform: {OS: 'android'},
    },
    remoteConfigInstance: instance,
  };
});

vi.mock('expo-application', () => application);
vi.mock('react-native', () => reactNative);
vi.mock('@react-native-firebase/remote-config', () => ({default: firebaseRemoteConfig}));

import {loadNativeUpdateRequirement} from './nativeRemoteUpdateConfig';
import {DEFAULT_REMOTE_UPDATE_VALUES} from './updateConfig';

describe('loadNativeUpdateRequirement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    application.nativeBuildVersion = '35';
    reactNative.Platform.OS = 'android';
    reactNative.NativeModules.RNFBAppModule = {};
    reactNative.NativeModules.RNFBRemoteConfigModule = {};
    remoteConfigInstance.setConfigSettings.mockResolvedValue(undefined);
    remoteConfigInstance.setDefaults.mockResolvedValue(null);
    remoteConfigInstance.fetchAndActivate.mockResolvedValue(true);
    remoteConfigInstance.getValue.mockImplementation((key: keyof typeof DEFAULT_REMOTE_UPDATE_VALUES) => ({
      asString: () => DEFAULT_REMOTE_UPDATE_VALUES[key],
    }));
  });

  it('reuses the default Firebase app and resolves the Android native build', async () => {
    remoteConfigInstance.getValue.mockImplementation((key: keyof typeof DEFAULT_REMOTE_UPDATE_VALUES) => ({
      asString: () => key === 'android_min_build' ? '36' : DEFAULT_REMOTE_UPDATE_VALUES[key],
    }));

    await expect(loadNativeUpdateRequirement()).resolves.toMatchObject({required: true});

    expect(firebaseRemoteConfig).toHaveBeenCalledWith();
    expect(remoteConfigInstance.setDefaults).toHaveBeenCalledWith(DEFAULT_REMOTE_UPDATE_VALUES);
    expect(remoteConfigInstance.fetchAndActivate).toHaveBeenCalledTimes(1);
  });

  it('uses iOS build and minimum independently', async () => {
    reactNative.Platform.OS = 'ios';
    application.nativeBuildVersion = '13';
    remoteConfigInstance.getValue.mockImplementation((key: keyof typeof DEFAULT_REMOTE_UPDATE_VALUES) => ({
      asString: () => key === 'ios_min_build' ? '14' : DEFAULT_REMOTE_UPDATE_VALUES[key],
    }));

    await expect(loadNativeUpdateRequirement()).resolves.toMatchObject({
      required: true,
      storeUrl: DEFAULT_REMOTE_UPDATE_VALUES.ios_store_url,
    });
  });

  it('does not fetch Remote Config outside production', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';

    await expect(loadNativeUpdateRequirement()).resolves.toEqual({required: false});
    expect(firebaseRemoteConfig).not.toHaveBeenCalled();
  });

  it('fails open without a supported native module', async () => {
    reactNative.NativeModules.RNFBRemoteConfigModule = undefined;

    await expect(loadNativeUpdateRequirement()).resolves.toEqual({required: false});
    expect(firebaseRemoteConfig).not.toHaveBeenCalled();
  });

  it('uses activated cache when fetch fails', async () => {
    remoteConfigInstance.fetchAndActivate.mockRejectedValue(new Error('offline'));
    remoteConfigInstance.getValue.mockImplementation((key: keyof typeof DEFAULT_REMOTE_UPDATE_VALUES) => ({
      asString: () => key === 'android_min_build' ? '36' : DEFAULT_REMOTE_UPDATE_VALUES[key],
    }));

    await expect(loadNativeUpdateRequirement()).resolves.toMatchObject({required: true});
  });

  it('fails open without logging raw native errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    firebaseRemoteConfig.mockImplementationOnce(() => {
      throw new Error('native credential details');
    });

    await expect(loadNativeUpdateRequirement()).resolves.toEqual({required: false});
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();

    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});
