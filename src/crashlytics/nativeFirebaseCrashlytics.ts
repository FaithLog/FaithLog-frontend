import {NativeModules, Platform} from 'react-native';

type CrashlyticsModule = typeof import('@react-native-firebase/crashlytics');

let initializationPromise: Promise<void> | null = null;

export function initializeNativeFirebaseCrashlytics() {
  if (Platform.OS === 'web' || !hasNativeFirebaseCrashlyticsModule()) {
    return Promise.resolve();
  }

  initializationPromise ??= setupNativeFirebaseCrashlytics();
  return initializationPromise;
}

async function setupNativeFirebaseCrashlytics() {
  try {
    const crashlyticsModule: CrashlyticsModule = await import(
      '@react-native-firebase/crashlytics'
    );
    const crashlytics = crashlyticsModule.getCrashlytics();

    await crashlyticsModule.setCrashlyticsCollectionEnabled(
      crashlytics,
      process.env.EXPO_PUBLIC_APP_ENV === 'production',
    );
  } catch {
    // Crash reporting must never block startup or expose native/config details in logs.
  }
}

function hasNativeFirebaseCrashlyticsModule() {
  return Boolean(
    NativeModules.RNFBAppModule && NativeModules.RNFBCrashlyticsModule,
  );
}

export function resetNativeFirebaseCrashlyticsForTests() {
  initializationPromise = null;
}
