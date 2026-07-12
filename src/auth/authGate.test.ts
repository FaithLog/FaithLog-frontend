import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => ({
  FaithLogApiError: class FaithLogApiError extends Error {
    readonly detail: {
      kind: string;
      status?: number;
      code?: string;
      message: string;
      authSessionGeneration?: number;
    };

    constructor(detail: {
      kind: string;
      status?: number;
      code?: string;
      message: string;
      authSessionGeneration?: number;
    }) {
      super(detail.message);
      this.detail = detail;
    }
  },
  validateRuntimeConfig: vi.fn(),
}));

vi.mock('../api/tokenStorage', () => ({
  clearTokens: vi.fn(),
  getStoredAuthSession: vi.fn(),
}));

vi.mock('./session', () => ({
  establishStoredAccessTokenSession: vi.fn(),
  refreshAndEstablishSession: vi.fn(),
}));

import {FaithLogApiError, validateRuntimeConfig} from '../api/client';
import {
  clearTokens,
  getStoredAuthSession,
  type AuthSessionGeneration,
} from '../api/tokenStorage';
import {bootstrapAuthGate, isJwtExpiringSoon} from './authGate';
import {establishStoredAccessTokenSession, refreshAndEstablishSession} from './session';

const AUTH_GENERATION = 17 as AuthSessionGeneration;

describe('auth bootstrap gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateRuntimeConfig).mockReturnValue(undefined);
    vi.mocked(getStoredAuthSession).mockResolvedValue({
      generation: AUTH_GENERATION,
      accessToken: 'expired-access-token',
      refreshToken: 'expired-refresh-token',
    });
    vi.mocked(clearTokens).mockResolvedValue(true);
  });

  it('clears the same stored session and shows expiry when refresh is rejected', async () => {
    vi.mocked(refreshAndEstablishSession).mockRejectedValue(
      new FaithLogApiError({
        kind: 'sessionExpired',
        status: 401,
        code: 'AUTH_REFRESH_EXPIRED',
        message: '다시 로그인한 뒤 이용해 주세요.',
        authSessionGeneration: AUTH_GENERATION,
      }),
    );

    await expect(bootstrapAuthGate()).resolves.toEqual({
      status: 'sessionExpired',
      message: '다시 로그인한 뒤 이용해 주세요.',
    });
    expect(refreshAndEstablishSession).toHaveBeenCalledWith(
      'expired-refresh-token',
      AUTH_GENERATION,
    );
    expect(clearTokens).toHaveBeenCalledWith(AUTH_GENERATION);
  });

  it('shows a safe error state when expired credentials cannot be deleted', async () => {
    vi.mocked(refreshAndEstablishSession).mockRejectedValue(
      new FaithLogApiError({
        kind: 'sessionExpired',
        status: 401,
        code: 'AUTH_REFRESH_EXPIRED',
        message: '다시 로그인한 뒤 이용해 주세요.',
        authSessionGeneration: AUTH_GENERATION,
      }),
    );
    vi.mocked(clearTokens).mockRejectedValue(
      new Error('secure storage unavailable'),
    );

    await expect(bootstrapAuthGate()).resolves.toEqual({
      status: 'error',
      message: '만료된 로그인 정보를 안전하게 삭제하지 못했습니다.',
    });
    expect(clearTokens).toHaveBeenCalledWith(AUTH_GENERATION);
  });

  it('uses a stored access token without a refresh round trip when expiry is not near', async () => {
    const payload = globalThis.btoa(
      JSON.stringify({exp: Math.floor(Date.now() / 1000) + 3600}),
    );
    vi.mocked(getStoredAuthSession).mockResolvedValue({
      generation: AUTH_GENERATION,
      accessToken: `header.${payload}.signature`,
      refreshToken: 'refresh-token',
    });
    vi.mocked(establishStoredAccessTokenSession).mockResolvedValue({
      status: 'noCampus',
      user: {
        id: 1,
        email: 'safe@example.com',
        name: '사용자',
        role: 'USER',
        isActive: true,
        lastLoginAt: null,
        campusMemberships: [],
      },
    });

    await bootstrapAuthGate();

    expect(establishStoredAccessTokenSession).toHaveBeenCalledWith(
      `header.${payload}.signature`,
      AUTH_GENERATION,
    );
    expect(refreshAndEstablishSession).not.toHaveBeenCalled();
  });

  it('treats JWT expiry only as a refresh hint and fails closed for malformed tokens', () => {
    expect(isJwtExpiringSoon('not-a-jwt', 60_000)).toBe(true);
  });
});
