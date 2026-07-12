import {
  FaithLogApiError,
  fetchCurrentUser,
  fetchMyCampuses,
  loginUser,
  logoutUser,
  refreshAuthToken,
  signupUser,
} from '../api/client';
import {
  beginAuthSession,
  clearTokens,
  clearFcmRegistrationAttemptsForClientInstance,
  getAuthSessionGeneration,
  getStoredSelectedCampusId,
  getStoredAuthSession,
  isAuthSessionRequestAllowed,
  isAuthSessionGenerationCurrent,
  markAuthSessionClosing,
  rotateClientInstanceId,
  saveSelectedCampusId,
  saveTokens,
  StaleAuthSessionReadError,
  type AuthSessionGeneration,
} from '../api/tokenStorage';
import type {
  ApiError,
  CampusMembershipSummary,
  CurrentUser,
  LoginRequest,
  LoginResponse,
  SignupRequest,
} from '../api/types';
import {capturePendingFcmOperations} from '../notifications/fcmRegistration';
import {getLogoutFcmDeactivationPayload} from './fcmLogout';
import {trackLocalSessionCleanup, waitForLocalSessionCleanup} from './localCleanupBarrier';
import {
  collectRefreshTokensForLogout,
  discardAllRefreshLogoutHandoffs,
  hasIssuedRefreshTokens,
  settleRefreshHandoffsForAuthEntry,
  trackRefreshForLogout,
} from './refreshLogoutHandoff';
import {expireAuthSession} from './sessionExpiration';
export {trackLocalSessionCleanup} from './localCleanupBarrier';

export type AuthenticatedSession = {
  status: 'authenticated';
  user: CurrentUser;
  activeCampuses: CampusMembershipSummary[];
  selectedCampus: CampusMembershipSummary;
};

export type SessionResolution =
  | AuthenticatedSession
  | {status: 'noCampus'; user: CurrentUser};

export type LogoutResult =
  | {status: 'signedOut'}
  | {status: 'signedOutWithRemoteWarning'; message: string};

export type PreparedLogout = {
  completeRemoteLogout: () => Promise<LogoutResult>;
};

type RemoteLogoutFlight = {
  cancelBeforeSend: () => boolean;
  promise: Promise<LogoutResult>;
};
const remoteLogoutFlights = new Set<RemoteLogoutFlight>();
let remoteLogoutRestartRequired = false;
const logoutPreparationByGeneration = new Map<AuthSessionGeneration, Promise<PreparedLogout>>();
const LOGOUT_PREPARATION_TIMEOUT_MS = 5_000;
const REMOTE_LOGOUT_BARRIER_TIMEOUT_MS = 21_000;

export async function loginAndEstablishSession(credentials: LoginRequest): Promise<SessionResolution> {
  await waitForAuthEntryAvailability();
  const generation = await beginAuthSession();

  try {
    const loginResponse = await loginUser(credentials);
    const session = await establishSession(loginResponse, generation);
    const saved = await saveTokens(loginResponse, generation);

    if (!saved) {
      throw createAuthSessionChangedError(generation);
    }

    return session;
  } catch (error) {
    await clearTokens(generation);
    throw error;
  }
}

export async function signupAfterSessionCleanup(request: SignupRequest) {
  await waitForAuthEntryAvailability();
  return signupUser(request);
}

export async function refreshAndEstablishSession(
  refreshToken: string,
  generation: AuthSessionGeneration,
): Promise<SessionResolution> {
  try {
    const trackedRefresh = trackRefreshForLogout(
      generation,
      (onIssued) => refreshAuthToken(refreshToken, generation, onIssued),
    );
    const tokens = await trackedRefresh;
    const saved = await saveTokens(tokens, generation);

    if (!saved) {
      throw createAuthSessionChangedError(generation);
    }

    if (!isAuthSessionRequestAllowed(generation)) {
      throw createAuthSessionChangedError(generation);
    }
    trackedRefresh.discardAfterCommit();

    return establishSession(tokens, generation);
  } catch (error) {
    if (isAuthSessionRequestAllowed(generation) && hasIssuedRefreshTokens(generation)) {
      await expireAuthSession(generation);
    }
    if (error instanceof FaithLogApiError && error.detail.kind === 'sessionExpired') {
      await clearTokens(generation);
    }

    throw error;
  }
}

