import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('./tokenStorage', () => ({
  clearTokens: vi.fn(),
  getStoredTokens: vi.fn(),
  saveTokens: vi.fn(),
}));

import {apiRequest, buildApiUrl, FaithLogApiError} from './client';
import {getStoredTokens, saveTokens} from './tokenStorage';

const API_BASE_URL = 'https://api.faithlog.test/root/';

function envelope<T>(data: T, patch: Partial<ResponseEnvelope<T>> = {}): ResponseEnvelope<T> {
  return {
    success: true,
    code: 'SUCCESS',
    message: '요청이 성공했습니다.',
    data,
    timestamp: '2026-06-25T00:00:00.000Z',
    ...patch,
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function expectApiError(error: unknown, expected: Partial<FaithLogApiError['detail']>) {
  expect(error).toBeInstanceOf(FaithLogApiError);
  expect((error as FaithLogApiError).detail).toMatchObject(expected);
}

type ResponseEnvelope<T> = {
  success: boolean;
  code: string;
  message: string;
  data: T;
  timestamp: string;
};

describe('FaithLog API client', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = API_BASE_URL;
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_MOCK_MODE;
  });

  it('normalizes /api/v1 paths against EXPO_PUBLIC_API_BASE_URL', () => {
    expect(buildApiUrl('users/me')).toBe('https://api.faithlog.test/root/api/v1/users/me');
    expect(buildApiUrl('/api/v1/users/me')).toBe(
      'https://api.faithlog.test/root/api/v1/users/me',
    );
  });

  it('sends bearer token and parses ApiResponse envelope data', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, envelope({id: 7, email: 'user@example.test'})));

    const data = await apiRequest<{id: number; email: string}>('/users/me', {
      accessToken: 'access-token',
    });

    expect(data).toEqual({id: 7, email: 'user@example.test'});
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.faithlog.test/root/api/v1/users/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        }),
        method: 'GET',
      }),
    );
  });

  it.each([
    [401, 'sessionExpired'],
    [403, 'permissionDenied'],
    [409, 'conflict'],
  ] as const)('normalizes %s API errors without exposing raw response bodies', async (status, kind) => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        status,
        envelope(null, {
          success: false,
          code: `ERROR_${status}`,
          message: 'server detail should not leak',
        }),
      ),
    );

    await expect(apiRequest('/users/me', {skipAuthRefresh: true})).rejects.toSatisfy((error) => {
      expectApiError(error, {kind, status, code: `ERROR_${status}`});
      expect((error as FaithLogApiError).detail.message).not.toContain('server detail');
      return true;
    });
  });

  it('keeps validation response messages hidden unless the caller opts in', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        422,
        envelope(null, {
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'server validation detail',
        }),
      ),
    );

    await expect(apiRequest('/users/me')).rejects.toSatisfy((error) => {
      expectApiError(error, {kind: 'error', status: 422, code: 'VALIDATION_ERROR'});
      expect((error as FaithLogApiError).detail.message).not.toContain('server validation detail');
      return true;
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        422,
        envelope(null, {
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'server validation detail',
        }),
      ),
    );

    await expect(
      apiRequest('/users/me', {exposeServerErrorMessage: true}),
    ).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'error',
        status: 422,
        code: 'VALIDATION_ERROR',
        message: 'server validation detail (VALIDATION_ERROR)',
      });
      return true;
    });
  });

  it('rejects invalid success envelopes as a safe client error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {data: {id: 1}}));

    await expect(apiRequest('/users/me')).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'error',
        status: 200,
        message: '서버 응답 형식이 올바르지 않습니다.',
      });
      return true;
    });
  });

  it('refreshes once for concurrent 401 responses and retries original requests', async () => {
    vi.mocked(getStoredTokens).mockResolvedValue({
      accessToken: 'expired-access-token',
      refreshToken: 'refresh-token',
    });
    const fetchMock = vi.mocked(fetch);
    let refreshCalls = 0;
    let retriedCalls = 0;

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;

      if (url.endsWith('/api/v1/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));

        return jsonResponse(
          200,
          envelope({
            accessToken: 'fresh-access-token',
            refreshToken: 'fresh-refresh-token',
            accessTokenExpiresIn: 3600,
            refreshTokenExpiresIn: 7200,
            tokenType: 'Bearer',
          }),
        );
      }

      if (authorization === 'Bearer fresh-access-token') {
        retriedCalls += 1;
        return jsonResponse(200, envelope({ok: true, retriedCalls}));
      }

      return jsonResponse(
        401,
        envelope(null, {
          success: false,
          code: 'UNAUTHORIZED',
          message: 'expired',
        }),
      );
    });

    const [first, second] = await Promise.all([
      apiRequest<{ok: boolean; retriedCalls: number}>('/protected', {
        accessToken: 'expired-access-token',
      }),
      apiRequest<{ok: boolean; retriedCalls: number}>('/protected', {
        accessToken: 'expired-access-token',
      }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(retriedCalls).toBe(2);
    expect(saveTokens).toHaveBeenCalledTimes(1);
    expect(saveTokens).toHaveBeenCalledWith({
      accessToken: 'fresh-access-token',
      refreshToken: 'fresh-refresh-token',
      accessTokenExpiresIn: 3600,
      refreshTokenExpiresIn: 7200,
      tokenType: 'Bearer',
    });
  });
});
