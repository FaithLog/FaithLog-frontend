import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('./tokenStorage', () => ({
  clearTokens: vi.fn(),
  getAuthSessionGeneration: vi.fn(() => 0),
  getStoredAuthSession: vi.fn(),
  getStoredTokens: vi.fn(),
  isAccessTokenOwnedByAuthSession: vi.fn(async () => true),
  isAuthSessionGenerationCurrent: vi.fn(() => true),
  isAuthSessionRequestAllowed: vi.fn(() => true),
  saveTokens: vi.fn(),
}));

import {
  apiRequest,
  changeAdminChargeStatus,
  FaithLogApiError,
  fetchAdminCampusChargesForMyAccounts,
  fetchAdminMemberCharges,
  fetchPrayerWeek,
  loginUser,
  validateRuntimeConfig,
} from './client';
import {
  createAdminPollTemplate,
  updateAdminPollTemplate,
  type AdminPollTemplateRequest,
} from './adminPollApi';
import {mockApiErrorFixtures, mockDomainFixtures} from './mockFixtures';
import {resetMockAdapterStateForTests} from './mockAdapter';

function expectApiError(error: unknown, expected: Partial<FaithLogApiError['detail']>) {
  expect(error).toBeInstanceOf(FaithLogApiError);
  expect((error as FaithLogApiError).detail).toMatchObject(expected);
}

describe('FaithLog mock API adapter', () => {
  beforeEach(() => {
    resetMockAdapterStateForTests();
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_MOCK_MODE;
    delete process.env.EXPO_PUBLIC_MOCK_SCENARIO;
  });

  it('lets mock mode bootstrap without a live API base URL', () => {
    expect(() => validateRuntimeConfig()).not.toThrow();
  });

  it('serves auth fixtures without calling the network or leaking personal examples', async () => {
    const response = await loginUser({
      email: 'faithlog.user@example.test',
      password: 'samplepass8',
    });

    expect(response.user.email).toBe('faithlog.user@example.test');
    expect(response.accessToken).toBe('mock-access-token');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('serves domain fixtures through existing API functions', async () => {
    const prayerWeek = await fetchPrayerWeek('mock-access-token', 1, '2026-06-22');

    expect(prayerWeek.groups[0]?.members[0]?.content).toBe('Mock fixture 기도제목입니다.');
    expect(mockDomainFixtures).toHaveProperty('auth');
    expect(mockDomainFixtures).toHaveProperty('campus');
    expect(mockDomainFixtures).toHaveProperty('devotion');
    expect(mockDomainFixtures).toHaveProperty('billing');
    expect(mockDomainFixtures).toHaveProperty('admin');
    expect(mockDomainFixtures).toHaveProperty('poll');
    expect(mockDomainFixtures).toHaveProperty('prayer');
    expect(mockDomainFixtures).toHaveProperty('notification');
  });

  it('supports the provisional PAID payload only in mock mode with paidAt', async () => {
    const changed = await changeAdminChargeStatus('mock-access-token', 501, 'PAID', {
      campusId: 1,
      userId: 7,
      paymentCategory: 'PENALTY',
    });
    const [summary, detail] = await Promise.all([
      fetchAdminCampusChargesForMyAccounts('mock-access-token', 1),
      fetchAdminMemberCharges('mock-access-token', 1, 7),
    ]);

    expect(changed).toMatchObject({id: 501, status: 'PAID'});
    expect(changed.paidAt).toEqual(expect.any(String));
    expect(summary.summary).toMatchObject({unpaidAmount: 3_000, paidAmount: 15_000});
    expect(detail.summary).toMatchObject({unpaidAmount: 3_000, paidAmount: 15_000});
    expect(detail.items[0]).toMatchObject({status: 'PAID', paidAt: changed.paidAt});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns parser-compatible options when mock poll templates are created and updated', async () => {
    const request: AdminPollTemplateRequest = {
      title: '반복 투표',
      pollType: 'COFFEE',
      selectionType: 'SINGLE',
      chargeGenerationType: 'OPTION_PRICE',
      paymentCategory: 'COFFEE',
      paymentAccountId: 1,
      autoCreateEnabled: true,
      startDayOfWeek: 1,
      startTime: '09:00:00',
      endDayOfWeek: 2,
      endTime: '18:00:00',
      options: [
        {content: null, menuId: 11, priceAmount: 4_500, sortOrder: 1},
        {content: '참석 안 함', menuId: null, priceAmount: null, sortOrder: 2},
      ],
    };

    const created = await createAdminPollTemplate('mock-access-token', 1, request);
    const updated = await updateAdminPollTemplate(
      'mock-access-token',
      1,
      created.id,
      {...request, title: '수정된 반복 투표'},
    );

    expect(created.options).toHaveLength(2);
    expect(created.options.every((option) => option.id > 0)).toBe(true);
    expect(updated).toMatchObject({id: created.id, title: '수정된 반복 투표'});
    expect(updated.options.every((option) => option.id > 0)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['401', 'sessionExpired', mockApiErrorFixtures.sessionExpired.status],
    ['403', 'permissionDenied', mockApiErrorFixtures.permissionDenied.status],
    ['409', 'conflict', mockApiErrorFixtures.conflict.status],
    ['422', 'error', mockApiErrorFixtures.validation.status],
  ] as const)(
    'normalizes mock %s scenarios through the API client',
    async (scenario, kind, status) => {
      process.env.EXPO_PUBLIC_MOCK_SCENARIO = scenario;

      await expect(apiRequest('/api/v1/users/me', {skipAuthRefresh: true})).rejects.toSatisfy(
        (error) => {
          expectApiError(error, {kind, status});
          return true;
        },
      );
    },
  );

  it('normalizes mock offline and invalid envelope scenarios', async () => {
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'offline';

    await expect(apiRequest('/api/v1/users/me')).rejects.toSatisfy((error) => {
      expectApiError(error, {kind: 'offline'});
      return true;
    });

    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'invalid-envelope';

    await expect(apiRequest('/api/v1/users/me')).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'error',
        status: 200,
        message: '서버 응답 형식이 올바르지 않습니다.',
      });
      return true;
    });
  });

  it('reports missing mock-only endpoints as blocked API fixtures, not offline', async () => {
    await expect(apiRequest('/api/v1/not-yet-documented')).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'error',
        status: 501,
        code: 'MOCK_FIXTURE_MISSING',
      });
      return true;
    });
  });
});
