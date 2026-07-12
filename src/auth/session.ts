import {
  FaithLogApiError,
  fetchCurrentUser,
  fetchMyCampuses,
  loginUser,
  logoutUser,
  refreshAuthToken,
} from '../api/client';
import {
  beginAuthSession,
  clearTokens,
  getAuthSessionGeneration,
  getStoredSelectedCampusId,
  getStoredAuthSession,
  isAuthSessionGenerationCurrent,
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
} from '../api/types';
import {capturePendingFcmRegistrationBarrier} from '../notifications/fcmRegistration';
import {getLogoutFcmDeactivationPayload} from './fcmLogout';

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

let remoteLogoutInFlight: Promise<LogoutResult> | null = null;
let logoutPreparationInFlight: Promise<void> | null = null;
const LOGOUT_PREPARATION_TIMEOUT_MS = 5_000;

export async function loginAndEstablishSession(credentials: LoginRequest): Promise<SessionResolution> {
  await waitForPendingRemoteLogout();
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

export async function refreshAndEstablishSession(
  refreshToken: string,
  generation: AuthSessionGeneration,
): Promise<SessionResolution> {
  try {
    const tokens = await refreshAuthToken(refreshToken, generation);
    const saved = await saveTokens(tokens, generation);

    if (!saved) {
      throw createAuthSessionChangedError(generation);
    }

    return establishSession(tokens, generation);
  } catch (error) {
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
  const operation = prepareCurrentSessionLogoutInternal(userId);
  const barrier = operation.then(() => undefined, () => undefined).finally(() => {
    if (logoutPreparationInFlight === barrier) logoutPreparationInFlight = null;
  });
  logoutPreparationInFlight = barrier;
  return operation;
}

export function trackLocalSessionCleanup<T>(operation: Promise<T>) {
  const barrier = operation.then(() => undefined, () => undefined).finally(() => {
    if (logoutPreparationInFlight === barrier) logoutPreparationInFlight = null;
  });
  logoutPreparationInFlight = barrier;
  return operation;
}

async function prepareCurrentSessionLogoutInternal(
  userId?: number,
): Promise<PreparedLogout> {
  const expectedGeneration = getAuthSessionGeneration();
  let authSession: Awaited<ReturnType<typeof getStoredAuthSession>>;

  try {
    authSession = await getStoredAuthSession(expectedGeneration);
  } catch (error) {
    if (error instanceof StaleAuthSessionReadError) throw error;
    const cleared = await clearTokens(expectedGeneration);
    if (!cleared) throw new StaleAuthSessionReadError(expectedGeneration);
    return {
      completeRemoteLogout: async () => ({
        status: 'signedOutWithRemoteWarning',
        message: '로컬 세션은 종료했지만 서버 로그아웃 정보는 확인하지 못했습니다.',
      }),
    };
  }

  let fcmPayload: Awaited<ReturnType<typeof getLogoutFcmDeactivationPayload>> = {};
  let preparationWarning: string | null = null;

  try {
    fcmPayload = await getLogoutFcmDeactivationPayload(userId);
  } catch {
    preparationWarning =
      '서버 로그아웃은 요청했지만 기기 알림 연결 해제 여부는 확인하지 못했습니다.';
  }

  const fcmRegistrationBarrier = capturePendingFcmRegistrationBarrier();
  const cleared = await clearTokens(authSession.generation);

  if (!cleared) {
    throw new StaleAuthSessionReadError(authSession.generation);
  }

  if (fcmPayload.clientInstanceId) {
    try {
      const rotated = await rotateClientInstanceId(fcmPayload.clientInstanceId);

      if (!rotated) {
        throw new Error('The client instance changed before it could be retired.');
      }
    } catch {
      fcmPayload = {};
      preparationWarning =
        '서버 로그아웃은 요청했지만 기기 알림 식별자를 안전하게 교체하지 못해 알림 연결 해제는 생략했습니다.';
    }
  }

  const remoteLogout = trackRemoteLogout(
    completeRemoteLogout(
      authSession,
      fcmPayload,
      fcmRegistrationBarrier,
      preparationWarning,
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
  preparationWarning: string | null,
): Promise<LogoutResult> {
  await fcmRegistrationBarrier;
  const {accessToken, refreshToken} = authSession;
  let remoteWarning = preparationWarning;

  if (accessToken) {
    try {
      await logoutUser(accessToken, {
        ...(refreshToken ? {refreshToken} : {}),
        ...fcmPayload,
      });
    } catch (error) {
      remoteWarning = toRemoteLogoutWarning(error);
    }
  }

  if (remoteWarning) {
    return {status: 'signedOutWithRemoteWarning', message: remoteWarning};
  }

  return {status: 'signedOut'};
}

function trackRemoteLogout(operation: Promise<LogoutResult>) {
  const tracked = operation.finally(() => {
    if (remoteLogoutInFlight === tracked) {
      remoteLogoutInFlight = null;
    }
  });
  remoteLogoutInFlight = tracked;
  return tracked;
}

async function waitForPendingRemoteLogout() {
  const preparation = logoutPreparationInFlight;
  if (preparation) {
    try {
      await waitForLogoutBarrier(preparation);
    } catch (error) {
      if (logoutPreparationInFlight === preparation) logoutPreparationInFlight = null;
      throw error;
    }
  }
  const pending = remoteLogoutInFlight;

  if (!pending) {
    return;
  }

  try {
    await waitForLogoutBarrier(pending);
  } catch {
    if (remoteLogoutInFlight === pending) remoteLogoutInFlight = null;
    // A failed best-effort remote logout must not permanently block a new login.
  }
}

async function waitForLogoutBarrier(promise: Promise<unknown>) {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new FaithLogApiError({
      kind: 'conflict',
      code: 'LOGOUT_CLEANUP_PENDING',
      message: '로그아웃 정리가 지연되고 있습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.',
    })), LOGOUT_PREPARATION_TIMEOUT_MS);
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
