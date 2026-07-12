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
  clearFcmRemoteCleanupObligationsAndMarkTerminal,
  clearFcmRegistrationAttempt,
  clearFcmRegistrationAttemptAfterRemoteCleanup,
  clearFcmRegistrationAttemptsForClientInstance,
  clearFcmOptOut,
  getAuthSessionGeneration,
  getStoredAuthSession,
  getStoredClientInstanceId,
  getOrCreateClientInstanceId,
  getFcmOptOutState,
  getFcmRegistrationAttempts,
  hasUnclaimedFcmRemoteCleanupPending,
  getStoredFcmRegistration,
  isFcmOptedOut,
  isAuthSessionGenerationCurrent,
  isAuthSessionRequestAllowed,
  saveFcmRegistration,
  saveFcmRegistrationAttempt,
  saveFcmOptOut,
  markFcmRemoteCleanupPending,
  claimFcmRemoteCleanupForAccountDeletion,
  completeFcmAccountDeletionClaim,
  markFcmAccountDeletionClaimCascadeConfirmed,
  restoreFcmAccountDeletionClaim,
  replaceFcmRemoteCleanupObligationsAndMarkTransition,
  rotateClientInstanceId,
  type AuthSessionGeneration,
  CorruptFcmPrivacyStateError,
} from '../api/tokenStorage';
import type {FcmTokenRegisterResponse} from '../api/types';
import {trackFcmTransitionBarrier} from '../auth/fcmTransitionCleanup';
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
  state: 'prepared' | 'mayHaveSent' | 'registered' | 'cleaned';
};

export type FcmCleanupCompensationObserver = {
  onObligationIntroduced?: (obligation: FcmRemoteCleanupObligation) => void;
  onRequestDispatch?: (obligation: FcmRemoteCleanupObligation) => void;
  onObligationReplaced?: (
    completed: FcmRemoteCleanupObligation,
    replacement: FcmRemoteCleanupObligation | null,
  ) => void;
};

const pendingFcmRegistrations = new Set<PendingFcmOperation>();
let fcmRegistrationQueue: Promise<void> = Promise.resolve();
let fcmPrivacyIntentQueue: Promise<void> = Promise.resolve();
const frozenFcmGenerations = new Map<number, number>();
const accountDeletionInFlight = new Map<number, Promise<unknown>>();
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
  if (frozenFcmGenerations.has(generation)) {
    throw new FaithLogApiError({
      kind: 'conflict',
      code: 'FCM_TRANSITION_IN_PROGRESS',
      message: '계정 전환 정리가 완료될 때까지 다시 시도할 수 없습니다.',
      authSessionGeneration: generation,
    });
  }
  const epoch = nextFcmFreezeEpoch++;
  frozenFcmGenerations.set(generation, epoch);
  const captured = capturePendingFcmOperations(generation);
  const initialObligations = captured.obligations ?? [];
  const persisted = initialObligations.length > 0
    ? markFcmRemoteCleanupPending(initialObligations)
    : Promise.resolve();
  const claimedReceipts = (async () => {
    await Promise.all([persisted, captured.barrier]);
    const settled = await captured.settlement;
    return [
      ...initialObligations,
      ...settled,
    ];
  })();
  return {
    join: () => claimedReceipts.then(() => undefined),
    claimForDelete: async () => {
      const receipts = await claimedReceipts;
      if (receipts.length === 0) return false;
      await claimFcmRemoteCleanupForAccountDeletion(
        receipts,
        receipts.filter((receipt) =>
          receipt.state === 'mayHaveSent' || receipt.state === 'registered'),
      );
      return true;
    },
    restore: restoreFcmAccountDeletionClaim,
    confirmCascade: markFcmAccountDeletionClaimCascadeConfirmed,
    complete: completeFcmAccountDeletionClaim,
    release: () => {
      if (frozenFcmGenerations.get(generation) === epoch) {
        frozenFcmGenerations.delete(generation);
      }
    },
  };
}

export async function runAccountDeletionWithFcmPreflight<T>(
  generation: AuthSessionGeneration,
  resolveLatestAccessToken: () => Promise<string | null>,
  deleteAccount: (accessToken: string) => Promise<T>,
): Promise<
  {status: 'completed'; value: T; cleanupWarning?: string} | {status: 'cancelled'}
