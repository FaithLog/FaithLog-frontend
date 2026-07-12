import {
  deactivateMyFcmToken,
  FaithLogApiError,
  registerMyFcmToken,
} from '../api/client';
import {
  clearFcmRegistration,
  clearFcmRegistrationAttempt,
  clearFcmOptOut,
  getAuthSessionGeneration,
  getOrCreateClientInstanceId,
  getFcmOptOutState,
  getFcmRegistrationAttempt,
  getStoredFcmRegistration,
  isFcmOptedOut,
  isAuthSessionGenerationCurrent,
  isAuthSessionRequestAllowed,
  saveFcmRegistration,
  saveFcmRegistrationAttempt,
  saveFcmOptOut,
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

type PendingFcmOperation = {
  accessToken: string | null;
  clientInstanceId: string | null;
  mayReachServer: boolean;
  promise: Promise<unknown>;
};

const pendingFcmRegistrations = new Set<PendingFcmOperation>();
let fcmRegistrationQueue: Promise<void> = Promise.resolve();

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
      status: 'optedOut';
      message: string;
    }
  | {
      status: 'optedOutPending';
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

  const clientInstanceId = await getOrCreateClientInstanceId();
  assertFcmAuthSessionCurrent(generation);
  const optOut = await getFcmOptOutState(userId, generation);
  if (optOut) {
    return optOut.status === 'confirmed'
      ? {status: 'optedOut', message: '이 기기의 알림 연결을 사용자가 비활성화했습니다.'}
      : {status: 'optedOutPending', message: '서버의 알림 연결 해제를 다시 확인해야 합니다.'};
  }

  if (stored.tokenId && stored.userId === userId) {
    if (stored.clientInstanceId === clientInstanceId) {
      return {status: 'registeredLocal', permission, tokenId: stored.tokenId};
    }
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
  mode: 'automatic' | 'user' = 'user',
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

  const clientInstanceId = await getOrCreateClientInstanceId();
  assertFcmAuthSessionCurrent(generation);
  if (mode === 'automatic') {
    const optOut = await getFcmOptOutState(userId, generation);
    if (optOut) {
      return optOut.status === 'confirmed'
        ? {status: 'optedOut', message: '이 기기의 알림 연결을 사용자가 비활성화했습니다.'}
        : {status: 'optedOutPending', message: '서버의 알림 연결 해제를 다시 확인해야 합니다.'};
    }
  } else {
    await enqueueFcmOperation(
      () => clearFcmOptOut(userId, clientInstanceId, generation),
    );
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
    const clientInstanceId = await getOrCreateClientInstanceId();
    assertFcmAuthSessionCurrent(generation);

    if (stored.clientInstanceId === clientInstanceId) {
      return {status: 'registeredLocal', permission, tokenId: stored.tokenId};
    }
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

export async function ensureAutomaticFcmRegistration(
  accessToken: string,
  userId: number,
  generation: AuthSessionGeneration,
  isCurrent: () => boolean = () => true,
) {
  const status = await inspectFcmRegistrationStatusWithCleanup(
    accessToken, userId, generation,
  );
  if (!isCurrent()) return status;
  return status.status === 'registered' || status.status === 'registeredLocal' ||
    status.status === 'optedOut' || status.status === 'optedOutPending'
    ? status
    : registerCurrentFcmToken(accessToken, userId, generation, 'automatic');
}

export async function inspectFcmRegistrationStatusWithCleanup(
  accessToken: string,
  userId: number,
  generation: AuthSessionGeneration,
) {
  const optOut = await getFcmOptOutState(userId, generation);
  if (optOut?.status === 'pending') {
    try {
      await enqueueFcmOperation(
        () => deactivateCurrentFcmTokenInternal(accessToken, userId, generation),
      );
    } catch (error) {
      if (error instanceof FaithLogApiError && error.detail.kind === 'sessionExpired') throw error;
      return {status: 'optedOutPending' as const, message: '서버의 알림 연결 해제를 다시 확인해야 합니다.'};
    }
  }
  return inspectFcmRegistrationStatus(userId, generation);
}

export function registerFcmTokenValue(
  accessToken: string,
  userId: number,
  token: string,
  generation: AuthSessionGeneration = getAuthSessionGeneration(),
): Promise<FcmTokenRegisterResponse | null> {
  const context: PendingFcmOperation = {
    accessToken,
    clientInstanceId: null,
    mayReachServer: false,
    promise: Promise.resolve(),
  };
  return enqueueFcmOperation(
    () => registerFcmTokenValueInternal(accessToken, userId, token, generation, context),
    context,
  );
}

function enqueueFcmOperation<T>(run: () => Promise<T>, suppliedContext?: PendingFcmOperation) {
  const operation = fcmRegistrationQueue.then(run, run);
  fcmRegistrationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  const context = suppliedContext ?? {
    accessToken: null, clientInstanceId: null, mayReachServer: false, promise: operation,
  };
  context.promise = operation;
  pendingFcmRegistrations.add(context);
  void operation.then(
    () => pendingFcmRegistrations.delete(context),
    () => pendingFcmRegistrations.delete(context),
  );
  return operation;
}

export function capturePendingFcmRegistrationBarrier(): Promise<void> {
  return capturePendingFcmOperations().barrier;
}

export function capturePendingFcmOperations() {
  const pendingAtCapture = [...pendingFcmRegistrations];
  const barrier = pendingAtCapture.length === 0
    ? Promise.resolve()
    : Promise.allSettled(pendingAtCapture.map((operation) => operation.promise)).then(() => undefined);
  const settlement = barrier.then(() => {
    const credential = [...pendingAtCapture].reverse().find(
      (operation) => operation.mayReachServer && operation.accessToken && operation.clientInstanceId,
    );
    return credential?.accessToken && credential.clientInstanceId
      ? {accessToken: credential.accessToken, clientInstanceId: credential.clientInstanceId}
      : null;
  });
  return {
    barrier,
    settlement,
    hasPendingOperations: pendingAtCapture.some((operation) => operation.mayReachServer),
  };
}

async function registerFcmTokenValueInternal(
  accessToken: string,
  userId: number,
  token: string,
  generation: AuthSessionGeneration,
  context?: PendingFcmOperation,
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
  if (context) context.clientInstanceId = clientInstanceId;
  assertFcmAuthSessionCurrent(generation);
  if (await isFcmOptedOut(userId, clientInstanceId, generation)) return null;
  const attemptSaved = await saveFcmRegistrationAttempt(
    {userId, clientInstanceId, token: normalizedToken},
    generation,
  );
  if (!attemptSaved) throw new Error('Unable to persist the FCM registration attempt.');
  assertFcmAuthSessionCurrent(generation);
  if (context) context.mayReachServer = true;
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

  assertFcmAuthSessionCurrent(generation);

  const saved = await saveFcmRegistration(
    {
      token: normalizedToken,
      tokenId: registration.tokenId,
      userId,
      clientInstanceId,
    },
    generation,
  );

  if (saved) await clearFcmRegistrationAttempt(userId, generation);

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

  const clientInstanceId = await getOrCreateClientInstanceId();
  assertFcmAuthSessionCurrent(generation);
  const stored = await getStoredFcmRegistration();
  assertFcmAuthSessionCurrent(generation);
  const savedOptOut = await saveFcmOptOut(userId, clientInstanceId, generation, {
    status: 'pending',
    tokenId: stored.userId === userId ? stored.tokenId : null,
  });
  if (!savedOptOut) throw new Error('Unable to persist the notification opt-out preference.');

  return enqueueFcmOperation(
    () => deactivateCurrentFcmTokenInternal(accessToken, userId, generation),
  );
}

async function deactivateCurrentFcmTokenInternal(
  accessToken: string,
  userId: number,
  generation: AuthSessionGeneration,
) {
  assertFcmAuthSessionCurrent(generation);

  if (!isFcmRuntimeEnabled()) {
    await clearFcmRegistration(generation);
    return {status: 'skipped' as const};
  }

  const {tokenId: storedTokenId, userId: storedUserId} = await getStoredFcmRegistration();
  assertFcmAuthSessionCurrent(generation);
  const optOut = await getFcmOptOutState(userId, generation);
  const attempt = await getFcmRegistrationAttempt(userId, generation);
  let tokenId = storedUserId === userId ? storedTokenId : optOut?.tokenId ?? null;
  const clientInstanceId = await getOrCreateClientInstanceId();
  assertFcmAuthSessionCurrent(generation);

  if (!tokenId && attempt) {
    const recovered = await registerMyFcmToken(
      accessToken,
      {
        appVersion: APP_VERSION,
        clientInstanceId: attempt.clientInstanceId,
        deviceType: getDeviceType(),
        token: attempt.token,
      },
      generation,
    );
    tokenId = recovered.tokenId;
  }

  if (!tokenId) {
    await clearFcmRegistration(generation);
    await saveFcmOptOut(userId, clientInstanceId, generation, {status: 'confirmed'});
    return {status: 'skipped' as const};
  }

  await saveFcmOptOut(userId, clientInstanceId, generation, {
    status: 'pending', tokenId,
  });

  try {
    await deactivateMyFcmToken(accessToken, tokenId, generation);
    await clearFcmRegistration(generation);
    await clearFcmRegistrationAttempt(userId, generation);
    await saveFcmOptOut(userId, clientInstanceId, generation, {status: 'confirmed'});

    return {status: 'deactivated' as const};
  } catch (error) {
    if (error instanceof FaithLogApiError && error.detail.status === 404) {
      await clearFcmRegistration(generation);
      await clearFcmRegistrationAttempt(userId, generation);
      await saveFcmOptOut(userId, clientInstanceId, generation, {status: 'confirmed'});
      return {status: 'deactivated' as const};
    }
    if (error instanceof FaithLogApiError && error.detail.kind === 'sessionExpired') {
      await clearFcmRegistration(generation);
    }

    throw error;
  }
}

function assertFcmAuthSessionCurrent(generation: AuthSessionGeneration) {
  if (!isAuthSessionGenerationCurrent(generation) || !isAuthSessionRequestAllowed(generation)) {
    throw new FaithLogApiError({
      kind: 'error',
      code: 'AUTH_SESSION_CHANGED',
      message: '로그인 계정이 변경되어 이전 알림 작업을 취소했습니다.',
      authSessionGeneration: generation,
    });
  }
}
