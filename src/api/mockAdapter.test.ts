import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('./tokenStorage', () => ({
  clearTokens: vi.fn(),
  getStoredTokens: vi.fn(),
  saveTokens: vi.fn(),
}));

import {
  apiRequest,
  FaithLogApiError,
  fetchPrayerWeek,
  loginUser,
  validateRuntimeConfig,
} from './client';
import {mockApiErrorFixtures, mockDomainFixtures} from './mockFixtures';

function expectApiError(error: unknown, expected: Partial<FaithLogApiError['detail']>) {
  expect(error).toBeInstanceOf(FaithLogApiError);
  expect((error as FaithLogApiError).detail).toMatchObject(expected);
}

describe('FaithLog mock API adapter', () => {
  beforeEach(() => {
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
