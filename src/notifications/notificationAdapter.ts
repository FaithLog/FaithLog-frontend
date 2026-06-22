import {Linking, PermissionsAndroid, Platform} from 'react-native';

import type {FcmDeviceType} from '../api/types';

export type NotificationPermissionStatus =
  | 'authorized'
  | 'denied'
  | 'blocked'
  | 'unavailable';

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

  return 'unavailable';
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (Platform.OS === 'android') {
    return requestAndroidNotificationPermission();
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
