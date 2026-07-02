import {NativeModules, Platform} from 'react-native';

import {
  setDeviceFcmTokenProvider,
  setDeviceFcmTokenRefreshSubscriber,
  setInitialNotificationOpenPayloadProvider,
  setNotificationOpenPayloadSubscriber,
} from './notificationAdapter';
import {isFcmRuntimeEnabled} from './fcmEnvironment';

import type {RemoteMessage} from '@react-native-firebase/messaging';

type MessagingModule = typeof import('@react-native-firebase/messaging');
type MessagingInstance = ReturnType<MessagingModule['getMessaging']>;

const pushParamKeys = [
  'campusId',
  'pollId',
  'targetId',
  'targetWeekStartDate',
  'userId',
  'weekStartDate',
] as const;

let initializationPromise: Promise<void> | null = null;

export function initializeNativeFirebaseMessaging() {
  if (
    Platform.OS === 'web' ||
    !isFcmRuntimeEnabled() ||
    !hasNativeFirebaseMessagingModule()
  ) {
    return Promise.resolve();
  }

  initializationPromise ??= setupNativeFirebaseMessaging();

  return initializationPromise;
}

function hasNativeFirebaseMessagingModule() {
  return Boolean(NativeModules.RNFBAppModule && NativeModules.RNFBMessagingModule);
}

async function setupNativeFirebaseMessaging() {
  try {
    const messagingModule = await import('@react-native-firebase/messaging');
    const messaging = messagingModule.getMessaging();

    setDeviceFcmTokenProvider(async () => {
      await ensureRemoteMessagingRegistered(messagingModule, messaging);
      return messagingModule.getToken(messaging);
    });

    setDeviceFcmTokenRefreshSubscriber((listener) =>
      messagingModule.onTokenRefresh(messaging, (token) => {
        const normalizedToken = token.trim();

        if (normalizedToken) {
          void listener(normalizedToken);
        }
      }),
    );

    setInitialNotificationOpenPayloadProvider(async () => {
      const message = await messagingModule.getInitialNotification(messaging);
      return getRemoteMessageOpenPayload(message);
    });

    setNotificationOpenPayloadSubscriber((listener) =>
      messagingModule.onNotificationOpenedApp(messaging, (message) => {
        const payload = getRemoteMessageOpenPayload(message);

        if (payload) {
          listener(payload);
        }
      }),
    );

    messagingModule.setBackgroundMessageHandler(messaging, async () => {});
  } catch {
    setDeviceFcmTokenProvider(null);
    setDeviceFcmTokenRefreshSubscriber(null);
    setInitialNotificationOpenPayloadProvider(null);
    setNotificationOpenPayloadSubscriber(null);
  }
}

async function ensureRemoteMessagingRegistered(
  messagingModule: MessagingModule,
  messaging: MessagingInstance,
) {
  if (
    Platform.OS === 'ios' &&
    !messagingModule.isDeviceRegisteredForRemoteMessages(messaging)
  ) {
    await messagingModule.registerDeviceForRemoteMessages(messaging);
  }
}

function getRemoteMessageOpenPayload(message: RemoteMessage | null) {
  if (!message?.data || typeof message.data !== 'object') {
    return null;
  }

  const route = message.data.route;

  if (typeof route !== 'string') {
    return null;
  }

  return {
    route,
    params: getRemoteMessageParams(message.data),
  };
}

function getRemoteMessageParams(data: RemoteMessage['data']) {
  const params = parseParamsPayload(data?.params);

  pushParamKeys.forEach((key) => {
    const value = data?.[key];

    if (value !== undefined && params[key] === undefined) {
      params[key] = value;
    }
  });

  return params;
}

function parseParamsPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {...value};
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? {...parsed} : {};
  } catch {
    return {};
  }
}
