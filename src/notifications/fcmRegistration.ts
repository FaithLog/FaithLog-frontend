import {
  deactivateMyFcmToken,
  deactivateMyFcmTokenForCleanup,
  FaithLogApiError,
  registerMyFcmToken,
  registerMyFcmTokenForCleanup,
  logoutUser,
} from '../api/client';
import {
  clearFcmRegistration,
  clearFcmRegistrationAttempt,
  clearFcmOptOut,
  getAuthSessionGeneration,
  getOrCreateClientInstanceId,
  getFcmOptOutState,
  getFcmRegistrationAttempts,
  getStoredFcmRegistration,
  isFcmOptedOut,
  isAuthSessionGenerationCurrent,
  isAuthSessionRequestAllowed,
  saveFcmRegistration,
  saveFcmRegistrationAttempt,
  saveFcmOptOut,
  type AuthSessionGeneration,
  CorruptFcmPrivacyStateError,
} from '../api/tokenStorage';
import type {FcmTokenRegisterResponse} from '../api/types';
import {APP_VERSION} from './appInfo';
import {configureFcmTransitionCleanup} from '../auth/fcmTransitionCleanup';
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
  generation: AuthSessionGeneration;
  obligations: Set<FcmRemoteCleanupObligation>;
  promise: Promise<unknown>;
};

