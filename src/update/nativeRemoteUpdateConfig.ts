import {fetchAndActivate, getRemoteConfig, getValue} from '@react-native-firebase/remote-config';
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

type NativeUpdateCheckOptions = {
  bypassCache?: boolean;
};

export async function loadNativeUpdateRequirement(
  {bypassCache = false}: NativeUpdateCheckOptions = {},
): Promise<UpdateRequirement> {
  if (
    !isProductionEnvironment() ||
    (Platform.OS !== 'android' && Platform.OS !== 'ios') ||
    !NativeModules.RNFBAppModule ||
    !NativeModules.RNFBConfigModule
  ) {
    return {required: false};
  }

  try {
    const instance = getRemoteConfig();
    try {
      instance.settings = {
        fetchTimeoutMillis: REMOTE_CONFIG_FETCH_TIMEOUT_MS,
        minimumFetchIntervalMillis: bypassCache ? 0 : REMOTE_CONFIG_MINIMUM_FETCH_INTERVAL_MS,
      };
    } catch {
      // The fetch can still use SDK defaults or the last activated cache.
    }

    const reader: RemoteUpdateValueReader = {
      async setDefaults(values) {
        instance.defaultConfig = values;
      },
      fetchAndActivate: () => fetchAndActivate(instance),
      getString: (key) => getValue(instance, key).asString(),
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
