import {FaithLogApiError} from '../api/apiError';
import {apiRequest, isMockModeEnabled} from '../api/client';
import type {AuthSessionGeneration} from '../api/tokenStorage';
import {getMockYearlyRecap} from './yearlyRecapMock';
import {parseYearlyRecapData} from './yearlyRecapRuntimeValidation';
import type {YearlyRecapApi} from './yearlyRecapTypes';

export const YEARLY_RECAP_CONTRACT_STATUS = 'pending' as const;

type RequestOptions<T> = {
  accessToken: string;
  authSessionGeneration: AuthSessionGeneration;
  method?: 'GET' | 'POST';
  responseParser: (value: unknown) => T;
};

export type YearlyRecapRequestDispatcher = <T>(
  path: string,
  options: RequestOptions<T>,
) => Promise<T>;

type Dependencies = {
  isMockMode?: () => boolean;
  request?: YearlyRecapRequestDispatcher;
};

export function createYearlyRecapApi(dependencies: Dependencies = {}): YearlyRecapApi {
  const mockMode = (dependencies.isMockMode ?? isMockModeEnabled)();
  const request = dependencies.request ?? defaultRequest;

  return {
    async getPreviousYearRecap(accessToken, authGeneration) {
      validateAuth(accessToken, authGeneration);
      if (!mockMode) throw pendingContract();
      if (!dependencies.request) {
        const scenario = process.env.EXPO_PUBLIC_MOCK_SCENARIO;
        if (scenario === 'recap-error') throw mockNetworkError();
        if (scenario === 'recap-forbidden') throw mockPermissionError();
        return getMockYearlyRecap(scenario);
      }
      return request('/api/v1/users/me/yearly-recaps/previous', {
        accessToken,
        authSessionGeneration: authGeneration,
        responseParser: parseYearlyRecapData,
      });
    },
    async markPresented(accessToken, authGeneration, recapYear) {
      validateAuth(accessToken, authGeneration);
      if (!Number.isSafeInteger(recapYear) || recapYear <= 0) {
        throw invalidRequest('회고 연도가 올바르지 않습니다.');
      }
      if (!mockMode) throw pendingContract();
      if (!dependencies.request) {
        if (process.env.EXPO_PUBLIC_MOCK_SCENARIO === 'recap-presented-error') {
          throw mockNetworkError();
        }
        return null;
      }
      return request(`/api/v1/users/me/yearly-recaps/${recapYear}/presented`, {
        accessToken,
        authSessionGeneration: authGeneration,
        method: 'POST',
        responseParser: parseNull,
      });
    },
  };
}

const defaultRequest: YearlyRecapRequestDispatcher = (path, options) =>
  apiRequest(path, {
    accessToken: options.accessToken,
    authSessionGeneration: options.authSessionGeneration,
    ...(options.method ? {method: options.method} : {}),
    responseParser: options.responseParser,
  });

function parseNull(value: unknown) {
  if (value !== null) {
    throw new FaithLogApiError({
      kind: 'error',
      status: 200,
      code: 'INVALID_SERVER_RESPONSE',
      message: '서버 응답 형식이 올바르지 않습니다.',
    });
  }
  return null;
}

function validateAuth(accessToken: string, generation: AuthSessionGeneration) {
  if (!accessToken || !Number.isSafeInteger(generation) || generation < 0) {
    throw invalidRequest('인증 정보를 확인할 수 없습니다.');
  }
}

function pendingContract() {
  return new FaithLogApiError({
    kind: 'error',
    code: 'API_CONTRACT_PENDING',
    message: '연간 회고 기능을 준비하고 있습니다.',
  });
}

function invalidRequest(message: string) {
  return new FaithLogApiError({kind: 'error', status: 400, code: 'INVALID_REQUEST', message});
}

function mockNetworkError() {
  return new FaithLogApiError({
    kind: 'offline',
    code: 'MOCK_RECAP_OFFLINE',
    message: '네트워크 연결을 확인해 주세요.',
  });
}

function mockPermissionError() {
  return new FaithLogApiError({
    kind: 'permissionDenied',
    status: 403,
    code: 'MOCK_RECAP_FORBIDDEN',
    message: '회고를 볼 수 없습니다.',
  });
}
