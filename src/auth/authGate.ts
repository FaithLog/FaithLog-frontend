import {FaithLogApiError, validateRuntimeConfig} from '../api/client';
import {clearTokens, getStoredAuthSession} from '../api/tokenStorage';
import type {ApiError, CampusMembershipSummary, CurrentUser} from '../api/types';
import {establishStoredAccessTokenSession, refreshAndEstablishSession} from './session';

const ACCESS_TOKEN_REFRESH_WINDOW_MS = 60_000;

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

  let storedSession;

  try {
    storedSession = await getStoredAuthSession();
  } catch {
    return {
      status: 'error',
      message: '저장된 로그인 정보를 안전하게 확인하지 못했습니다.',
    };
  }

  const {accessToken, generation, refreshToken} = storedSession;

  if (!refreshToken) {
    return {status: 'signedOut'};
  }

  try {
    if (accessToken && !isJwtExpiringSoon(accessToken, ACCESS_TOKEN_REFRESH_WINDOW_MS)) {
      return await establishStoredAccessTokenSession(accessToken, generation);
    }

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

export function isJwtExpiringSoon(token: string, windowMs: number, nowMs = Date.now()) {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment || typeof globalThis.atob !== 'function') {
      return true;
    }
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(globalThis.atob(padded)) as {exp?: unknown};
    return typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs + windowMs;
  } catch {
    return true;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled auth gate state: ${String(value)}`);
}
