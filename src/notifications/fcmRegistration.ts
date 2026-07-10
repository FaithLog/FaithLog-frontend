import {
  deactivateMyFcmToken,
  FaithLogApiError,
  registerMyFcmToken,
} from '../api/client';
import {
  clearFcmRegistration,
  getAuthSessionGeneration,
  getOrCreateClientInstanceId,
  getStoredFcmRegistration,
  isAuthSessionGenerationCurrent,
  saveFcmRegistration,
  type AuthSessionGeneration,
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

const pendingFcmRegistrations = new Set<Promise<unknown>>();

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

export async function inspectFcmRegistrationStatus(
  userId: number,
  generation: AuthSessionGeneration = getAuthSessionGeneration(),
): Promise<FcmRegistrationStatus> {
  assertFcmAuthSessionCurrent(generation);

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('A valid user is required to inspect FCM registration.');
  }

  const availability = getFcmRuntimeAvailability();

  if (!availability.enabled) {
    await clearFcmRegistration(generation);
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
  assertFcmAuthSessionCurrent(generation);

  if (permission !== 'authorized') {
    return {status: 'permissionPrompt', permission};
  }

  if (stored.tokenId && stored.userId === userId) {
    return {status: 'registeredLocal', permission, tokenId: stored.tokenId};
  }

  if (stored.tokenId || stored.token) {
    await clearFcmRegistration(generation);
  }

  return {
    status: 'tokenUnavailable',
    permission,
    message: '저장된 FCM token이 없어 등록을 시작해야 합니다.',
  };
}

export async function registerCurrentFcmToken(
  accessToken: string,
  userId: number,
  generation: AuthSessionGeneration = getAuthSessionGeneration(),
): Promise<FcmRegistrationStatus> {
  assertFcmAuthSessionCurrent(generation);
  const availability = getFcmRuntimeAvailability();

  if (!availability.enabled) {
    await clearFcmRegistration(generation);
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
  const deviceTokenResult = await loadDeviceFcmToken(permission);
  assertFcmAuthSessionCurrent(generation);

  if (deviceTokenResult.status !== 'available') {
    return {
      status: 'tokenUnavailable',
      permission,
      message: deviceTokenResult.message,
    };
  }

  if (
    stored.userId === userId &&
    stored.tokenId &&
    stored.token === deviceTokenResult.token
  ) {
    return {status: 'registeredLocal', permission, tokenId: stored.tokenId};
  }

  const registration = await registerFcmTokenValue(
    accessToken,
    userId,
    deviceTokenResult.token,
    generation,
  );

  if (!registration) {
    return {
      status: 'tokenUnavailable',
      permission,
      message: '기기 FCM token은 확인했지만 서버에 등록하지 못했습니다.',
    };
  }

  if (stored.userId === userId) {
    await deactivateStaleFcmToken(
      accessToken,
      stored.tokenId,
      registration.tokenId,
      generation,
    );
  }

  return {status: 'registered', permission, registration};
}

export function registerFcmTokenValue(
  accessToken: string,
  userId: number,
  token: string,
  generation: AuthSessionGeneration = getAuthSessionGeneration(),
): Promise<FcmTokenRegisterResponse | null> {
  const operation = registerFcmTokenValueInternal(
    accessToken,
    userId,
    token,
    generation,
  );
  pendingFcmRegistrations.add(operation);
  void operation.then(
    () => pendingFcmRegistrations.delete(operation),
    () => pendingFcmRegistrations.delete(operation),
  );
  return operation;
}

export function capturePendingFcmRegistrationBarrier(): Promise<void> {
  const pendingAtCapture = [...pendingFcmRegistrations];
  return pendingAtCapture.length === 0
    ? Promise.resolve()
    : Promise.allSettled(pendingAtCapture).then(() => undefined);
}

async function registerFcmTokenValueInternal(
  accessToken: string,
  userId: number,
  token: string,
  generation: AuthSessionGeneration,
): Promise<FcmTokenRegisterResponse | null> {
  if (
    !isFcmRuntimeEnabled() ||
    !isAuthSessionGenerationCurrent(generation) ||
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    return null;
  }

  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return null;
  }

  const clientInstanceId = await getOrCreateClientInstanceId();
  assertFcmAuthSessionCurrent(generation);
  const registration = await registerMyFcmToken(
    accessToken,
    {
      appVersion: APP_VERSION,
      clientInstanceId,
      deviceType: getDeviceType(),
      token: normalizedToken,
    },
    generation,
  );

  if (!isAuthSessionGenerationCurrent(generation)) {
    return null;
  }

  const saved = await saveFcmRegistration(
    {token: normalizedToken, tokenId: registration.tokenId, userId},
    generation,
  );

  return saved ? registration : null;
}

async function loadDeviceFcmToken(
  permission: NotificationPermissionStatus,
): Promise<DeviceFcmTokenResult> {
  return getDeviceFcmToken(permission);
}

async function deactivateStaleFcmToken(
  accessToken: string,
  previousTokenId: number | null,
  currentTokenId: number,
  generation: AuthSessionGeneration,
) {
  if (!previousTokenId || previousTokenId === currentTokenId) {
    return;
  }

  try {
    await deactivateMyFcmToken(accessToken, previousTokenId, generation);
  } catch {
    // A stale push token should not block the fresh registration from being used.
  }
}

export async function deactivateCurrentFcmToken(
  accessToken: string,
  userId: number,
  generation: AuthSessionGeneration = getAuthSessionGeneration(),
) {
  assertFcmAuthSessionCurrent(generation);

  if (!isFcmRuntimeEnabled()) {
    await clearFcmRegistration(generation);
    return {status: 'skipped' as const};
  }

  const {tokenId, userId: storedUserId} = await getStoredFcmRegistration();
  assertFcmAuthSessionCurrent(generation);

  if (!tokenId || storedUserId !== userId) {
    await clearFcmRegistration(generation);
    return {status: 'skipped' as const};
  }

  try {
    await deactivateMyFcmToken(accessToken, tokenId, generation);
    await clearFcmRegistration(generation);

    return {status: 'deactivated' as const};
  } catch (error) {
    if (error instanceof FaithLogApiError && error.detail.kind === 'sessionExpired') {
      await clearFcmRegistration(generation);
    }

    throw error;
  }
}

function assertFcmAuthSessionCurrent(generation: AuthSessionGeneration) {
  if (!isAuthSessionGenerationCurrent(generation)) {
    throw new FaithLogApiError({
      kind: 'error',
      code: 'AUTH_SESSION_CHANGED',
      message: '로그인 계정이 변경되어 이전 알림 작업을 취소했습니다.',
      authSessionGeneration: generation,
    });
  }
}