> {
  const existing = accountDeletionInFlight.get(generation);
  if (existing) return existing as Promise<
    {status: 'completed'; value: T; cleanupWarning?: string} | {status: 'cancelled'}
  >;
  const operation = runAccountDeletionWithFcmPreflightExclusive(
    generation, resolveLatestAccessToken, deleteAccount,
  ).finally(() => {
    if (accountDeletionInFlight.get(generation) === operation) {
      accountDeletionInFlight.delete(generation);
    }
  });
  accountDeletionInFlight.set(generation, operation);
  return operation;
}

async function runAccountDeletionWithFcmPreflightExclusive<T>(
  generation: AuthSessionGeneration,
  resolveLatestAccessToken: () => Promise<string | null>,
  deleteAccount: (accessToken: string) => Promise<T>,
): Promise<
  {status: 'completed'; value: T; cleanupWarning?: string} | {status: 'cancelled'}
> {
  const preflight = beginAccountDeletionFcmPreflight(generation);
  let claimCreated = false;
  let releaseTransitionBarrier!: () => void;
  let rejectTransitionBarrier!: (error: unknown) => void;
  trackFcmTransitionBarrier(new Promise<void>((resolve, reject) => {
    releaseTransitionBarrier = resolve;
    rejectTransitionBarrier = reject;
  }));
  let completed = false;
  let retainFreezeForAuthTransition = false;
  const restoreOrRetainClaim = async () => {
    try {
      await preflight.restore();
    } catch (restoreError) {
      retainFreezeForAuthTransition = true;
      rejectTransitionBarrier(restoreError);
      throw restoreError;
    }
  };
  try {
    await preflight.join();
    claimCreated = await preflight.claimForDelete();
    if (await hasUnclaimedFcmRemoteCleanupPending()) {
      await restoreOrRetainClaim();
      throw new FaithLogApiError({
        kind: 'conflict',
        code: 'FCM_CLEANUP_PENDING',
        message: '이전 알림 연결 정리를 먼저 완료해야 합니다.',
      });
    }
    let accessToken: string | null;
    try {
      accessToken = await resolveLatestAccessToken();
    } catch (error) {
      await restoreOrRetainClaim();
      retainFreezeForAuthTransition = !isAuthSessionRequestAllowed(generation);
      throw error;
    }
    if (!accessToken || !isAuthSessionRequestAllowed(generation)) {
      retainFreezeForAuthTransition = true;
      await restoreOrRetainClaim();
      return {status: 'cancelled'};
    }
    if (!isAuthSessionRequestAllowed(generation)) {
      retainFreezeForAuthTransition = true;
      await restoreOrRetainClaim();
      return {status: 'cancelled'};
    }
    let value: T;
    try {
      value = await deleteAccount(accessToken);
    } catch (error) {
      if (isAccountDeletionSessionExpiredError(error)) {
        // The account still exists and the captured registration/deactivation
        // result is its desired terminal state. Invalid credentials cannot
        // safely reconcile a teardown gate after restart.
        retainFreezeForAuthTransition = true;
        if (claimCreated) await completeAccountDeletionClaimWithRetry(preflight.complete);
      } else if (isAccountDeletionAuthSessionChangedError(error)) {
        retainFreezeForAuthTransition = true;
        await restoreOrRetainClaim();
      } else {
        await restoreOrRetainClaim();
      }
      throw error;
    }
    completed = true;
    if (!claimCreated) return {status: 'completed', value};
    try {
      await confirmAccountDeletionCascadeWithRetry(preflight.confirmCascade);
      await completeAccountDeletionClaimWithRetry(preflight.complete);
      return {status: 'completed', value};
    } catch {
      retainFreezeForAuthTransition = true;
      return {
        status: 'completed',
        value,
        cleanupWarning: '계정은 삭제됐지만 기기 알림 정리 상태를 저장하지 못했습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.',
      };
    }
  } finally {
    releaseTransitionBarrier();
    if (!completed && !retainFreezeForAuthTransition) preflight.release();
  }
}

async function confirmAccountDeletionCascadeWithRetry(confirm: () => Promise<void>) {
  try {
    await confirm();
  } catch {
    // The storage result can be ambiguous at this boundary. The phase update is
    // idempotent, so a single retry both verifies an applied write and repairs a
    // transient failure without weakening persistent-failure fail-closed behavior.
    await confirm();
  }
}

