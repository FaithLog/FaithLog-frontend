import {
  deactivateMyFcmToken,
  deactivateMyFcmTokenForCleanup,
  FaithLogApiError,
  registerMyFcmToken,
  registerMyFcmTokenForCleanup,
  refreshAuthTokenForCleanup,
  logoutUser,
} from '../api/client';
import {
  clearFcmRegistration,
  clearFcmRegistrationAttempt,
  clearFcmRegistrationAttemptAfterRemoteCleanup,
  clearFcmRegistrationAttemptsForClientInstance,
  clearFcmRemoteCleanupObligations,
  clearFcmOptOut,
  getAuthSessionGeneration,
  getStoredAuthSession,
  getStoredClientInstanceId,
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
  markFcmRemoteCleanupPending,
  replaceFcmRemoteCleanupObligations,
  rotateClientInstanceId,
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
  accessToken: string | undefined;
  refreshToken: string | null | undefined;
  capturedForCleanup: boolean;
  privacyIntent?: Promise<void>;
  obligations: Set<FcmRemoteCleanupObligation>;
  promise: Promise<unknown>;
};

export type FcmRemoteCleanupObligation = {
  accessToken: string;
  refreshToken?: string | null;
  userId: number | null;
  clientInstanceId: string | null;
  kind: 'registration' | 'deactivation' | 'clientLogout' | 'clientRetirement';
  token: string | null;
  tokenId: number | null;
  state: 'mayHaveSent' | 'registered' | 'cleaned';
};

const pendingFcmRegistrations = new Set<PendingFcmOperation>();
let fcmRegistrationQueue: Promise<void> = Promise.resolve();
let fcmPrivacyIntentQueue: Promise<void> = Promise.resolve();
const frozenFcmGenerations = new Map<number, number>();
let nextFcmFreezeEpoch = 1;

function assertFcmEnqueueAllowed(generation: AuthSessionGeneration) {
  if (!frozenFcmGenerations.has(generation)) return;
  throw new FaithLogApiError({
    kind: 'conflict',
    code: 'FCM_TRANSITION_IN_PROGRESS',
    message: '계정 전환 중에는 알림 설정을 변경할 수 없습니다.',
    authSessionGeneration: generation,
  });
}

export function beginAccountDeletionFcmPreflight(generation: AuthSessionGeneration) {
  const epoch = nextFcmFreezeEpoch++;
  frozenFcmGenerations.set(generation, epoch);
  const captured = capturePendingFcmOperations(generation);
  const initialObligations = captured.obligations ?? [];
  const persisted = initialObligations.length > 0
    ? markFcmRemoteCleanupPending(initialObligations)
    : Promise.resolve();
  return {
    wait: () => Promise.all([persisted, captured.barrier]).then(() => undefined),
    release: () => {
      if (frozenFcmGenerations.get(generation) === epoch) {
        frozenFcmGenerations.delete(generation);
      }
    },
    completeAfterCascade: async () => {
      const settled = await captured.settlement;
      await clearFcmRemoteCleanupObligations([
        ...(captured.obligations ?? []),
        ...settled,
      ]);
    },
  };
}

export async function runAccountDeletionWithFcmPreflight<T>(
  generation: AuthSessionGeneration,
  resolveLatestAccessToken: () => Promise<string | null>,
  deleteAccount: (accessToken: string) => Promise<T>,
): Promise<
  {status: 'completed'; value: T; cleanup: Promise<void>} | {status: 'cancelled'}
> {
  const preflight = beginAccountDeletionFcmPreflight(generation);
  let completed = false;
  try {
    await preflight.wait();
    const accessToken = await resolveLatestAccessToken();
    if (!accessToken || !isAuthSessionRequestAllowed(generation)) {
      return {status: 'cancelled'};
    }
    let value: T;
    try {
      value = await deleteAccount(accessToken);
    } catch (error) {
      if (!isAccountDeletionAuthTeardownError(error)) {
        // The account either remains active or the DELETE outcome is unknown.
        // In both cases the already-settled FCM operation is not teardown debt:
        // it is desired state if the account remains, and backend cascade owns
        // it if deletion actually committed.
        await preflight.completeAfterCascade();
      }
      throw error;
    }
    completed = true;
    const cleanup = preflight.completeAfterCascade();
    return {status: 'completed', value, cleanup};
  } finally {
    if (!completed) preflight.release();
  }
}

