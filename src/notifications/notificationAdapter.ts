import {Linking, PermissionsAndroid, Platform} from 'react-native';

import type {FcmDeviceType} from '../api/types';

export type NotificationPermissionStatus =
  | 'authorized'
  | 'denied'
  | 'blocked'
  | 'unavailable';

export type DeviceFcmTokenResult =
  | {status: 'available'; token: string}
  | {
      status: 'unavailable';
      reason: 'nativeModuleMissing' | 'permissionUnavailable';
      message: string;
    }
  | {status: 'error'; message: string};

export type DeviceFcmTokenProvider = () => Promise<string | null>;
export type DeviceFcmTokenRefreshListener = (token: string) => void | Promise<void>;
export type DeviceFcmTokenRefreshSubscriber = (
  listener: DeviceFcmTokenRefreshListener,
) => () => void;
export type NotificationOpenPayloadListener = (payload: unknown) => void;
export type NotificationOpenPayloadSubscriber = (
  listener: NotificationOpenPayloadListener,
) => () => void;
export type InitialNotificationOpenPayloadProvider = () => Promise<unknown | null>;
export type NotificationPermissionChecker = () => Promise<NotificationPermissionStatus>;
export type NotificationPermissionRequester = () => Promise<NotificationPermissionStatus>;

let deviceFcmTokenProvider: DeviceFcmTokenProvider | null = null;
let deviceFcmTokenRefreshSubscriber: DeviceFcmTokenRefreshSubscriber | null = null;
let notificationOpenPayloadSubscriber: NotificationOpenPayloadSubscriber | null = null;
let initialNotificationOpenPayloadProvider: InitialNotificationOpenPayloadProvider | null =
  null;
let notificationPermissionChecker: NotificationPermissionChecker | null = null;
let notificationPermissionRequester: NotificationPermissionRequester | null = null;

export function setDeviceFcmTokenProvider(provider: DeviceFcmTokenProvider | null) {
  deviceFcmTokenProvider = provider;
}

export function setDeviceFcmTokenRefreshSubscriber(
  subscriber: DeviceFcmTokenRefreshSubscriber | null,
) {
  deviceFcmTokenRefreshSubscriber = subscriber;
}

export function setNotificationOpenPayloadSubscriber(
  subscriber: NotificationOpenPayloadSubscriber | null,
) {
  notificationOpenPayloadSubscriber = subscriber;
}

export function setInitialNotificationOpenPayloadProvider(
  provider: InitialNotificationOpenPayloadProvider | null,
) {
  initialNotificationOpenPayloadProvider = provider;
}

export function setNotificationPermissionHandlers(
  handlers: {
    check: NotificationPermissionChecker;
    request: NotificationPermissionRequester;
  } | null,
) {
  notificationPermissionChecker = handlers?.check ?? null;
  notificationPermissionRequester = handlers?.request ?? null;
}

export async function getInitialNotificationOpenPayload() {
  if (!initialNotificationOpenPayloadProvider) {
    return null;
  }

  try {
    return await initialNotificationOpenPayloadProvider();
  } catch {
    return null;
  }
}

export function subscribeNotificationOpenPayload(
  listener: NotificationOpenPayloadListener,
) {
  if (!notificationOpenPayloadSubscriber) {
    return () => {};
  }

  return notificationOpenPayloadSubscriber(listener);
}

export function subscribeDeviceFcmTokenRefresh(listener: DeviceFcmTokenRefreshListener) {
  if (!deviceFcmTokenRefreshSubscriber) {
    return () => {};
  }

  return deviceFcmTokenRefreshSubscriber(listener);
}

export async function getDeviceFcmToken(
  permissionStatus?: NotificationPermissionStatus,
): Promise<DeviceFcmTokenResult> {
  if (permissionStatus && permissionStatus !== 'authorized') {
    return {
      status: 'unavailable',
      reason: 'permissionUnavailable',
      message: '알림 권한이 허용되지 않아 FCM token을 조회할 수 없습니다.',
    };
  }

  if (!deviceFcmTokenProvider) {
    return {
      status: 'unavailable',
      reason: 'nativeModuleMissing',
      message: 'Firebase/FCM native SDK provider가 아직 연결되지 않았습니다.',
    };
  }

  try {
    const token = await deviceFcmTokenProvider();
    const normalizedToken = typeof token === 'string' ? token.trim() : '';

    if (!normalizedToken) {
      return {
        status: 'unavailable',
        reason: 'nativeModuleMissing',
        message: '기기 FCM token을 가져오지 못했습니다.',
      };
    }

    return {status: 'available', token: normalizedToken};
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';

    return {
      status: 'error',
      message: `기기 FCM token 조회 중 문제가 발생했습니다.${detail}`,
    };
  }
}

export function getDeviceType(): FcmDeviceType {
  if (Platform.OS === 'android') {
    return 'ANDROID';
  }

  if (Platform.OS === 'ios') {
    return 'IOS';
  }

  return 'WEB';
}

export async function checkNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (Platform.OS === 'android') {
    return checkAndroidNotificationPermission();
  }

  if (Platform.OS === 'ios' && notificationPermissionChecker) {
    return notificationPermissionChecker();
  }

  return 'unavailable';
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (Platform.OS === 'android') {
    return requestAndroidNotificationPermission();
  }

  if (Platform.OS === 'ios' && notificationPermissionRequester) {
    return notificationPermissionRequester();
  }

  return 'unavailable';
}

export async function openNotificationSettings() {
  await Linking.openSettings();
}

async function checkAndroidNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!requiresAndroidPostNotificationsPermission()) {
    return 'authorized';
  }

  const granted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );

  return granted ? 'authorized' : 'denied';
}

async function requestAndroidNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!requiresAndroidPostNotificationsPermission()) {
    return 'authorized';
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );

  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return 'authorized';
  }

  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return 'blocked';
  }

  return 'denied';
}

function requiresAndroidPostNotificationsPermission() {
  const version =
    typeof Platform.Version === 'string' ? Number(Platform.Version) : Platform.Version;

  return Number.isFinite(version) && version >= 33;
}