async function completeAccountDeletionClaimWithRetry(complete: () => Promise<void>) {
  try {
    await complete();
  } catch {
    // Completing an already-completed claim is a no-op, which also makes this a
    // safe read-after-write equivalent when the first result was ambiguous.
    await complete();
  }
}

function isAccountDeletionSessionExpiredError(error: unknown) {
  return error instanceof FaithLogApiError && error.detail.kind === 'sessionExpired';
}

function isAccountDeletionAuthSessionChangedError(error: unknown) {
  return error instanceof FaithLogApiError && error.detail.code === 'AUTH_SESSION_CHANGED';
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

  const clientInstanceId = await getOrCreateClientInstanceId();
  assertFcmAuthSessionCurrent(generation);
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
  let optOut;
  try {
    optOut = await getFcmOptOutState(userId, generation);
  } catch (error) {
    if (error instanceof CorruptFcmPrivacyStateError) {
      return {status: 'optedOutPending', message: '저장된 알림 개인정보 상태를 확인해야 합니다.'};
    }
    throw error;
  }
  if (optOut && unresolvedAttempts.length === 0) {
    return optOut.status === 'confirmed'
      ? {status: 'optedOut', message: '이 기기의 알림 연결을 사용자가 비활성화했습니다.'}
      : {status: 'optedOutPending', message: '서버의 알림 연결 해제를 다시 확인해야 합니다.'};
  }
  if (unresolvedAttempts.length > 0) {
    await clearFcmRegistration(generation);
    return {
      status: 'tokenUnavailable',
      permission: 'authorized' as const,
      message: '이전 알림 등록 결과를 먼저 확인해야 합니다.',
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
    if (stored.clientInstanceId === clientInstanceId && unresolvedAttempts.length === 0) {
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

  let automaticOptOut: Awaited<ReturnType<typeof getFcmOptOutState>> = null;
  if (mode === 'automatic') {
    try {
      automaticOptOut = await getFcmOptOutState(userId, generation);
    } catch (error) {
      if (error instanceof CorruptFcmPrivacyStateError) {
        return {status: 'optedOutPending', message: '저장된 알림 개인정보 상태를 확인해야 합니다.'};
      }
      throw error;
    }
  } else {
    await context.privacyIntent;
    assertFcmOperationCurrent(userId, generation, intent);
  }

  const unresolvedAttempts = await getFcmRegistrationAttempts(userId, generation);
  assertFcmOperationCurrent(userId, generation, intent);
  if (unresolvedAttempts.length > 0) {
    await loadCleanupRefreshToken(context);
    await reconcileFcmRegistrationAttempts(
      accessToken, userId, generation, context, unresolvedAttempts,
    );
    assertFcmOperationCurrent(userId, generation, intent);
  }
  if (automaticOptOut) {
    return automaticOptOut.status === 'confirmed'
      ? {status: 'optedOut', message: '이 기기의 알림 연결을 사용자가 비활성화했습니다.'}
      : {status: 'optedOutPending', message: '서버의 알림 연결 해제를 다시 확인해야 합니다.'};
  }

  const permission = await requestNotificationPermission();
  assertFcmIntentCurrent(userId, intent);

  if (permission !== 'authorized') {
    return {status: 'permissionDenied', permission};
  }

  let stored = await getStoredFcmRegistration();
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

  if (unresolvedAttempts.length > 0) stored = await getStoredFcmRegistration();

  if (
    stored.userId === userId &&
    stored.tokenId &&
    stored.token === deviceTokenResult.token
  ) {
    const clientInstanceId = await getOrCreateClientInstanceId();
    assertFcmAuthSessionCurrent(generation);
    if (
      stored.clientInstanceId === clientInstanceId &&
      unresolvedAttempts.length === 0
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
  hasPendingContexts?: boolean;
  hasServerObligations?: () => boolean;
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
    hasPendingOperations: obligations.some((obligation) => obligation.state !== 'prepared'),
    hasPendingContexts: pendingAtCapture.length > 0,
    hasServerObligations: () => pendingAtCapture.some((operation) =>
      [...operation.obligations].some((obligation) =>
        obligation.state === 'mayHaveSent' || obligation.state === 'registered')),
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
  const unresolvedAttempts = await getFcmRegistrationAttempts(userId, generation);
  assertFcmAuthSessionCurrent(generation);
  if (unresolvedAttempts.length > 0) {
    if (context) {
      await loadCleanupRefreshToken(context);
      await reconcileFcmRegistrationAttempts(
        accessToken, userId, generation, context, unresolvedAttempts,
      );
    } else {
      return null;
    }
    assertFcmAuthSessionCurrent(generation);
  }
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
    context && obligation
      ? () => markFcmObligationDispatched(context, obligation)
      : undefined,
  );
  if (obligation) {
    if (obligation.state !== 'prepared') obligation.state = 'registered';
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
      () => markFcmObligationDispatched(context, obligation),
    );
    if (obligation.state !== 'prepared') obligation.state = 'cleaned';
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

  if (attempts.length > 0) {
    await reconcileFcmRegistrationAttempts(
      accessToken, userId, generation, context, attempts,
    );
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
          () => markFcmObligationDispatched(context, deactivationObligation),
        );
      } catch (error) {
        if (!(error instanceof FaithLogApiError && error.detail.status === 404)) {
          // The server may have applied DELETE even when its response was lost.
          // Do not let a newer Enable trust the stale local registration.
          await clearFcmRegistration(generation);
          throw error;
        }
      }
      if (deactivationObligation.state !== 'prepared') {
        deactivationObligation.state = 'cleaned';
      }
      performedCleanup = true;
      for (const obligation of context.obligations) {
        if (obligation.kind === 'registration' && obligation.tokenId === target.tokenId) {
          if (obligation.state !== 'prepared') obligation.state = 'cleaned';
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

async function reconcileFcmRegistrationAttempts(
  accessToken: string,
  userId: number,
  generation: AuthSessionGeneration,
  context: PendingFcmOperation,
  attempts: Awaited<ReturnType<typeof getFcmRegistrationAttempts>>,
) {
  for (const attempt of attempts) {
    // Reconciliation is privacy debt, not the current Enable/Disable intent.
    // Once started, each recovery POST is followed by its exact DELETE and
    // local repair before another user intent can take effect.
    assertFcmAuthSessionCurrent(generation);
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
      () => markFcmObligationDispatched(context, registrationObligation),
    );
    if (registrationObligation.state !== 'prepared') {
      registrationObligation.state = 'registered';
    }
    registrationObligation.tokenId = recovered.tokenId;
    if (context.capturedForCleanup) {
      await markFcmRemoteCleanupPending([registrationObligation]);
    }
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
        () => markFcmObligationDispatched(context, deactivationObligation),
      );
    } catch (error) {
      if (!(error instanceof FaithLogApiError && error.detail.status === 404)) throw error;
    }
    if (registrationObligation.state !== 'prepared') registrationObligation.state = 'cleaned';
    if (deactivationObligation.state !== 'prepared') deactivationObligation.state = 'cleaned';

    const stored = await getStoredFcmRegistration();
    if (
      stored.tokenId === recovered.tokenId ||
      (stored.clientInstanceId === attempt.clientInstanceId && stored.token === attempt.token)
    ) {
      await clearFcmRegistration(generation);
    }
    await clearFcmRegistrationAttempt(attempt, generation);
  }
}

function addFcmObligation(
  context: PendingFcmOperation,
  obligation: Omit<FcmRemoteCleanupObligation, 'state'>,
) {
  const tracked: FcmRemoteCleanupObligation = {
    ...obligation,
    accessToken: context.accessToken ?? obligation.accessToken,
    refreshToken: obligation.refreshToken ?? context.refreshToken ?? null,
    state: 'prepared',
  };
  context.obligations.add(tracked);
  return tracked;
}

function markFcmObligationDispatched(
  _context: PendingFcmOperation,
  obligation: FcmRemoteCleanupObligation,
) {
  if (obligation.state === 'prepared') obligation.state = 'mayHaveSent';
}

async function persistFcmObligationBeforeSend(
  context: PendingFcmOperation,
  obligation: FcmRemoteCleanupObligation,
) {
  if (context.capturedForCleanup) {
    await markFcmRemoteCleanupPending([withoutLiveFcmState(obligation)]);
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
    await markFcmRemoteCleanupPending(pending.map(withoutLiveFcmState));
  }
}

function withoutLiveFcmState(obligation: FcmRemoteCleanupObligation) {
  const {state: _state, ...durable} = obligation;
  return durable;
}

function contextClientInstanceId(context: PendingFcmOperation) {
  return [...context.obligations].at(-1)?.clientInstanceId ?? '';
}

export async function compensateCapturedFcmOperations(
  obligations: FcmRemoteCleanupObligation[],
  observer: FcmCleanupCompensationObserver = {},
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
      await compensateFcmObligation(obligation, observer);
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
          observer.onObligationIntroduced?.(logoutObligation);
        } else {
          existingLogout.accessToken = refreshed.accessToken;
          existingLogout.refreshToken = refreshed.refreshToken;
        }
      }
      await persistFcmCleanupReceiptsWithRetry([
        ...sameCredentialObligations,
        ...introduced,
      ]);
      await compensateFcmObligation(obligation, observer);
    }
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
    if (obligation.kind === 'registration' || obligation.kind === 'deactivation') {
      const sessionLogout = obligations.find((candidate) =>
        candidate.kind === 'clientLogout' && candidate.state !== 'cleaned');
      if (sessionLogout) {
        await replaceFcmCleanupReceiptsWithRetry(
          [obligation], [sessionLogout], () => {
            obligation.state = 'cleaned';
            observer.onObligationReplaced?.(obligation, null);
          },
        );
      } else {
        await clearFcmCleanupReceiptsWithRetry([obligation], () => {
          obligation.state = 'cleaned';
          observer.onObligationReplaced?.(obligation, null);
        });
      }
    }
    if (obligation.state !== 'cleaned') {
      obligation.state = 'cleaned';
      observer.onObligationReplaced?.(obligation, null);
    }
  }
  return pending;
}

