import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({storage: new Map<string, string>()}));

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: vi.fn(async (key: string) => state.storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { state.storage.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { state.storage.delete(key); }),
}));
vi.mock('react-native', () => ({Platform: {OS: 'ios'}}));
vi.mock('../notifications/appInfo', () => ({APP_VERSION: '0.1.0-test'}));
vi.mock('../notifications/fcmEnvironment', () => ({
  getFcmRuntimeAvailability: vi.fn(() => ({enabled: true})),
  isFcmRuntimeEnabled: vi.fn(() => true),
}));
vi.mock('../notifications/notificationAdapter', () => ({
  checkNotificationPermission: vi.fn(),
  getDeviceFcmToken: vi.fn(),
  getDeviceType: vi.fn(() => 'IOS'),
  requestNotificationPermission: vi.fn(),
}));

function envelope(data: unknown, patch: Record<string, unknown> = {}) {
  return {
    success: true,
    code: 'SUCCESS',
    message: 'ok',
    data,
    timestamp: '2026-07-13T00:00:00.000Z',
    ...patch,
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}

describe('account deletion session-expiry terminal', () => {
  beforeEach(() => {
    state.storage.clear();
    vi.resetModules();
    process.env.EXPO_PUBLIC_API_BASE_URL =
      'https://faithlog-549871256004.asia-northeast3.run.app';
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_APP_ENV;
    delete process.env.EXPO_PUBLIC_MOCK_MODE;
  });

  it('does not restore revoked FCM credentials after DELETE 401 and refresh 401', async () => {
    let finishFcmRegistration!: () => void;
    const requests: Array<{url: string; method: string}> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({url, method});
      if (url.endsWith('/api/v1/users/me/fcm-tokens') && method === 'POST') {
        return new Promise<Response>((resolve) => {
          finishFcmRegistration = () => resolve(jsonResponse(200, envelope({
            appVersion: '0.1.0-test', clientInstanceId: 'old-client', deviceType: 'IOS',
            isActive: true, lastRefreshedAt: '2026-07-13T00:00:00.000Z',
            lastSeenAt: '2026-07-13T00:00:00.000Z', tokenId: 77,
          })));
        });
      }
      if (url.endsWith('/api/v1/users/me') && method === 'DELETE') {
        return jsonResponse(401, envelope(null, {
          success: false, code: 'AUTH_UNAUTHORIZED', message: 'expired',
        }));
      }
      if (url.endsWith('/api/v1/auth/refresh') && method === 'POST') {
        return jsonResponse(401, envelope(null, {
          success: false, code: 'AUTH_REFRESH_REJECTED', message: 'revoked',
        }));
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    }));

    const storage = await import('../api/tokenStorage');
    const generation = await storage.beginAuthSession();
    await storage.saveTokens(
      {accessToken: 'expired-A1', refreshToken: 'revoked-R1'}, generation,
    );
    const fcm = await import('../notifications/fcmRegistration');
    const client = await import('../api/client');
    const registration = fcm.registerFcmTokenValue(
      'expired-A1', 42, 'old-device-token', generation,
    );
    await vi.waitFor(() => {
      expect(requests).toContainEqual(expect.objectContaining({
        method: 'POST', url: expect.stringContaining('/users/me/fcm-tokens'),
      }));
    });

    const deletion = fcm.runAccountDeletionWithFcmPreflight(
      generation,
      async () => (await storage.getStoredAuthSession(generation)).accessToken,
      (accessToken) => client.deleteMyAccount(accessToken, {
        password: 'test-password', confirmText: '회원탈퇴',
      }),
    );
    finishFcmRegistration();
    await registration;
    await expect(deletion).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(client.FaithLogApiError);
      expect((error as InstanceType<typeof client.FaithLogApiError>).detail.kind)
        .toBe('sessionExpired');
      return true;
    });
    await expect(storage.getFcmRemoteCleanupObligations()).resolves.toBeNull();

    const snapshot = new Map(state.storage);
    vi.resetModules();
    state.storage = snapshot;
    await import('../notifications/fcmRegistration');
    const restartedCleanup = await import('./fcmTransitionCleanup');
    await expect(restartedCleanup.waitForFcmTransitionCleanup(5_000)).resolves.toBe(true);
    const cleanupRequests = requests.filter(({url}) =>
      url.includes('/fcm-tokens/') || url.endsWith('/api/v1/auth/logout'));
    expect(cleanupRequests).toEqual([]);
  });
});