function isAccountDeletionAuthTeardownError(error: unknown) {
  return error instanceof FaithLogApiError && (
    error.detail.kind === 'sessionExpired' || error.detail.code === 'AUTH_SESSION_CHANGED'
  );
}

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

  let unresolvedAttempts: Awaited<ReturnType<typeof getFcmRegistrationAttempts>>;
  try {
    unresolvedAttempts = await getFcmRegistrationAttempts(userId, generation);
  } catch (error) {
    if (error instanceof CorruptFcmPrivacyStateError) {
      return {status: 'optedOutPending', message: '저장된 알림 개인정보 상태를 확인해야 합니다.'};
    }
    throw error;
  }
  assertFcmAuthSessionCurrent(generation);
  if (stored.tokenId && stored.userId === userId) {
    const hasUncertainDelete = stored.token && unresolvedAttempts.some((attempt) =>
      attempt.clientInstanceId === clientInstanceId && attempt.token === stored.token);
    if (stored.clientInstanceId === clientInstanceId && !hasUncertainDelete) {
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
  assertFcmEnqueueAllowed(generation);
  const intent = mode === 'user' ? setFcmIntent(userId, true) : null;
  const context = createPendingFcmOperation(generation);
  context.accessToken = accessToken;
  if (intent) {
    context.privacyIntent = enqueueFcmPrivacyIntent(async () => {
      assertFcmOperationCurrent(userId, generation, intent);
      const clientInstanceId = await getOrCreateClientInstanceId();
      assertFcmOperationCurrent(userId, generation, intent);
      await clearFcmOptOut(userId, clientInstanceId, generation);
      assertFcmOperationCurrent(userId, generation, intent);
    });
  }
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
    await context.privacyIntent;
    assertFcmOperationCurrent(userId, generation, intent);
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
    const unresolvedAttempts = await getFcmRegistrationAttempts(userId, generation);
    assertFcmAuthSessionCurrent(generation);

    if (
      stored.clientInstanceId === clientInstanceId &&
      !unresolvedAttempts.some((attempt) =>
        attempt.clientInstanceId === clientInstanceId &&
        attempt.token === deviceTokenResult.token)
    ) {
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
      userId,
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
      assertFcmEnqueueAllowed(generation);
      const context = createPendingFcmOperation(generation);
      context.accessToken = accessToken;
      await enqueueFcmOperation(
        () => isFcmIntentCurrent(userId, intent) && !intent.enabled
          ? deactivateCurrentFcmTokenInternal(accessToken, userId, generation, context, intent)
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
  assertFcmEnqueueAllowed(generation);
  const context: PendingFcmOperation = {
    generation,
    accessToken,
    refreshToken: undefined,
    capturedForCleanup: false,
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
  pendingAtCapture.forEach((operation) => { operation.capturedForCleanup = true; });
  const obligations = pendingAtCapture.flatMap((operation) =>
    [...operation.obligations].filter((obligation) => obligation.state !== 'cleaned'));
  const barrier = pendingAtCapture.length === 0
    ? Promise.resolve()
    : Promise.allSettled(pendingAtCapture.map((operation) => operation.promise)).then(() => undefined);
  const settlement = barrier.then(() => {
    return pendingAtCapture.flatMap((operation) =>
      [...operation.obligations],
    );
  });
  return {
    barrier,
    settlement,
    obligations,
    hasPendingOperations: pendingAtCapture.length > 0,
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
  if (context) await loadCleanupRefreshToken(context);
  assertFcmAuthSessionCurrent(generation);
  const obligation = context
    ? addFcmObligation(context, {
        accessToken, userId, clientInstanceId, kind: 'registration', token: normalizedToken,
        tokenId: null,
      })
    : null;
  if (context && obligation) await persistFcmObligationBeforeSend(context, obligation);
  const registration = await registerMyFcmToken(
    context?.accessToken ?? accessToken,
    {
      appVersion: APP_VERSION,
      clientInstanceId,
      deviceType: getDeviceType(),
      token: normalizedToken,
    },
    generation,
    context ? (tokens) => updateFcmOperationCredentials(context, tokens) : undefined,
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
  userId: number,
  generation: AuthSessionGeneration,
  context: PendingFcmOperation,
) {
  if (!previousTokenId || previousTokenId === currentTokenId) {
    return;
  }

  try {
    assertFcmAuthSessionCurrent(generation);
    await loadCleanupRefreshToken(context);
    assertFcmAuthSessionCurrent(generation);
    const obligation = addFcmObligation(context, {
      accessToken: context.accessToken ?? accessToken,
      userId,
      clientInstanceId: contextClientInstanceId(context),
      kind: 'deactivation',
      token: null,
      tokenId: previousTokenId,
    });
    await persistFcmObligationBeforeSend(context, obligation);
    await deactivateMyFcmToken(
      context.accessToken ?? accessToken,
      previousTokenId,
      generation,
      (tokens) => updateFcmOperationCredentials(context, tokens),
    );
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
  assertFcmEnqueueAllowed(generation);
  const intent = setFcmIntent(userId, false);
  const context = createPendingFcmOperation(generation);
  context.accessToken = accessToken;
  context.privacyIntent = enqueueFcmPrivacyIntent(async () => {
    assertFcmOperationCurrent(userId, generation, intent);
    const clientInstanceId = await getOrCreateClientInstanceId();
    assertFcmOperationCurrent(userId, generation, intent);
    const stored = await getStoredFcmRegistration();
    assertFcmOperationCurrent(userId, generation, intent);
    const saved = await saveFcmOptOut(userId, clientInstanceId, generation, {
      status: 'pending', tokenId: stored.userId === userId ? stored.tokenId : null,
    });
    if (!saved) throw new Error('Unable to persist the notification opt-out preference.');
    assertFcmOperationCurrent(userId, generation, intent);
  });
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

  await context.privacyIntent;
  assertFcmOperationCurrent(userId, generation, intent);
  return deactivateCurrentFcmTokenInternal(accessToken, userId, generation, context, intent);
}

async function deactivateCurrentFcmTokenInternal(
  accessToken: string,
  userId: number,
  generation: AuthSessionGeneration,
  context: PendingFcmOperation,
  intent: FcmIntent | null,
) {
  assertFcmOperationCurrent(userId, generation, intent);

  if (!isFcmRuntimeEnabled()) {
    assertFcmOperationCurrent(userId, generation, intent);
    await clearFcmRegistration(generation);
    assertFcmOperationCurrent(userId, generation, intent);
    return {status: 'skipped' as const};
  }

  const {
    tokenId: storedTokenId,
    userId: storedUserId,
    token: storedToken,
    clientInstanceId: storedClientInstanceId,
  } = await getStoredFcmRegistration();
  assertFcmOperationCurrent(userId, generation, intent);
  const optOut = await getFcmOptOutState(userId, generation);
  assertFcmOperationCurrent(userId, generation, intent);
  const attempts = await getFcmRegistrationAttempts(userId, generation);
  assertFcmOperationCurrent(userId, generation, intent);
  const cleanupTargets: Array<{
    tokenId: number;
    attempt: typeof attempts[number] | null;
    mustCompensate: boolean;
  }> = [];
  let performedCleanup = false;
  const initialTokenId = storedUserId === userId ? storedTokenId : optOut?.tokenId ?? null;
  if (initialTokenId) {
    cleanupTargets.push({tokenId: initialTokenId, attempt: null, mustCompensate: false});
  }
  const clientInstanceId = await getOrCreateClientInstanceId();
  assertFcmOperationCurrent(userId, generation, intent);
  await loadCleanupRefreshToken(context);
  assertFcmOperationCurrent(userId, generation, intent);

  for (const attempt of attempts) {
    assertFcmOperationCurrent(userId, generation, intent);
    const registrationObligation = addFcmObligation(context, {
      accessToken: context.accessToken ?? accessToken,
      userId,
      clientInstanceId: attempt.clientInstanceId,
      kind: 'registration',
      token: attempt.token,
      tokenId: null,
    });
    await persistFcmObligationBeforeSend(context, registrationObligation);
    const recovered = await registerMyFcmToken(
      context.accessToken ?? accessToken,
      {
        appVersion: APP_VERSION,
        clientInstanceId: attempt.clientInstanceId,
        deviceType: getDeviceType(),
        token: attempt.token,
      },
      generation,
      (tokens) => updateFcmOperationCredentials(context, tokens),
    );
    registrationObligation.state = 'registered';
    registrationObligation.tokenId = recovered.tokenId;
    if (context.capturedForCleanup) {
      await markFcmRemoteCleanupPending([registrationObligation]);
    }
    // Once recovery POST reached the server its exact DELETE is compensation,
    // not a user-intent action. Finish it before observing a newer Enable and
    // before starting the next recovery attempt.
    const deactivationObligation = addFcmObligation(context, {
      accessToken: context.accessToken ?? accessToken,
      userId,
      clientInstanceId: attempt.clientInstanceId,
      kind: 'deactivation',
      token: null,
      tokenId: recovered.tokenId,
    });
    await persistFcmObligationBeforeSend(context, deactivationObligation);
    try {
      await deactivateMyFcmToken(
        context.accessToken ?? accessToken,
        recovered.tokenId,
        generation,
        (tokens) => updateFcmOperationCredentials(context, tokens),
      );
    } catch (error) {
      if (!(error instanceof FaithLogApiError && error.detail.status === 404)) throw error;
    }
    registrationObligation.state = 'cleaned';
    deactivationObligation.state = 'cleaned';
    await clearFcmRegistrationAttempt(attempt, generation);
    performedCleanup = true;
  }

  if (cleanupTargets.length === 0) {
    assertFcmOperationCurrent(userId, generation, intent);
    await clearFcmRegistration(generation);
    assertFcmOperationCurrent(userId, generation, intent);
    await saveFcmOptOut(userId, clientInstanceId, generation, {status: 'confirmed'});
    assertFcmOperationCurrent(userId, generation, intent);
    return {status: performedCleanup ? 'deactivated' as const : 'skipped' as const};
  }

  try {
    for (const target of cleanupTargets) {
      if (!target.mustCompensate) {
        assertFcmOperationCurrent(userId, generation, intent);
      }
      if (isFcmOperationCurrent(userId, generation, intent)) {
        await saveFcmOptOut(userId, clientInstanceId, generation, {
          status: 'pending', tokenId: target.tokenId,
        });
        if (!target.mustCompensate) {
          assertFcmOperationCurrent(userId, generation, intent);
        }
      }
      const outcomeUnknownAttempt = !target.mustCompensate && storedToken &&
        (storedClientInstanceId ?? clientInstanceId)
        ? {
            userId,
            clientInstanceId: storedClientInstanceId ?? clientInstanceId,
            token: storedToken,
          }
        : null;
      if (outcomeUnknownAttempt) {
        const saved = await saveFcmRegistrationAttempt(outcomeUnknownAttempt, generation);
        if (!saved) throw new Error('Unable to persist FCM deactivation reconciliation.');
      }
      const deactivationObligation = addFcmObligation(context, {
        accessToken: context.accessToken ?? accessToken,
        userId,
        clientInstanceId: target.attempt?.clientInstanceId ?? clientInstanceId,
        kind: 'deactivation',
        token: null,
        tokenId: target.tokenId,
      });
      await persistFcmObligationBeforeSend(context, deactivationObligation);
      try {
        if (!target.mustCompensate) {
          assertFcmOperationCurrent(userId, generation, intent);
        }
        await deactivateMyFcmToken(
          context.accessToken ?? accessToken,
          target.tokenId,
          generation,
          (tokens) => updateFcmOperationCredentials(context, tokens),
        );
      } catch (error) {
        if (!(error instanceof FaithLogApiError && error.detail.status === 404)) {
          // The server may have applied DELETE even when its response was lost.
          // Do not let a newer Enable trust the stale local registration.
          await clearFcmRegistration(generation);
          throw error;
        }
      }
      deactivationObligation.state = 'cleaned';
      performedCleanup = true;
      for (const obligation of context.obligations) {
        if (obligation.kind === 'registration' && obligation.tokenId === target.tokenId) {
          obligation.state = 'cleaned';
        }
      }
      await clearFcmRegistration(generation);
      if (target.attempt) {
        await clearFcmRegistrationAttempt(target.attempt, generation);
      }
      if (outcomeUnknownAttempt) {
        await clearFcmRegistrationAttempt(outcomeUnknownAttempt, generation);
      }
      assertFcmOperationCurrent(userId, generation, intent);
    }
    assertFcmOperationCurrent(userId, generation, intent);
    await clearFcmRegistration(generation);
    assertFcmOperationCurrent(userId, generation, intent);
    await saveFcmOptOut(userId, clientInstanceId, generation, {status: 'confirmed'});
    assertFcmOperationCurrent(userId, generation, intent);

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
  return {
    generation,
    accessToken: undefined,
    refreshToken: undefined,
    capturedForCleanup: false,
    obligations: new Set(),
    promise: Promise.resolve(),
  };
}

async function loadCleanupRefreshToken(context: PendingFcmOperation) {
  if (context.refreshToken !== undefined) return context.refreshToken;
  const session = await getStoredAuthSession(context.generation);
  assertFcmAuthSessionCurrent(context.generation);
  context.refreshToken = session.refreshToken;
  return context.refreshToken;
}

function addFcmObligation(
  context: PendingFcmOperation,
  obligation: Omit<FcmRemoteCleanupObligation, 'state'>,
) {
  const tracked: FcmRemoteCleanupObligation = {
    ...obligation,
    accessToken: context.accessToken ?? obligation.accessToken,
    refreshToken: obligation.refreshToken ?? context.refreshToken ?? null,
    state: 'mayHaveSent',
  };
  context.obligations.add(tracked);
  return tracked;
}

async function persistFcmObligationBeforeSend(
  context: PendingFcmOperation,
  obligation: FcmRemoteCleanupObligation,
) {
  if (context.capturedForCleanup) {
    await markFcmRemoteCleanupPending([obligation]);
  }
}

async function updateFcmOperationCredentials(
  context: PendingFcmOperation,
  tokens: {accessToken: string; refreshToken: string},
) {
  context.accessToken = tokens.accessToken;
  context.refreshToken = tokens.refreshToken;
  const pending = [...context.obligations].filter((obligation) => obligation.state !== 'cleaned');
  pending.forEach((obligation) => {
    obligation.accessToken = tokens.accessToken;
    obligation.refreshToken = tokens.refreshToken;
  });
  if (context.capturedForCleanup && pending.length > 0) {
    await markFcmRemoteCleanupPending(pending);
  }
}

function contextClientInstanceId(context: PendingFcmOperation) {
  return [...context.obligations].at(-1)?.clientInstanceId ?? '';
}

export async function compensateCapturedFcmOperations(
  obligations: FcmRemoteCleanupObligation[],
) {
  const logoutCandidates = obligations.filter((obligation) =>
    obligation.kind === 'clientLogout' && obligation.state !== 'cleaned');
  const canonicalLogout = logoutCandidates.find((obligation) =>
    obligation.clientInstanceId === null) ?? logoutCandidates[0];
  for (const duplicate of logoutCandidates) {
    if (duplicate !== canonicalLogout) duplicate.state = 'cleaned';
  }
  const priority = (obligation: FcmRemoteCleanupObligation) =>
    obligation.kind === 'registration' || obligation.kind === 'deactivation'
      ? 0
      : obligation.kind === 'clientLogout'
        ? 1
        : 2;
  const pending = obligations
    .filter((obligation) => obligation.state !== 'cleaned')
    .sort((left, right) => priority(left) - priority(right));
  for (const obligation of pending) {
    try {
      await compensateFcmObligation(obligation);
    } catch (error) {
      if (!isCleanupCredentialExpired(error) || !obligation.refreshToken) throw error;
      const previousRefreshToken = obligation.refreshToken;
      const refreshed = await refreshAuthTokenForCleanup(previousRefreshToken);
      const sameCredentialObligations = obligations.filter(
        (candidate) => candidate.refreshToken === previousRefreshToken,
      );
      for (const candidate of sameCredentialObligations) {
        candidate.accessToken = refreshed.accessToken;
        candidate.refreshToken = refreshed.refreshToken;
      }
      const introduced: FcmRemoteCleanupObligation[] = [];
      if (obligation.kind !== 'clientLogout') {
        const existingLogout = obligations.find((candidate) =>
          candidate.kind === 'clientLogout' && candidate.state !== 'cleaned');
        if (!existingLogout) {
          const logoutObligation: FcmRemoteCleanupObligation = {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            userId: null,
            // null means "resolve the current device client at execution time".
            // A cleanup for an old client must never stand in for the current
            // device/session logout.
            clientInstanceId: null,
            kind: 'clientLogout',
            token: null,
            tokenId: null,
            state: 'mayHaveSent',
          };
          obligations.push(logoutObligation);
          pending.push(logoutObligation);
          introduced.push(logoutObligation);
        } else {
          existingLogout.accessToken = refreshed.accessToken;
          existingLogout.refreshToken = refreshed.refreshToken;
        }
      }
      await markFcmRemoteCleanupPending([...sameCredentialObligations, ...introduced]);
      await compensateFcmObligation(obligation);
    }
    obligation.state = 'cleaned';
    if (
      obligation.kind === 'registration' && obligation.userId &&
      obligation.clientInstanceId && obligation.token
    ) {
      await clearFcmRegistrationAttemptAfterRemoteCleanup({
        userId: obligation.userId,
        clientInstanceId: obligation.clientInstanceId,
        token: obligation.token,
      });
    }
  }
  return pending;
}

async function compensateFcmObligation(obligation: FcmRemoteCleanupObligation) {
  if (obligation.kind === 'clientRetirement') {
    if (!obligation.clientInstanceId) throw new Error('Missing FCM client retirement identity.');
    await clearFcmRegistrationAttemptsForClientInstance(obligation.clientInstanceId);
    const currentClientInstanceId = await getStoredClientInstanceId();
    if (currentClientInstanceId === obligation.clientInstanceId) {
      const rotated = await rotateClientInstanceId(obligation.clientInstanceId);
      if (!rotated) throw new Error('The retired client instance changed unexpectedly.');
    }
    return;
  }
  if (obligation.kind === 'clientLogout') {
    // A clientLogout is the credential-family/session terminal. Always prefer
    // the current device client; a legacy client id is only a fallback when
    // device metadata is unavailable.
    const clientInstanceId = await getStoredClientInstanceId() ?? obligation.clientInstanceId;
    await logoutUser(obligation.accessToken, {
      ...(obligation.refreshToken ? {refreshToken: obligation.refreshToken} : {}),
      ...(clientInstanceId
        ? {clientInstanceId}
        : {}),
    });
    if (clientInstanceId) {
      const retirement: FcmRemoteCleanupObligation = {
        accessToken: obligation.accessToken,
        refreshToken: null,
        userId: null,
        clientInstanceId,
        kind: 'clientRetirement',
        token: null,
        tokenId: null,
        state: 'mayHaveSent',
      };
      await replaceFcmRemoteCleanupObligations([obligation], [retirement]);
      await clearFcmRegistrationAttemptsForClientInstance(clientInstanceId);
      const current = await getStoredClientInstanceId();
      if (current === clientInstanceId) {
        const rotated = await rotateClientInstanceId(clientInstanceId);
        if (!rotated) throw new Error('The retired client instance changed unexpectedly.');
      }
      await replaceFcmRemoteCleanupObligations([retirement], []);
    }
    return;
  }
  let tokenId = obligation.tokenId;
  if (obligation.kind === 'registration' && !tokenId) {
    if (!obligation.token) throw new Error('Missing FCM token for remote cleanup.');
    if (!obligation.clientInstanceId) throw new Error('Missing FCM client for remote cleanup.');
    const recovered = await registerMyFcmTokenForCleanup(obligation.accessToken, {
      appVersion: APP_VERSION,
      clientInstanceId: obligation.clientInstanceId,
      deviceType: getDeviceType(),
      token: obligation.token,
    });
    tokenId = recovered.tokenId;
    obligation.tokenId = tokenId;
    await markFcmRemoteCleanupPending([obligation]);
  }
  if (!tokenId) throw new Error('Missing FCM token id for remote cleanup.');
  try {
    await deactivateMyFcmTokenForCleanup(obligation.accessToken, tokenId);
  } catch (error) {
    if (!(error instanceof FaithLogApiError && error.detail.status === 404)) throw error;
  }
}

function isCleanupCredentialExpired(error: unknown) {
  return error instanceof FaithLogApiError &&
    (error.detail.status === 401 || error.detail.kind === 'sessionExpired');
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
  fcmPrivacyIntentQueue = Promise.resolve();
  fcmIntents.clear();
  frozenFcmGenerations.clear();
  nextFcmFreezeEpoch = 1;
}

function enqueueFcmPrivacyIntent(run: () => Promise<void>) {
  const operation = fcmPrivacyIntentQueue.then(run, run);
  fcmPrivacyIntentQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function assertFcmOperationCurrent(
  userId: number,
  generation: AuthSessionGeneration,
  intent: FcmIntent | null,
) {
  assertFcmAuthSessionCurrent(generation);
  assertFcmIntentCurrent(userId, intent);
}

function isFcmOperationCurrent(
  userId: number,
  generation: AuthSessionGeneration,
  intent: FcmIntent | null,
) {
  return isAuthSessionGenerationCurrent(generation) &&
    isAuthSessionRequestAllowed(generation) &&
    (!intent || isFcmIntentCurrent(userId, intent));
}

configureFcmTransitionCleanup({
  capture: capturePendingFcmOperations,
  compensate: compensateCapturedFcmOperations,
});