export async function logoutCurrentSession(userId?: number): Promise<LogoutResult> {
  const prepared = await prepareCurrentSessionLogout(userId);
  return prepared.completeRemoteLogout();
}

export function prepareCurrentSessionLogout(
  userId?: number,
): Promise<PreparedLogout> {
  const generation = getAuthSessionGeneration();
  const existing = logoutPreparationByGeneration.get(generation);
  if (existing) return existing;
  const operation = prepareCurrentSessionLogoutInternal(userId, generation);
  const tracked = trackLocalSessionCleanup(operation, {
    isCancellation: (error) => error instanceof StaleAuthSessionReadError,
  });
  const shared = tracked.finally(() => {
    if (logoutPreparationByGeneration.get(generation) === shared) {
      logoutPreparationByGeneration.delete(generation);
    }
  });
  logoutPreparationByGeneration.set(generation, shared);
  return shared;
}

async function prepareCurrentSessionLogoutInternal(
  userId?: number,
  expectedGeneration: AuthSessionGeneration = getAuthSessionGeneration(),
): Promise<PreparedLogout> {
  if (!markAuthSessionClosing(expectedGeneration)) {
    throw new StaleAuthSessionReadError(expectedGeneration);
  }
  const handedOffTokensPromise = collectRefreshTokensForLogout(expectedGeneration);
  const fcmOperations = capturePendingFcmOperations();
  let authSession: Awaited<ReturnType<typeof getStoredAuthSession>>;
  let preparationWarning: string | null = null;

  try {
    authSession = await getStoredAuthSession(expectedGeneration);
  } catch (error) {
    if (error instanceof StaleAuthSessionReadError) throw error;
    preparationWarning = '로컬 세션은 종료했지만 서버 로그아웃 정보는 확인하지 못했습니다.';
    authSession = {
      generation: expectedGeneration,
      accessToken: null,
      refreshToken: null,
    };
  }

  const cleared = await clearTokens(expectedGeneration);

  if (!cleared) {
    throw new StaleAuthSessionReadError(expectedGeneration);
  }

  const fcmPayloadPromise = getLogoutFcmDeactivationPayload(userId).then(
    (payload) => ({payload, failed: false as const}),
    () => ({payload: {}, failed: true as const}),
  );
  const [handedOffTokens, fcmResult] = await Promise.all([
    handedOffTokensPromise,
    fcmPayloadPromise,
  ]);
  let fcmPayload: Awaited<ReturnType<typeof getLogoutFcmDeactivationPayload>> = fcmResult.payload;
  if (fcmResult.failed) {
    preparationWarning ??=
      '서버 로그아웃은 요청했지만 기기 알림 연결 해제 여부는 확인하지 못했습니다.';
  }
  const remoteAuthSession = handedOffTokens
    ? {
        ...authSession,
        accessToken: handedOffTokens.accessToken,
        refreshToken: handedOffTokens.refreshToken,
      }
    : authSession;
  if (!remoteAuthSession.accessToken) {
    preparationWarning ??=
      '로컬 세션은 종료했지만 서버 로그아웃 정보는 확인하지 못했습니다.';
  }

  const remoteLogout = trackRemoteLogout((isCancelled, markSent) =>
    completeRemoteLogout(
      remoteAuthSession,
      fcmPayload,
      fcmOperations.barrier,
      fcmOperations.settlement,
      fcmOperations.hasPendingOperations,
      preparationWarning,
      isCancelled,
      markSent,
    ),
  );

  return {
    completeRemoteLogout: () => remoteLogout,
  };
}

