import {
  deactivateMyFcmToken,
  FaithLogApiError,
  registerMyFcmToken,
} from '../api/client';
import {
  clearFcmRegistration,
  getOrCreateClientInstanceId,
  getStoredFcmRegistration,
  saveFcmTokenId,
} from '../api/tokenStorage';
import type {FcmTokenRegisterResponse} from '../api/types';
import {APP_VERSION} from './appInfo';
import {
  checkNotificationPermission,
  getDeviceType,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from './notificationAdapter';

export type FcmRegistrationStatus =
  | {
      status: 'registered';
      permission: 'authorized';
      registration: FcmTokenRegisterResponse;
    }
  | {
      status: 'registeredLocal';
      permission: 'authorized';
      tokenId: number;
    }
  | {
      status: 'permissionPrompt';
      permission: Exclude<NotificationPermissionStatus, 'authorized'>;
    }
  | {
      status: 'permissionDenied';
      permission: 'denied' | 'blocked' | 'unavailable';
    }
  | {
      status: 'tokenUnavailable';
      permission: 'authorized';
    };

export async function inspectFcmRegistrationStatus(): Promise<FcmRegistrationStatus> {
  const [permission, stored] = await Promise.all([
    checkNotificationPermission(),
    getStoredFcmRegistration(),
  ]);

  if (permission !== 'authorized') {
    return {status: 'permissionPrompt', permission};
  }

  if (stored.tokenId) {
    return {status: 'registeredLocal', permission, tokenId: stored.tokenId};
  }

  return {status: 'tokenUnavailable', permission};
}

export async function registerCurrentFcmToken(
  accessToken: string,
): Promise<FcmRegistrationStatus> {
  const permission = await requestNotificationPermission();

  if (permission !== 'authorized') {
    return {status: 'permissionDenied', permission};
  }

  const stored = await getStoredFcmRegistration();

  if (!stored.token) {
    return {status: 'tokenUnavailable', permission};
  }

  const registration = await registerMyFcmToken(accessToken, {
    appVersion: APP_VERSION,
    clientInstanceId: await getOrCreateClientInstanceId(),
    deviceType: getDeviceType(),
    token: stored.token,
  });

  await saveFcmTokenId(registration.tokenId);

  return {status: 'registered', permission, registration};
}

export async function deactivateCurrentFcmToken(accessToken: string) {
  const {tokenId} = await getStoredFcmRegistration();

  if (!tokenId) {
    await clearFcmRegistration();
    return {status: 'skipped' as const};
  }

  try {
    await deactivateMyFcmToken(accessToken, tokenId);
    await clearFcmRegistration();

    return {status: 'deactivated' as const};
  } catch (error) {
    if (error instanceof FaithLogApiError && error.detail.kind === 'sessionExpired') {
      await clearFcmRegistration();
    }

    throw error;
  }
}
