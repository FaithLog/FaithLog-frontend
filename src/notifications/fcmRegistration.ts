import {
  deactivateMyFcmToken,
  FaithLogApiError,
  registerMyFcmToken,
} from '../api/client';
import {
  clearFcmRegistration,
  getOrCreateClientInstanceId,
  getStoredFcmRegistration,
  saveFcmToken,
  saveFcmTokenId,
} from '../api/tokenStorage';
import type {FcmTokenRegisterResponse} from '../api/types';
import {APP_VERSION} from './appInfo';
import {
  getFcmRuntimeAvailability,
  isFcmRuntimeEnabled,
  type FcmRuntimeDisabledReason,
} from './fcmEnvironment';
import {
  checkNotificationPermission,
  getDeviceFcmToken,
  getDeviceType,
  requestNotificationPermission,
  type DeviceFcmTokenResult,
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
      message: string;
    }
  | {
      status: 'disabled';
      reason: FcmRuntimeDisabledReason;
      message: string;
    };

export async function inspectFcmRegistrationStatus(): Promise<FcmRegistrationStatus> {
  const availability = getFcmRuntimeAvailability();

  if (!availability.enabled) {
    await clearFcmRegistration();
    return {
      status: 'disabled',
      reason: availability.reason,
      message: availability.message,
    };
  }

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

  return {
    status: 'tokenUnavailable',
    permission,
    message: '저장된 FCM token이 없어 등록을 시작해야 합니다.',
  };
}

export async function registerCurrentFcmToken(
  accessToken: string,
): Promise<FcmRegistrationStatus> {
  const availability = getFcmRuntimeAvailability();

  if (!availability.enabled) {
    await clearFcmRegistration();
    return {
      status: 'disabled',
      reason: availability.reason,
      message: availability.message,
    };
  }

  const permission = await requestNotificationPermission();

  if (permission !== 'authorized') {
    return {status: 'permissionDenied', permission};
  }

  const stored = await getStoredFcmRegistration();
  const deviceTokenResult = await loadAndPersistDeviceFcmToken(permission);

  if (deviceTokenResult.status !== 'available') {
    return {
      status: 'tokenUnavailable',
      permission,
      message: deviceTokenResult.message,
    };
  }

  if (stored.tokenId && stored.token === deviceTokenResult.token) {
    return {status: 'registeredLocal', permission, tokenId: stored.tokenId};
  }

  const registration = await registerFcmTokenValue(accessToken, deviceTokenResult.token);

  if (!registration) {
    return {
      status: 'tokenUnavailable',
      permission,
      message: '기기 FCM token은 확인했지만 서버에 등록하지 못했습니다.',
    };
  }

  return {status: 'registered', permission, registration};
}

export async function registerFcmTokenValue(
  accessToken: string,
  token: string,
): Promise<FcmTokenRegisterResponse | null> {
  if (!isFcmRuntimeEnabled()) {
    return null;
  }

  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return null;
  }

  await saveFcmToken(normalizedToken);

  const registration = await registerMyFcmToken(accessToken, {
    appVersion: APP_VERSION,
    clientInstanceId: await getOrCreateClientInstanceId(),
    deviceType: getDeviceType(),
    token: normalizedToken,
  });

  await saveFcmTokenId(registration.tokenId);

  return registration;
}

async function loadAndPersistDeviceFcmToken(
  permission: NotificationPermissionStatus,
): Promise<DeviceFcmTokenResult> {
  const result = await getDeviceFcmToken(permission);

  if (result.status !== 'available') {
    return result;
  }

  await saveFcmToken(result.token);

  return result;
}

export async function deactivateCurrentFcmToken(accessToken: string) {
  if (!isFcmRuntimeEnabled()) {
    await clearFcmRegistration();
    return {status: 'skipped' as const};
  }

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
