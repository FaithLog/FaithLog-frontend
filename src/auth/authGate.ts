import {FaithLogApiError} from '../api/client';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {ApiError, CampusMembershipSummary, CurrentUser} from '../api/types';
import {refreshAndEstablishSession} from './session';

export type AuthGateState =
  | {status: 'loading'; message: string}
  | {status: 'signedOut'}
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
  | {status: 'error'; message: string};

function mapErrorToGateState(error: ApiError): AuthGateState {
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
  const {refreshToken} = await getStoredTokens();

  if (!refreshToken) {
    return {status: 'signedOut'};
  }

  try {
    return await refreshAndEstablishSession(refreshToken);
  } catch (error) {
    if (error instanceof FaithLogApiError) {
      if (error.detail.kind === 'sessionExpired') {
        await clearTokens();
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