async function completeRemoteLogout(
  authSession: Awaited<ReturnType<typeof getStoredAuthSession>>,
  fcmPayload: Awaited<ReturnType<typeof getLogoutFcmDeactivationPayload>>,
  fcmRegistrationBarrier: Promise<void>,
  fcmOperationSettlement: Promise<{accessToken: string; clientInstanceId: string} | null>,
  fcmOperationsMayHaveReachedServer: boolean,
  preparationWarning: string | null,
  isCancelled: () => boolean,
  markSent: () => void,
): Promise<LogoutResult> {
  if (fcmOperationsMayHaveReachedServer) markSent();
  await fcmRegistrationBarrier;
  const fcmOperationCredential = await fcmOperationSettlement;
  if (isCancelled()) {
    return {
      status: 'signedOutWithRemoteWarning',
      message: '원격 로그아웃 정리가 지연되어 앱 재시작 후 다시 확인해야 합니다.',
    };
  }
  const accessToken = authSession.accessToken ?? fcmOperationCredential?.accessToken ?? null;
  const {refreshToken} = authSession;
  if (!fcmPayload.clientInstanceId && fcmOperationCredential?.clientInstanceId) {
    fcmPayload = {...fcmPayload, clientInstanceId: fcmOperationCredential.clientInstanceId};
  }
  let remoteWarning = preparationWarning;
  let remoteLogoutConfirmed = false;

  if (!accessToken && (fcmOperationsMayHaveReachedServer || fcmPayload.clientInstanceId)) {
    remoteLogoutRestartRequired = true;
    remoteWarning =
      '이전 알림 등록의 원격 정리를 확인하지 못했습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.';
  }

  if (accessToken) {
    try {
      markSent();
      await logoutUser(accessToken, {
        ...(refreshToken ? {refreshToken} : {}),
        ...fcmPayload,
      });
      remoteLogoutConfirmed = true;
    } catch (error) {
      if (isRemoteLogoutOutcomeUnknown(error)) remoteLogoutRestartRequired = true;
      remoteWarning = toRemoteLogoutWarning(error);
    }
  }

  if (!remoteLogoutRestartRequired && remoteLogoutConfirmed && fcmPayload.clientInstanceId) {
    try {
      await clearFcmRegistrationAttemptsForClientInstance(fcmPayload.clientInstanceId);
      const rotated = await rotateClientInstanceId(fcmPayload.clientInstanceId);
      if (!rotated) throw new Error('The retired client instance changed unexpectedly.');
    } catch {
      remoteLogoutRestartRequired = true;
      remoteWarning =
        '알림 연결 정리를 확인하지 못했습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.';
    }
  }

  if (remoteWarning) {
    return {status: 'signedOutWithRemoteWarning', message: remoteWarning};
  }

  return {status: 'signedOut'};
}

function trackRemoteLogout(
  createOperation: (
    isCancelled: () => boolean,
    markSent: () => void,
  ) => Promise<LogoutResult>,
) {
  let cancelled = false;
  let sent = false;
  const flight = {
    cancelBeforeSend: () => {
      if (sent) return false;
      cancelled = true;
      return true;
    },
    promise: Promise.resolve({status: 'signedOut'} as LogoutResult),
  };
  const tracked = createOperation(() => cancelled, () => { sent = true; }).finally(() => {
    remoteLogoutFlights.delete(flight);
  });
  flight.promise = tracked;
  remoteLogoutFlights.add(flight);
  return tracked;
}

export async function waitForAuthEntryAvailability() {
  if (!(await waitForLocalSessionCleanup(LOGOUT_PREPARATION_TIMEOUT_MS))) {
    discardAllRefreshLogoutHandoffs();
    throw createLogoutCleanupPendingError();
  }
  const handoffStatus = await settleRefreshHandoffsForAuthEntry(
    LOGOUT_PREPARATION_TIMEOUT_MS,
  );
  if (handoffStatus !== 'clear') remoteLogoutRestartRequired = true;
  if (remoteLogoutRestartRequired) throw createLogoutCleanupPendingError();
  const deadline = Date.now() + REMOTE_LOGOUT_BARRIER_TIMEOUT_MS;
  while (remoteLogoutFlights.size > 0) {
    const pending = [...remoteLogoutFlights];
    try {
      await waitForLogoutBarrier(
        Promise.all(pending.map((flight) => flight.promise)),
        Math.max(1, deadline - Date.now()),
      );
      if (remoteLogoutRestartRequired) throw createLogoutCleanupPendingError();
    } catch {
      const cancellationResults = pending.map((flight) => flight.cancelBeforeSend());
      const allCancelledBeforeSend = cancellationResults.every(Boolean);
      if (allCancelledBeforeSend) {
        pending.forEach((flight) => remoteLogoutFlights.delete(flight));
        continue;
      }
      remoteLogoutRestartRequired = true;
      throw createLogoutCleanupPendingError();
    }
  }
}

