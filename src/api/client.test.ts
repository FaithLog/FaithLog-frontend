import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('./tokenStorage', () => ({
  clearTokens: vi.fn(),
  getAuthSessionGeneration: vi.fn(),
  getStoredAuthSession: vi.fn(),
  isAccessTokenOwnedByAuthSession: vi.fn(),
  isAuthSessionGenerationCurrent: vi.fn(),
  saveTokens: vi.fn(),
  startAuthSessionClear: vi.fn(),
}));

import {
  apiRequest,
  buildApiUrl,
  createAdminPaymentAccount,
  createCoffeeDutyPaymentAccount,
  deleteMyAccount,
  FaithLogApiError,
  fetchAdminCampusCharges,
  fetchAdminCampusChargesForMyAccounts,
  fetchAdminPaymentAccounts,
  fetchPollDetail,
  fetchPollResults,
  fetchPolls,
  getApiBaseUrl,
  isMockModeEnabled,
  loginUser,
  validateRuntimeConfig,
} from './client';
import {
  clearTokens,
  getAuthSessionGeneration,
  getStoredAuthSession,
  isAccessTokenOwnedByAuthSession,
  isAuthSessionGenerationCurrent,
  saveTokens,
  type AuthSessionGeneration,
} from './tokenStorage';

const API_BASE_URL = 'https://api.faithlog.test/root/';
const FIRST_AUTH_GENERATION = 1 as AuthSessionGeneration;
let currentAuthGeneration = FIRST_AUTH_GENERATION;

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

function requireTestRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid test response.');
  }

  return value as Record<string, unknown>;
}

function parseIdentityResponse(value: unknown) {
  const record = requireTestRecord(value);
  if (typeof record.id !== 'number' || typeof record.email !== 'string') {
    throw new Error('Invalid test response.');
  }

  return {id: record.id, email: record.email};
}

function parseOkResponse(value: unknown) {
  const record = requireTestRecord(value);
  if (typeof record.ok !== 'boolean') {
    throw new Error('Invalid test response.');
  }

  return {ok: record.ok};
}