async function compensateFcmObligation(
  obligation: FcmRemoteCleanupObligation,
  observer: FcmCleanupCompensationObserver,
) {
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
    const body = {
      ...(obligation.refreshToken ? {refreshToken: obligation.refreshToken} : {}),
      ...(clientInstanceId
        ? {clientInstanceId}
        : {}),
    };
    if (observer.onRequestDispatch) {
      await logoutUser(obligation.accessToken, body, () => {
        obligation.state = 'mayHaveSent';
        observer.onRequestDispatch?.(obligation);
      });
    } else {
      await logoutUser(obligation.accessToken, body);
    }
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
      await replaceFcmCleanupReceiptsWithRetry([obligation], [retirement], () => {
        // This state transition runs before the storage lock releases.
        obligation.state = 'cleaned';
        observer.onObligationReplaced?.(obligation, retirement);
      });
      await clearFcmRegistrationAttemptsForClientInstance(clientInstanceId);
      const current = await getStoredClientInstanceId();
      if (current === clientInstanceId) {
        const rotated = await rotateClientInstanceId(clientInstanceId);
        if (!rotated) throw new Error('The retired client instance changed unexpectedly.');
      }
      await replaceFcmCleanupReceiptsWithRetry([retirement], [], () => {
        retirement.state = 'cleaned';
        observer.onObligationReplaced?.(retirement, null);
      });
    } else {
      await clearFcmCleanupReceiptsWithRetry([obligation], () => {
        obligation.state = 'cleaned';
        observer.onObligationReplaced?.(obligation, null);
      });
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

async function persistFcmCleanupReceiptsWithRetry(
  obligations: FcmRemoteCleanupObligation[],
) {
  try {
    await markFcmRemoteCleanupPending(obligations);
  } catch {
    await markFcmRemoteCleanupPending(obligations);
  }
}

async function replaceFcmCleanupReceiptsWithRetry(
  completed: FcmRemoteCleanupObligation[],
  replacements: FcmRemoteCleanupObligation[],
  markTransition: () => void,
) {
  try {
    await replaceFcmRemoteCleanupObligationsAndMarkTransition(
      completed, replacements, markTransition,
    );
  } catch {
    await replaceFcmRemoteCleanupObligationsAndMarkTransition(
      completed, replacements, markTransition,
    );
  }
}

async function clearFcmCleanupReceiptsWithRetry(
  completed: FcmRemoteCleanupObligation[],
  markTerminal: () => void,
) {
  try {
    await clearFcmRemoteCleanupObligationsAndMarkTerminal(completed, markTerminal);
  } catch {
    await clearFcmRemoteCleanupObligationsAndMarkTerminal(completed, markTerminal);
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
  accountDeletionInFlight.clear();
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
