import {
  FaithLogApiError,
  fetchCurrentUser,
  fetchMyCampuses,
  loginUser,
  logoutUser,
  refreshAuthToken,
} from '../api/client';
import {
  clearTokens,
  getStoredSelectedCampusId,
  getStoredTokens,
  saveSelectedCampusId,
  saveTokens,
} from '../api/tokenStorage';
import type {
  ApiError,
  CampusMembershipSummary,
  CurrentUser,
  LoginRequest,
  LoginResponse,
} from '../api/types';
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

export async function loginAndEstablishSession(credentials: LoginRequest): Promise<SessionResolution> {
  const loginResponse = await loginUser(credentials);
  await saveTokens(loginResponse);

  return establishSession(loginResponse);
}

export async function refreshAndEstablishSession(refreshToken: string): Promise<SessionResolution> {
  const tokens = await refreshAuthToken(refreshToken);
  await saveTokens(tokens);

  return establishSession(tokens);
}

export async function logoutCurrentSession(): Promise<LogoutResult> {
  const {accessToken, refreshToken} = await getStoredTokens();
  let remoteWarning: string | null = null;

  if (accessToken) {
    try {
      const fcmPayload = await getLogoutFcmDeactivationPayload();
      await logoutUser(accessToken, {
        ...(refreshToken ? {refreshToken} : {}),
        ...fcmPayload,
      });
    } catch (error) {
      remoteWarning = toRemoteLogoutWarning(error);
    }
  }

  await clearTokens();

  if (remoteWarning) {
    return {status: 'signedOutWithRemoteWarning', message: remoteWarning};
  }

  return {status: 'signedOut'};
}

async function establishSession(tokens: Pick<LoginResponse, 'accessToken'>): Promise<SessionResolution> {
  const [user, campuses] = await Promise.all([
    fetchCurrentUser(tokens.accessToken),
    fetchMyCampuses(tokens.accessToken),
  ]);
  const activeCampuses = campuses.filter((campus) => campus.status === 'ACTIVE');

  if (activeCampuses.length === 0) {
    return {status: 'noCampus', user};
  }

  const storedCampusId = await getStoredSelectedCampusId();
  const selectedCampus =
    activeCampuses.find((campus) => campus.campusId === storedCampusId) ??
    activeCampuses[0]!;
  await saveSelectedCampusId(selectedCampus.campusId);

  return {
    status: 'authenticated',
    user,
    activeCampuses,
    selectedCampus,
  };
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
