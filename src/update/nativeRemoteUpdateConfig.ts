import remoteConfig from '@react-native-firebase/remote-config';
import * as Application from 'expo-application';
import {NativeModules, Platform} from 'react-native';

import {
  readRemoteUpdateConfig,
  resolveUpdateRequirement,
  type RemoteUpdateValueReader,
  type UpdateRequirement,
} from './updateConfig';

const REMOTE_CONFIG_FETCH_TIMEOUT_MS = 10_000;
const REMOTE_CONFIG_MINIMUM_FETCH_INTERVAL_MS = 15 * 60 * 1_000;

export async function loadNativeUpdateRequirement(): Promise<UpdateRequirement> {
  if (
    !isProductionEnvironment() ||
    (Platform.OS !== 'android' && Platform.OS !== 'ios') ||
    !NativeModules.RNFBAppModule ||
    !NativeModules.RNFBRemoteConfigModule
  ) {
    return {required: false};
  }

  try {
    const instance = remoteConfig();
    try {
      await instance.setConfigSettings({
        fetchTimeMillis: REMOTE_CONFIG_FETCH_TIMEOUT_MS,
        minimumFetchIntervalMillis: REMOTE_CONFIG_MINIMUM_FETCH_INTERVAL_MS,
      });
    } catch {
      // The fetch can still use SDK defaults or the last activated cache.
    }

    const reader: RemoteUpdateValueReader = {
      async setDefaults(values) {
        await instance.setDefaults(values);
      },
      fetchAndActivate: () => instance.fetchAndActivate(),
      getString: (key) => instance.getValue(key).asString(),
    };
    const snapshot = await readRemoteUpdateConfig(reader);

    return resolveUpdateRequirement({
      platform: Platform.OS,
      currentBuild: Application.nativeBuildVersion,
      snapshot,
    });
  } catch {
    // Remote Config and native build failures are intentionally fail-open and never logged raw.
    return {required: false};
  }
}

function isProductionEnvironment() {
  return process.env.EXPO_PUBLIC_APP_ENV === 'production';
}