export type FcmRemoteCleanupObligation = {
  accessToken: string;
  refreshToken?: string | null;
  clientInstanceId: string;
  kind: 'registration' | 'deactivation' | 'clientLogout';
  token: string | null;
  tokenId: number | null;
  state: 'mayHaveSent' | 'registered' | 'cleaned';
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
  let optOut;
  try {
    optOut = await getFcmOptOutState(userId, generation);
  } catch (error) {
    if (error instanceof CorruptFcmPrivacyStateError) {
      return {status: 'optedOutPending', message: '저장된 알림 개인정보 상태를 확인해야 합니다.'};
    }
    throw error;
  }
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

export function registerCurrentFcmToken(
  accessToken: string,
  userId: number,
  generation: AuthSessionGeneration = getAuthSessionGeneration(),
  mode: 'automatic' | 'user' = 'user',
): Promise<FcmRegistrationStatus> {
  const intent = mode === 'user' ? setFcmIntent(userId, true) : null;
  const context = createPendingFcmOperation(generation);
  return enqueueFcmOperation(
    () => registerCurrentFcmTokenInternal(
      accessToken, userId, generation, mode, context, intent,
    ),
    context,
  );
}

async function registerCurrentFcmTokenInternal(
  accessToken: string,
  userId: number,
  generation: AuthSessionGeneration,
  mode: 'automatic' | 'user',
  context: PendingFcmOperation,
  intent: FcmIntent | null,
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
  assertFcmIntentCurrent(userId, intent);
  if (mode === 'automatic') {
    let optOut;
    try {
      optOut = await getFcmOptOutState(userId, generation);
    } catch (error) {
      if (error instanceof CorruptFcmPrivacyStateError) {
        return {status: 'optedOutPending', message: '저장된 알림 개인정보 상태를 확인해야 합니다.'};
      }
      throw error;
    }
    if (optOut) {
      return optOut.status === 'confirmed'
        ? {status: 'optedOut', message: '이 기기의 알림 연결을 사용자가 비활성화했습니다.'}
        : {status: 'optedOutPending', message: '서버의 알림 연결 해제를 다시 확인해야 합니다.'};
    }
  } else {
    await clearFcmOptOut(userId, clientInstanceId, generation);
  }

  const permission = await requestNotificationPermission();
  assertFcmIntentCurrent(userId, intent);

  if (permission !== 'authorized') {
    return {status: 'permissionDenied', permission};
  }

  const stored = await getStoredFcmRegistration();
  const deviceTokenResult = await loadDeviceFcmToken(permission);
  assertFcmAuthSessionCurrent(generation);
  assertFcmIntentCurrent(userId, intent);

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

  const registration = await registerFcmTokenValueInternal(
    accessToken, userId, deviceTokenResult.token, generation, context,
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
      context,
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
  const intent = getFcmIntent(userId);
  let optOut;
  try {
    optOut = await getFcmOptOutState(userId, generation);
  } catch (error) {
    if (error instanceof CorruptFcmPrivacyStateError) {
      return {status: 'optedOutPending' as const, message: '저장된 알림 개인정보 상태를 확인해야 합니다.'};
    }
    throw error;
  }
  if (optOut?.status === 'pending') {
    try {
      if (!isFcmIntentCurrent(userId, intent) || intent.enabled) {
        return inspectFcmRegistrationStatus(userId, generation);
      }
      const context = createPendingFcmOperation(generation);
      await enqueueFcmOperation(
        () => isFcmIntentCurrent(userId, intent) && !intent.enabled
          ? deactivateCurrentFcmTokenInternal(accessToken, userId, generation, context)
          : Promise.resolve({status: 'skipped' as const}),
        context,
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
    generation,
    obligations: new Set(),
    promise: Promise.resolve(),
  };
  return enqueueFcmOperation(
    () => registerFcmTokenValueInternal(accessToken, userId, token, generation, context),
    context,
  );
}

function enqueueFcmOperation<T>(run: () => Promise<T>, context: PendingFcmOperation) {
  const operation = fcmRegistrationQueue.then(run, run);
  fcmRegistrationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
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

export function capturePendingFcmOperations(expectedGeneration?: number): {
  barrier: Promise<void>;
  settlement: Promise<FcmRemoteCleanupObligation[]>;
  obligations?: FcmRemoteCleanupObligation[];
  hasPendingOperations: boolean;
} {
  const pendingAtCapture = [...pendingFcmRegistrations].filter((operation) =>
    expectedGeneration === undefined || operation.generation === expectedGeneration);
  const obligations = pendingAtCapture.flatMap((operation) =>
    [...operation.obligations].filter((obligation) => obligation.state !== 'cleaned'));
  const barrier = pendingAtCapture.length === 0
    ? Promise.resolve()
    : Promise.allSettled(pendingAtCapture.map((operation) => operation.promise)).then(() => undefined);
  const settlement = barrier.then(() => {
    return pendingAtCapture.flatMap((operation) =>
      [...operation.obligations].filter((obligation) => obligation.state !== 'cleaned'),
    );
  });
  return {
    barrier,
    settlement,
    obligations,
    hasPendingOperations: pendingAtCapture.some((operation) =>
      [...operation.obligations].some((obligation) => obligation.state !== 'cleaned'),
    ),
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
  assertFcmAuthSessionCurrent(generation);
  if (await isFcmOptedOut(userId, clientInstanceId, generation)) return null;
  assertFcmAuthSessionCurrent(generation);
  const attempt = {userId, clientInstanceId, token: normalizedToken};
  const attemptSaved = await saveFcmRegistrationAttempt(
    attempt,
    generation,
  );
  if (!attemptSaved) throw new Error('Unable to persist the FCM registration attempt.');
  assertFcmAuthSessionCurrent(generation);
  const obligation = context
    ? addFcmObligation(context, {
        accessToken, clientInstanceId, kind: 'registration', token: normalizedToken, tokenId: null,
      })
    : null;
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
  if (obligation) {
    obligation.state = 'registered';
    obligation.tokenId = registration.tokenId;
  }

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

  if (saved) await clearFcmRegistrationAttempt(attempt, generation);

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
  context: PendingFcmOperation,
) {
  if (!previousTokenId || previousTokenId === currentTokenId) {
    return;
  }

  try {
    assertFcmAuthSessionCurrent(generation);
    const obligation = addFcmObligation(context, {
      accessToken,
      clientInstanceId: contextClientInstanceId(context),
      kind: 'deactivation',
      token: null,
      tokenId: previousTokenId,
    });
    await deactivateMyFcmToken(accessToken, previousTokenId, generation);
    obligation.state = 'cleaned';
  } catch {
    // A stale push token should not block the fresh registration from being used.
  }
}

export function deactivateCurrentFcmToken(
  accessToken: string,
  userId: number,
  generation: AuthSessionGeneration = getAuthSessionGeneration(),
) {
  const intent = setFcmIntent(userId, false);
  const context = createPendingFcmOperation(generation);
  return enqueueFcmOperation(
    () => deactivateCurrentFcmTokenWithIntent(
      accessToken, userId, generation, context, intent,
    ),
    context,
  );
}

async function deactivateCurrentFcmTokenWithIntent(
  accessToken: string,
  userId: number,
  generation: AuthSessionGeneration,
  context: PendingFcmOperation,
  intent: FcmIntent,
) {
  assertFcmAuthSessionCurrent(generation);
  assertFcmIntentCurrent(userId, intent);

  const clientInstanceId = await getOrCreateClientInstanceId();
  assertFcmAuthSessionCurrent(generation);
  assertFcmIntentCurrent(userId, intent);
  const stored = await getStoredFcmRegistration();
  assertFcmAuthSessionCurrent(generation);
  assertFcmIntentCurrent(userId, intent);
  const savedOptOut = await saveFcmOptOut(userId, clientInstanceId, generation, {
    status: 'pending',
    tokenId: stored.userId === userId ? stored.tokenId : null,
  });
  if (!savedOptOut) throw new Error('Unable to persist the notification opt-out preference.');
  assertFcmIntentCurrent(userId, intent);

  return deactivateCurrentFcmTokenInternal(accessToken, userId, generation, context);
}

async function deactivateCurrentFcmTokenInternal(
  accessToken: string,
  userId: number,
  generation: AuthSessionGeneration,
  context: PendingFcmOperation,
) {
  assertFcmAuthSessionCurrent(generation);

  if (!isFcmRuntimeEnabled()) {
    await clearFcmRegistration(generation);
    return {status: 'skipped' as const};
  }

  const {tokenId: storedTokenId, userId: storedUserId} = await getStoredFcmRegistration();
  assertFcmAuthSessionCurrent(generation);
  const optOut = await getFcmOptOutState(userId, generation);
  const attempts = await getFcmRegistrationAttempts(userId, generation);
  const cleanupTargets: Array<{tokenId: number; attempt: typeof attempts[number] | null}> = [];
  const initialTokenId = storedUserId === userId ? storedTokenId : optOut?.tokenId ?? null;
  if (initialTokenId) cleanupTargets.push({tokenId: initialTokenId, attempt: null});
  const clientInstanceId = await getOrCreateClientInstanceId();
  assertFcmAuthSessionCurrent(generation);

  for (const attempt of attempts) {
    const registrationObligation = addFcmObligation(context, {
      accessToken,
      clientInstanceId: attempt.clientInstanceId,
      kind: 'registration',
      token: attempt.token,
      tokenId: null,
    });
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
    registrationObligation.state = 'registered';
    registrationObligation.tokenId = recovered.tokenId;
    cleanupTargets.push({tokenId: recovered.tokenId, attempt});
  }

  if (cleanupTargets.length === 0) {
    await clearFcmRegistration(generation);
    await saveFcmOptOut(userId, clientInstanceId, generation, {status: 'confirmed'});
    return {status: 'skipped' as const};
  }

  try {
    for (const target of cleanupTargets) {
      await saveFcmOptOut(userId, clientInstanceId, generation, {
        status: 'pending', tokenId: target.tokenId,
      });
      assertFcmAuthSessionCurrent(generation);
      const deactivationObligation = addFcmObligation(context, {
        accessToken,
        clientInstanceId: target.attempt?.clientInstanceId ?? clientInstanceId,
        kind: 'deactivation',
        token: null,
        tokenId: target.tokenId,
      });
      try {
        await deactivateMyFcmToken(accessToken, target.tokenId, generation);
      } catch (error) {
        if (!(error instanceof FaithLogApiError && error.detail.status === 404)) throw error;
      }
      deactivationObligation.state = 'cleaned';
      for (const obligation of context.obligations) {
        if (obligation.kind === 'registration' && obligation.tokenId === target.tokenId) {
          obligation.state = 'cleaned';
        }
      }
      if (target.attempt) await clearFcmRegistrationAttempt(target.attempt, generation);
    }
    await clearFcmRegistration(generation);
    await saveFcmOptOut(userId, clientInstanceId, generation, {status: 'confirmed'});

    return {status: 'deactivated' as const};
  } catch (error) {
    if (error instanceof FaithLogApiError && error.detail.kind === 'sessionExpired') {
      await clearFcmRegistration(generation);
    }

    throw error;
  }
}

function createPendingFcmOperation(
  generation: AuthSessionGeneration,
): PendingFcmOperation {
  return {generation, obligations: new Set(), promise: Promise.resolve()};
}

function addFcmObligation(
  context: PendingFcmOperation,
  obligation: Omit<FcmRemoteCleanupObligation, 'state'>,
) {
  const tracked: FcmRemoteCleanupObligation = {...obligation, state: 'mayHaveSent'};
  context.obligations.add(tracked);
  return tracked;
}

function contextClientInstanceId(context: PendingFcmOperation) {
  return [...context.obligations].at(-1)?.clientInstanceId ?? '';
}

export async function compensateCapturedFcmOperations(
  obligations: FcmRemoteCleanupObligation[],
) {
  const pending = obligations.filter((obligation) => obligation.state !== 'cleaned');
  for (const obligation of pending) {
    if (obligation.kind === 'clientLogout') {
      await logoutUser(obligation.accessToken, {
        ...(obligation.refreshToken ? {refreshToken: obligation.refreshToken} : {}),
        clientInstanceId: obligation.clientInstanceId,
      });
      obligation.state = 'cleaned';
      continue;
    }
    let tokenId = obligation.tokenId;
    if (obligation.kind === 'registration' && !tokenId) {
      if (!obligation.token) throw new Error('Missing FCM token for remote cleanup.');
      const recovered = await registerMyFcmTokenForCleanup(obligation.accessToken, {
        appVersion: APP_VERSION,
        clientInstanceId: obligation.clientInstanceId,
        deviceType: getDeviceType(),
        token: obligation.token,
      });
      tokenId = recovered.tokenId;
      obligation.tokenId = tokenId;
    }
    if (tokenId) {
      try {
        await deactivateMyFcmTokenForCleanup(obligation.accessToken, tokenId);
      } catch (error) {
        if (!(error instanceof FaithLogApiError && error.detail.status === 404)) throw error;
      }
    }
    obligation.state = 'cleaned';
  }
  return pending;
}

type FcmIntent = {epoch: number; enabled: boolean};
const fcmIntents = new Map<number, FcmIntent>();

function getFcmIntent(userId: number): FcmIntent {
  return fcmIntents.get(userId) ?? {epoch: 0, enabled: false};
}

function setFcmIntent(userId: number, enabled: boolean): FcmIntent {
  const next = {epoch: getFcmIntent(userId).epoch + 1, enabled};
  fcmIntents.set(userId, next);
  return next;
}

function isFcmIntentCurrent(userId: number, intent: FcmIntent) {
  const current = getFcmIntent(userId);
  return current.epoch === intent.epoch && current.enabled === intent.enabled;
}

function assertFcmIntentCurrent(userId: number, intent: FcmIntent | null) {
  if (!intent || isFcmIntentCurrent(userId, intent)) return;
  throw new FaithLogApiError({
    kind: 'conflict',
    code: 'FCM_INTENT_CHANGED',
    message: '알림 설정이 변경되어 이전 작업을 취소했습니다.',
  });
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

export function resetFcmRegistrationCoordinatorForTests() {
  pendingFcmRegistrations.clear();
  fcmRegistrationQueue = Promise.resolve();
  fcmIntents.clear();
}

configureFcmTransitionCleanup({
  capture: capturePendingFcmOperations,
  compensate: compensateCapturedFcmOperations,
});
