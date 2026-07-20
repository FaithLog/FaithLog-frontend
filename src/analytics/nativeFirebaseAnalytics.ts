import {NativeModules, Platform} from 'react-native';

import {
  type AnalyticsEvent,
  type AnalyticsScreenName,
  isAllowedAnalyticsEvent,
  isAnalyticsScreenName,
} from './analyticsContract';

type AnalyticsModule = typeof import('@react-native-firebase/analytics');

type AnalyticsClient = {
  analytics: ReturnType<AnalyticsModule['getAnalytics']>;
  module: AnalyticsModule;
};

let clientPromise: Promise<AnalyticsClient | null> | null = null;

export function initializeNativeFirebaseAnalytics() {
  if (Platform.OS === 'web' || !hasNativeFirebaseAnalyticsModule()) {
    return Promise.resolve();
  }

  return getAnalyticsClient().then(() => undefined);
}

function hasNativeFirebaseAnalyticsModule() {
  return Boolean(NativeModules.RNFBAppModule && NativeModules.RNFBAnalyticsModule);
}

async function getAnalyticsClient(): Promise<AnalyticsClient | null> {
  if (Platform.OS === 'web' || !hasNativeFirebaseAnalyticsModule()) return null;

  clientPromise ??= setupNativeFirebaseAnalytics();
  return clientPromise;
}

async function setupNativeFirebaseAnalytics(): Promise<AnalyticsClient | null> {
  try {
    const analyticsModule: AnalyticsModule = await import('@react-native-firebase/analytics');
    const analytics = analyticsModule.getAnalytics();
    const production = isProductionAnalyticsEnvironment();

    await analyticsModule.setAnalyticsCollectionEnabled(analytics, production);
    return production ? {analytics, module: analyticsModule} : null;
  } catch {
    // Analytics must never block app startup or expose native/config details in logs.
    return null;
  }
}

export async function logNativeAnalyticsEvent(event: AnalyticsEvent) {
  if (!isAllowedAnalyticsEvent(event)) return;

  try {
    const client = await getAnalyticsClient();
    if (!client) return;
    if (event.name === 'login') {
      await client.module.logLogin(client.analytics, event.parameters);
      return;
    }
    if (event.name === 'sign_up') {
      await client.module.logSignUp(client.analytics, event.parameters);
      return;
    }
    await client.module.logEvent(client.analytics, event.name, event.parameters);
  } catch {
    // Analytics failures are intentionally isolated from product flows and logs.
  }
}

export async function logNativeAnalyticsScreen(screenName: AnalyticsScreenName) {
  if (!isAnalyticsScreenName(screenName)) return;

  try {
    const client = await getAnalyticsClient();
    if (!client) return;
    await client.module.logScreenView(client.analytics, {
      screen_class: screenName,
      screen_name: screenName,
    });
  } catch {
    // Analytics failures are intentionally isolated from product flows and logs.
  }
}

function isProductionAnalyticsEnvironment() {
  return process.env.EXPO_PUBLIC_APP_ENV === 'production';
}

export function resetNativeFirebaseAnalyticsForTests() {
  clientPromise = null;
}