function isRemoteLogoutOutcomeUnknown(error: unknown) {
  return error instanceof TypeError ||
    (error instanceof FaithLogApiError && error.detail.kind === 'offline');
}

function createLogoutCleanupPendingError() {
  return new FaithLogApiError({
    kind: 'conflict',
    code: 'LOGOUT_CLEANUP_PENDING',
    message: '로그아웃 정리가 지연되고 있습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.',
  });
}

export function resetAuthEntryBarrierForTests() {
  remoteLogoutFlights.clear();
  remoteLogoutRestartRequired = false;
  logoutPreparationByGeneration.clear();
}


async function waitForLogoutBarrier(promise: Promise<unknown>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new FaithLogApiError({
      kind: 'conflict',
      code: 'LOGOUT_CLEANUP_PENDING',
      message: '로그아웃 정리가 지연되고 있습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.',
    })), timeoutMs);
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

async function establishSession(
  tokens: Pick<LoginResponse, 'accessToken'>,
  generation: AuthSessionGeneration,
): Promise<SessionResolution> {
  assertAuthSessionCurrent(generation);
  const [user, campuses] = await Promise.all([
    fetchCurrentUser(tokens.accessToken, generation),
    fetchMyCampuses(tokens.accessToken, generation),
  ]);
  assertAuthSessionCurrent(generation);
  const activeCampuses = campuses.filter((campus) => campus.status === 'ACTIVE');

  if (activeCampuses.length === 0) {
    return {status: 'noCampus', user};
  }

  const storedCampusId = await getStoredSelectedCampusId();
  const selectedCampus =
    activeCampuses.find((campus) => campus.campusId === storedCampusId) ??
    activeCampuses[0]!;
  await saveSelectedCampusId(selectedCampus.campusId);
  assertAuthSessionCurrent(generation);

  return {
    status: 'authenticated',
    user,
    activeCampuses,
    selectedCampus,
  };
}

function assertAuthSessionCurrent(generation: AuthSessionGeneration) {
  if (!isAuthSessionGenerationCurrent(generation)) {
    throw createAuthSessionChangedError(generation);
  }
}

function createAuthSessionChangedError(generation: AuthSessionGeneration) {
  return new FaithLogApiError({
    kind: 'error',
    code: 'AUTH_SESSION_CHANGED',
    message: '로그인 계정이 변경되어 이전 인증 작업을 취소했습니다.',
    authSessionGeneration: generation,
  });
}

function toRemoteLogoutWarning(error: unknown) {
  if (error instanceof FaithLogApiError) {
    return getLogoutWarningMessage(error.detail);
  }

  return '이 기기의 토큰은 삭제했지만 서버 로그아웃 확인은 완료하지 못했습니다.';
}

function getLogoutWarningMessage(error: ApiError) {
  switch (error.kind) {
    case 'sessionExpired':
      return '세션이 이미 만료되어 이 기기의 토큰만 삭제했습니다.';
    case 'offline':
      return '네트워크가 불안정해 서버 로그아웃 확인은 실패했지만 이 기기에서는 로그아웃했습니다.';
    case 'permissionDenied':
      return '서버가 로그아웃 권한을 거부했지만 이 기기의 토큰은 삭제했습니다.';
    case 'conflict':
      return '서버 로그아웃 상태 확인이 필요하지만 이 기기의 토큰은 삭제했습니다.';
    case 'error':
      return '서버 로그아웃 확인은 실패했지만 이 기기에서는 로그아웃했습니다.';
    default:
      return assertNever(error.kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled session value: ${String(value)}`);
}
