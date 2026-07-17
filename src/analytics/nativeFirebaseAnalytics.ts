import {NativeModules, Platform} from 'react-native';

type AnalyticsModule = typeof import('@react-native-firebase/analytics');

let initializationPromise: Promise<void> | null = null;

export function initializeNativeFirebaseAnalytics() {
  if (Platform.OS === 'web' || !hasNativeFirebaseAnalyticsModule()) {
    return Promise.resolve();
  }

  initializationPromise ??= setupNativeFirebaseAnalytics();

  return initializationPromise;
}

function hasNativeFirebaseAnalyticsModule() {
  return Boolean(NativeModules.RNFBAppModule && NativeModules.RNFBAnalyticsModule);
}

async function setupNativeFirebaseAnalytics() {
  try {
    const analyticsModule: AnalyticsModule = await import('@react-native-firebase/analytics');
    const analytics = analyticsModule.getAnalytics();

    await analyticsModule.setAnalyticsCollectionEnabled(analytics, true);
  } catch {
    // Analytics must never block app startup or expose native/config details in logs.
  }
}

export function resetNativeFirebaseAnalyticsForTests() {
  initializationPromise = null;
}
