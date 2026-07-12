import {FaithLogApiError, validateRuntimeConfig} from '../api/client';
import {
  clearTokens,
  clearAuthTeardownPending,
  getAuthSessionGeneration,
  getStoredAuthSession,
  hasAuthTeardownPending,
  hasFcmRemoteCleanupPending,
  markAuthTeardownPending,
  materializeStoredSessionLogoutObligation,
  startAuthSessionClear,
} from '../api/tokenStorage';
import type {ApiError, CampusMembershipSummary, CurrentUser} from '../api/types';
import {refreshAndEstablishSession} from './session';
import {waitForFcmTransitionCleanup} from './fcmTransitionCleanup';

const BOOTSTRAP_REMOTE_CLEANUP_TIMEOUT_MS = 21_000;

export type AuthGateState =
  | {status: 'loading'; message: string}
  | {status: 'signedOut'; warning?: string}
  | {status: 'sessionExpired'; message: string}
  | {status: 'noCampus'; user: CurrentUser}
  | {
      status: 'authenticated';
      user: CurrentUser;
      activeCampuses: CampusMembershipSummary[];
      selectedCampus: CampusMembershipSummary;
    }
  | {status: 'permissionDenied'; message: string}
  | {status: 'conflict'; message: string}
  | {status: 'offline'; message: string}
  | {status: 'configurationError'; message: string}
  | {status: 'error'; message: string};

function mapErrorToGateState(error: ApiError): AuthGateState {
  if (error.code === 'CONFIGURATION') {
    return {status: 'configurationError', message: error.message};
  }

  switch (error.kind) {
    case 'sessionExpired':
      return {status: 'sessionExpired', message: error.message};
    case 'permissionDenied':
      return {status: 'permissionDenied', message: error.message};
    case 'conflict':
      return {status: 'conflict', message: error.message};
    case 'offline':
      return {status: 'offline', message: error.message};
    case 'error':
      return {status: 'error', message: error.message};
    default:
      return assertNever(error.kind);
  }
}

export async function bootstrapAuthGate(): Promise<AuthGateState> {
  try {
    validateRuntimeConfig();
  } catch (error) {
    if (error instanceof FaithLogApiError) {
      return mapErrorToGateState(error.detail);
    }

    return {
      status: 'configurationError',
      message: '앱 설정을 확인하지 못했습니다.',
    };
  }

  let hadDurableTeardown = false;
  try {
    const [authTeardownPending, fcmCleanupPending] = await Promise.all([
      hasAuthTeardownPending(), hasFcmRemoteCleanupPending(),
    ]);
    hadDurableTeardown = authTeardownPending || fcmCleanupPending;
    if (hadDurableTeardown) {
      try {
        const generation = getAuthSessionGeneration();
        if (!authTeardownPending) await markAuthTeardownPending();
        await materializeStoredSessionLogoutObligation(generation);
        const transition = startAuthSessionClear(generation);
        if (!transition.cleared) throw new Error('Authentication teardown changed.');
        await transition.completion;
      } catch {
        return {
          status: 'signedOut',
          warning: '이전 로그인 정보를 안전하게 삭제하지 못했습니다. 앱을 다시 실행해 주세요.',
        };
      }
    }
    const cleanupComplete = await waitForFcmTransitionCleanup(
      BOOTSTRAP_REMOTE_CLEANUP_TIMEOUT_MS,
    );
    if (hadDurableTeardown) {
      if (cleanupComplete) await clearAuthTeardownPending();
      return cleanupComplete
        ? {
            status: 'signedOut',
            warning: '이전 로그아웃 정리를 완료했습니다. 다시 로그인해 주세요.',
          }
        : {
            status: 'signedOut',
            warning: '이전 알림 연결 정리가 필요합니다. 네트워크를 확인한 뒤 앱을 다시 실행해 주세요.',
          };
    }
    if (!cleanupComplete) {
      return {
        status: 'signedOut',
        warning: '이전 알림 연결 정리가 필요합니다. 네트워크를 확인한 뒤 앱을 다시 실행해 주세요.',
      };
    }
  } catch {
    return {
      status: 'signedOut',
      warning: '이전 알림 연결 상태를 안전하게 확인하지 못했습니다.',
    };
  }

  let storedSession;

  try {
    storedSession = await getStoredAuthSession();
  } catch {
    return {
      status: 'error',
      message: '저장된 로그인 정보를 안전하게 확인하지 못했습니다.',
    };
  }

  const {generation, refreshToken} = storedSession;

  if (!refreshToken) {
    return {status: 'signedOut'};
  }

  try {
    return await refreshAndEstablishSession(refreshToken, generation);
  } catch (error) {
    if (error instanceof FaithLogApiError) {
      if (error.detail.kind === 'sessionExpired') {
        try {
          await clearTokens(generation);
        } catch {
          return {
            status: 'error',
            message: '만료된 로그인 정보를 안전하게 삭제하지 못했습니다.',
          };
        }
      }

      return mapErrorToGateState(error.detail);
    }

    return {
      status: 'error',
      message: '앱 시작 중 알 수 없는 문제가 발생했습니다.',
    };
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled auth gate state: ${String(value)}`);
}