function parseRetriedResponse(value: unknown) {
  const record = requireTestRecord(value);
  if (
    typeof record.ok !== 'boolean' ||
    typeof record.retriedCalls !== 'number'
  ) {
    throw new Error('Invalid test response.');
  }

  return {ok: record.ok, retriedCalls: record.retriedCalls};
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
    currentAuthGeneration = FIRST_AUTH_GENERATION;
    process.env.EXPO_PUBLIC_API_BASE_URL = API_BASE_URL;
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
    vi.mocked(getAuthSessionGeneration).mockImplementation(
      () => currentAuthGeneration,
    );
    vi.mocked(isAuthSessionGenerationCurrent).mockImplementation(
      (generation) => generation === currentAuthGeneration,
    );
    vi.mocked(isAccessTokenOwnedByAuthSession).mockResolvedValue(true);
    vi.mocked(getStoredAuthSession).mockResolvedValue({
      generation: currentAuthGeneration,
      accessToken: null,
      refreshToken: null,
    });
    vi.mocked(saveTokens).mockResolvedValue(true);
    vi.mocked(clearTokens).mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_APP_ENV;
    delete process.env.EXPO_PUBLIC_MOCK_MODE;
  });

  it('normalizes /api/v1 paths against EXPO_PUBLIC_API_BASE_URL', () => {
    expect(buildApiUrl('users/me')).toBe('https://api.faithlog.test/root/api/v1/users/me');
    expect(buildApiUrl('/api/v1/users/me')).toBe(
      'https://api.faithlog.test/root/api/v1/users/me',
    );
  });

  it('requires the approved HTTPS origin for preview and production builds', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://unapproved.example.test';

    expect(() => getApiBaseUrl()).toThrowError(FaithLogApiError);

    process.env.EXPO_PUBLIC_API_BASE_URL =
      'https://faithlog-549871256004.asia-northeast3.run.app';
    expect(getApiBaseUrl()).toBe(
      'https://faithlog-549871256004.asia-northeast3.run.app',
    );
  });

  it.each(['preview', 'production'])(
    'rejects mock mode in the %s environment',
    (appEnvironment) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnvironment;
      process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

      expect(() => validateRuntimeConfig()).toThrowError(FaithLogApiError);
      expect(() => isMockModeEnabled()).toThrowError(FaithLogApiError);
    },
  );

  it.each(['local', 'development'])(
    'allows mock mode only in the %s environment',
    (appEnvironment) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnvironment;
      process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

      expect(() => validateRuntimeConfig()).not.toThrow();
      expect(isMockModeEnabled()).toBe(true);
    },
  );

  it('rejects malformed role and identity data in a login response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        200,
        envelope({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          accessTokenExpiresIn: 3600,
          refreshTokenExpiresIn: 7200,
          tokenType: 'Bearer',
          user: {
            id: 7,
            name: '사용자',
            email: 'user@example.test',
            role: 'ROOT',
            isActive: true,
            lastLoginAt: null,
            campusMemberships: [],
          },
        }),
      ),
    );

    await expect(
      loginUser({email: 'user@example.test', password: 'not-a-real-password'}),
    ).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'error',
        code: 'INVALID_SERVER_RESPONSE',
      });
      return true;
    });
  });

  it('sends bearer token and parses ApiResponse envelope data', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, envelope({id: 7, email: 'user@example.test'})));

    const data = await apiRequest<{id: number; email: string}>('/users/me', {
      accessToken: 'access-token',
      responseParser: parseIdentityResponse,
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

  it('deletes the current account with password and confirmation text', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, envelope({deletedAt: '2026-07-06T12:00:00'})),
    );

    const data = await deleteMyAccount('access-token', {
      password: 'FaithLog!100047',
      confirmText: '회원탈퇴',
    });

    expect(data).toEqual({deletedAt: '2026-07-06T12:00:00'});
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.faithlog.test/root/api/v1/users/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        }),
        method: 'DELETE',
      }),
    );
    const [, requestInit] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String((requestInit as RequestInit).body))).toEqual({
      password: 'FaithLog!100047',
      confirmText: '회원탈퇴',
    });
  });

  it('requests poll list with a large page size and unwraps paged content', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        200,
        envelope({
          content: [
            {
              pollId: 11,
              campusId: 2,
              title: '수련회 장소 투표',
              pollType: 'CUSTOM',
              selectionType: 'SINGLE',
              anonymous: false,
              startDateTime: '2026-07-05T09:00:00.000Z',
              endDateTime: '2026-07-06T09:00:00.000Z',
              status: 'OPEN',
              hasResponded: false,
            },
            {
              pollId: 12,
              campusId: 2,
              title: '간식 신청',
              pollType: 'CUSTOM',
              selectionType: 'MULTIPLE',
              anonymous: true,
              startDateTime: '2026-07-05T09:00:00.000Z',
              endDateTime: '2026-07-07T09:00:00.000Z',
              status: 'OPEN',
              hasResponded: true,
            },
          ],
          page: 0,
          size: 2,
          totalElements: 2,
          totalPages: 1,
        }),
      ),
    );

    const polls = await fetchPolls('access-token', 2);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.faithlog.test/root/api/v1/campuses/2/polls?page=0&size=100',
      expect.any(Object),
    );
    expect(polls).toHaveLength(2);
    expect(polls[0]).toMatchObject({
      id: 11,
      title: '수련회 장소 투표',
      startsAt: '2026-07-05T09:00:00.000Z',
      endsAt: '2026-07-06T09:00:00.000Z',
      isAnonymous: false,
      responded: false,
    });
    expect(polls[1]).toMatchObject({id: 12, isAnonymous: true, responded: true});
  });

  it.each([
    ['invalid ID', {content: [{pollId: 0}]}],
    ['invalid collection', {content: {secret: 'raw-server-payload'}}],
  ] as const)(
    'maps a malformed poll-list %s to a sanitized invalid-response error',
    async (_label, data) => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, envelope(data)));

      await expect(fetchPolls('access-token', 2)).rejects.toSatisfy((error) => {
        expectApiError(error, {
          kind: 'error',
          code: 'INVALID_SERVER_RESPONSE',
        });
        expect((error as Error).message).not.toContain('raw-server-payload');
        return true;
      });
    },
  );

  it('unwraps poll detail options and result options from paged payloads', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          envelope({
            poll: {
              pollId: 11,
              campusId: 2,
              title: '수련회 장소 투표',
              pollType: 'CUSTOM',
              selectionType: 'SINGLE',
              anonymous: false,
              startDateTime: '2026-07-05T09:00:00.000Z',
              endDateTime: '2026-07-06T09:00:00.000Z',
              status: 'OPEN',
              hasResponded: false,
            },
            options: {
              content: [
                {pollOptionId: 101, optionContent: '가평 숲속 수련원', sortOrder: 1},
                {pollOptionId: 102, optionContent: '양평 기도원', sortOrder: 2},
              ],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          envelope({
            pollId: 11,
            campusId: 2,
            title: '수련회 장소 투표',
            pollType: 'CUSTOM',
            selectionType: 'SINGLE',
            anonymous: false,
            status: 'OPEN',
            startsAt: '2026-07-05T09:00:00.000Z',
            endsAt: '2026-07-06T09:00:00.000Z',
            targetMemberCount: 3,
            respondedCount: 1,
            notRespondedCount: 2,
            optionResults: {
              content: [
                {pollOptionId: 101, optionContent: '가평 숲속 수련원', responseCount: 1},
                {pollOptionId: 102, optionContent: '양평 기도원', responseCount: 0},
              ],
            },
          }),
        ),
      );

    const detail = await fetchPollDetail('access-token', 2, 11);
    const results = await fetchPollResults('access-token', 2, 11);

    expect(detail.options.map((option) => option.content)).toEqual([
      '가평 숲속 수련원',
      '양평 기도원',
    ]);
    expect(results.optionResults.map((option) => option.content)).toEqual([
      '가평 숲속 수련원',
      '양평 기도원',
    ]);
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

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        403,
        envelope(null, {
          success: false,
          code: 'PAYMENT_ACCOUNT_FORBIDDEN',
          message: '납부 계좌 관리 권한이 없습니다.',
        }),
      ),
    );

    await expect(
      apiRequest('/users/me', {exposeServerErrorMessage: true}),
    ).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'permissionDenied',
        status: 403,
        code: 'PAYMENT_ACCOUNT_FORBIDDEN',
        message: '납부 계좌 관리 권한이 없습니다. (PAYMENT_ACCOUNT_FORBIDDEN)',
      });
      return true;
    });
  });

  it('refreshes once for coffee duty payment account create before keeping endpoint 401 inline', async () => {
    vi.mocked(getStoredAuthSession).mockResolvedValue({
      generation: FIRST_AUTH_GENERATION,
      accessToken: 'expired-access-token',
      refreshToken: 'refresh-token',
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          401,
          envelope(null, {
            success: false,
            code: 'AUTH_UNAUTHORIZED',
            message: 'expired',
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          envelope({
            accessToken: 'fresh-access-token',
            refreshToken: 'fresh-refresh-token',
            accessTokenExpiresIn: 3600,
            refreshTokenExpiresIn: 7200,
            tokenType: 'Bearer',
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          401,
          envelope(null, {
            success: false,
            code: 'AUTH_UNAUTHORIZED',
            message: '권한이 없습니다.',
          }),
        ),
      );

    await expect(
      createCoffeeDutyPaymentAccount('expired-access-token', 2, {
        accountHolder: 'QA',
        accountNumber: '9999-0000',
        accountType: 'COFFEE',
        bankName: '카카오뱅크',
        nickname: 'QA 커피',
      }),
    ).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'permissionDenied',
        status: 401,
        code: 'AUTH_UNAUTHORIZED',
      });
      return true;
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://api.faithlog.test/root/api/v1/auth/refresh',
    );
    expect(saveTokens).toHaveBeenCalledWith(
      {
        accessToken: 'fresh-access-token',
        refreshToken: 'fresh-refresh-token',
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 7200,
        tokenType: 'Bearer',
      },
      FIRST_AUTH_GENERATION,
    );
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it('refreshes once for admin payment account create before keeping endpoint 401 inline', async () => {
    vi.mocked(getStoredAuthSession).mockResolvedValue({
      generation: FIRST_AUTH_GENERATION,
      accessToken: 'expired-access-token',
      refreshToken: 'refresh-token',
    });
    const fetchMock = vi.mocked(fetch);

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          401,
          envelope(null, {
            success: false,
            code: 'AUTH_UNAUTHORIZED',
            message: 'expired',
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          envelope({
            accessToken: 'fresh-access-token',
            refreshToken: 'fresh-refresh-token',
            accessTokenExpiresIn: 3600,
            refreshTokenExpiresIn: 7200,
            tokenType: 'Bearer',
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          401,
          envelope(null, {
            success: false,
            code: 'AUTH_UNAUTHORIZED',
            message: '권한이 없습니다.',
          }),
        ),
      );

    await expect(
      createAdminPaymentAccount('expired-access-token', 2, {
        accountHolder: 'QA',
        accountNumber: '9999-0000',
        accountType: 'PENALTY',
        bankName: '카카오뱅크',
        nickname: 'QA 벌금',
      }),
    ).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'permissionDenied',
        status: 401,
        code: 'AUTH_UNAUTHORIZED',
      });
      return true;
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://api.faithlog.test/root/api/v1/auth/refresh',
    );
    expect(saveTokens).toHaveBeenCalledWith(
      {
        accessToken: 'fresh-access-token',
        refreshToken: 'fresh-refresh-token',
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 7200,
        tokenType: 'Bearer',
      },
      FIRST_AUTH_GENERATION,
    );
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it('does not send ownerUserId when creating a coffee payment account', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        200,
        envelope({
          accountHolder: 'QA',
          accountNumber: '9999-0000',
          accountType: 'COFFEE',
          bankName: '카카오뱅크',
          campusId: 2,
          id: 91,
          isActive: true,
          nickname: 'QA 커피',
          ownerUserId: 36,
        }),
      ),
    );

    await createCoffeeDutyPaymentAccount('active-coffee-duty-token', 2, {
      accountHolder: 'QA',
      accountNumber: '9999-0000',
      accountType: 'COFFEE',
      bankName: '카카오뱅크',
      nickname: 'QA 커피',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));

    expect(body).toEqual({
      accountHolder: 'QA',
      accountNumber: '9999-0000',
      accountType: 'COFFEE',
      bankName: '카카오뱅크',
      nickname: 'QA 커피',
    });
    expect(body).not.toHaveProperty('ownerUserId');
  });

  it('omits UI-only ALL charge filters while preserving payment account filters', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        200,
        envelope({
          campusId: 2,
          campusName: '분당 10캠',
          region: '분당',
          summary: {
            canceledAmount: 0,
            paidAmount: 0,
            totalAmount: 0,
            unpaidAmount: 0,
            waivedAmount: 0,
          },
          members: [],
        }),
      ),
    );

    await fetchAdminCampusCharges('access-token', 2, {
      paymentAccountId: 16,
      paymentCategory: 'ALL',
      status: 'ALL',
    });

    const [url] = fetchMock.mock.calls[0]!;
    const requestUrl = new URL(String(url));

    expect(requestUrl.pathname).toBe('/root/api/v1/admin/campuses/2/charges');
    expect(requestUrl.searchParams.get('paymentAccountId')).toBe('16');
    expect(requestUrl.searchParams.has('paymentCategory')).toBe(false);
    expect(requestUrl.searchParams.has('status')).toBe(false);
  });

  it('requests admin charges for my accounts', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        200,
        envelope({
          campusId: 2,
          campusName: '분당 10캠',
          region: '분당',
          summary: {
            canceledAmount: 0,
            paidAmount: 0,
            totalAmount: 0,
            unpaidAmount: 0,
            waivedAmount: 0,
          },
          members: [],
        }),
      ),
    );

    await fetchAdminCampusChargesForMyAccounts('access-token', 2, {
      paymentCategory: 'COFFEE',
      status: 'UNPAID',
    });

    const [url] = fetchMock.mock.calls[0]!;
    const requestUrl = new URL(String(url));

    expect(requestUrl.pathname).toBe('/root/api/v1/admin/campuses/2/charges/my-accounts');
    expect(requestUrl.searchParams.get('paymentCategory')).toBe('COFFEE');
    expect(requestUrl.searchParams.get('status')).toBe('UNPAID');
  });

  it('requests inactive admin payment accounts when asked', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, envelope([])));

    await fetchAdminPaymentAccounts('access-token', 7, {
      accountType: 'PENALTY',
      includeInactive: true,
    });

    const [url] = fetchMock.mock.calls[0]!;
    const requestUrl = new URL(String(url));

    expect(requestUrl.pathname).toBe('/root/api/v1/admin/campuses/7/payment-accounts');
    expect(requestUrl.searchParams.get('accountType')).toBe('PENALTY');
    expect(requestUrl.searchParams.get('includeInactive')).toBe('true');
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

  it('rejects a valid success envelope when no response parser is provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, envelope({raw: 'unvalidated'})),
    );

    await expect(apiRequest('/raw-success')).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'error',
        status: 200,
        code: 'INVALID_SERVER_RESPONSE',
      });
      expect((error as Error).message).not.toContain('unvalidated');
      return true;
    });
  });

  it('does not retry an old request with the next signed-in user token', async () => {
    let resolveRequest!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValue(response);

    const pending = apiRequest('/protected', {
      accessToken: 'first-user-access-token',
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    currentAuthGeneration = 2 as AuthSessionGeneration;
    resolveRequest(
      jsonResponse(
        401,
        envelope(null, {
          success: false,
          code: 'AUTH_UNAUTHORIZED',
          message: 'expired',
        }),
      ),
    );

    await expect(pending).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'error',
        code: 'AUTH_SESSION_CHANGED',
        authSessionGeneration: FIRST_AUTH_GENERATION,
      });
      return true;
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getStoredAuthSession).not.toHaveBeenCalled();
    expect(saveTokens).not.toHaveBeenCalled();
  });

  it('rejects an old access token before sending it in the current user session', async () => {
    currentAuthGeneration = 2 as AuthSessionGeneration;
    vi.mocked(isAccessTokenOwnedByAuthSession).mockResolvedValue(false);

    await expect(
      apiRequest('/protected-mutation', {
        accessToken: 'first-user-stale-access-token',
        method: 'POST',
        body: {enabled: true},
      }),
    ).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'error',
        code: 'AUTH_SESSION_CHANGED',
        authSessionGeneration: currentAuthGeneration,
      });
      return true;
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(getStoredAuthSession).not.toHaveBeenCalled();
    expect(saveTokens).not.toHaveBeenCalled();
  });

  it('rechecks generation after deferred ownership and before mutation fetch', async () => {
    let finishOwnership!: (owned: boolean) => void;
    vi.mocked(isAccessTokenOwnedByAuthSession).mockReturnValueOnce(
      new Promise<boolean>((resolve) => { finishOwnership = resolve; }),
    );
    const pending = apiRequest('/protected-mutation', {
      accessToken: 'first-user-access-token',
      method: 'POST',
      body: {enabled: true},
      responseParser: parseOkResponse,
    });
    currentAuthGeneration = 2 as AuthSessionGeneration;
    finishOwnership(true);
    await expect(pending).rejects.toSatisfy((error) => {
      expectApiError(error, {code: 'AUTH_SESSION_CHANGED'});
      return true;
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retries a same-session stale token with an already rotated stored token', async () => {
    vi.mocked(getStoredAuthSession).mockResolvedValue({
      generation: FIRST_AUTH_GENERATION,
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (_input, init) => {
      const authorization = (init?.headers as Record<string, string> | undefined)
        ?.Authorization;

      if (authorization === 'Bearer rotated-access-token') {
        return jsonResponse(200, envelope({ok: true}));
      }

      return jsonResponse(
        401,
        envelope(null, {
          success: false,
          code: 'AUTH_UNAUTHORIZED',
          message: 'expired',
        }),
      );
    });

    await expect(
      apiRequest<{ok: boolean}>('/protected', {
        accessToken: 'same-session-previous-access-token',
        responseParser: parseOkResponse,
      }),
    ).resolves.toEqual({ok: true});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getStoredAuthSession).toHaveBeenCalledOnce();
    expect(saveTokens).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/api/v1/auth/refresh'),
      ),
    ).toBe(false);
  });

  it('rechecks generation after a rotated-token promise and before retry fetch', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, envelope(null, {
      success: false,
      code: 'AUTH_UNAUTHORIZED',
      message: 'expired',
    })));
    let finishStoredRead!: (value: Awaited<ReturnType<typeof getStoredAuthSession>>) => void;
    vi.mocked(getStoredAuthSession).mockReturnValueOnce(new Promise((resolve) => {
      finishStoredRead = resolve;
    }));
    const pending = apiRequest('/protected', {
      accessToken: 'old-access',
      responseParser: parseOkResponse,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    currentAuthGeneration = 2 as AuthSessionGeneration;
    finishStoredRead({
      generation: FIRST_AUTH_GENERATION,
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
    });
    await expect(pending).rejects.toSatisfy((error) => {
      expectApiError(error, {code: 'AUTH_SESSION_CHANGED'});
      return true;
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not persist a delayed refresh after logout or account replacement', async () => {
    vi.mocked(getStoredAuthSession).mockResolvedValue({
      generation: FIRST_AUTH_GENERATION,
      accessToken: 'first-user-access-token',
      refreshToken: 'first-user-refresh-token',
    });
    let resolveRefresh!: (response: Response) => void;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockImplementation((input) => {
      if (String(input).endsWith('/api/v1/auth/refresh')) {
        return refreshResponse;
      }

      return Promise.resolve(
        jsonResponse(
          401,
          envelope(null, {
            success: false,
            code: 'AUTH_UNAUTHORIZED',
            message: 'expired',
          }),
        ),
      );
    });

    const pending = apiRequest('/protected', {
      accessToken: 'first-user-access-token',
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    currentAuthGeneration = 2 as AuthSessionGeneration;
    resolveRefresh(
      jsonResponse(
        200,
        envelope({
          accessToken: 'stale-fresh-access-token',
          refreshToken: 'stale-fresh-refresh-token',
          accessTokenExpiresIn: 3600,
          refreshTokenExpiresIn: 7200,
          tokenType: 'Bearer',
        }),
      ),
    );

    await expect(pending).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'error',
        code: 'AUTH_SESSION_CHANGED',
        authSessionGeneration: FIRST_AUTH_GENERATION,
      });
      return true;
    });
    expect(saveTokens).not.toHaveBeenCalled();
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it('preserves stored tokens when refresh fails because the device is offline', async () => {
    vi.mocked(getStoredAuthSession).mockResolvedValue({
      generation: FIRST_AUTH_GENERATION,
      accessToken: 'expired-access-token',
      refreshToken: 'refresh-token',
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(
          401,
          envelope(null, {
            success: false,
            code: 'AUTH_UNAUTHORIZED',
            message: 'expired',
          }),
        ),
      )
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(
      apiRequest('/protected', {accessToken: 'expired-access-token'}),
    ).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'offline',
        authSessionGeneration: FIRST_AUTH_GENERATION,
      });
      return true;
    });
    expect(clearTokens).not.toHaveBeenCalled();
    expect(saveTokens).not.toHaveBeenCalled();
  });

  it('refreshes once for concurrent 401 responses and retries original requests', async () => {
    vi.mocked(getStoredAuthSession).mockResolvedValue({
      generation: FIRST_AUTH_GENERATION,
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
        responseParser: parseRetriedResponse,
      }),
      apiRequest<{ok: boolean; retriedCalls: number}>('/protected', {
        accessToken: 'expired-access-token',
        responseParser: parseRetriedResponse,
      }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(retriedCalls).toBe(2);
    expect(saveTokens).toHaveBeenCalledTimes(1);
    expect(saveTokens).toHaveBeenCalledWith(
      {
        accessToken: 'fresh-access-token',
        refreshToken: 'fresh-refresh-token',
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 7200,
        tokenType: 'Bearer',
      },
      FIRST_AUTH_GENERATION,
    );
  });
});
