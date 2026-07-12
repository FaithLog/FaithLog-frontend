import {beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({storage: new Map<string, string>()}));
const api = vi.hoisted(() => ({
  deactivate: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  register: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: vi.fn(async (key: string) => state.storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { state.storage.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { state.storage.delete(key); }),
}));
vi.mock('react-native', () => ({Platform: {OS: 'ios'}}));
vi.mock('../api/client', () => ({
  deactivateMyFcmToken: vi.fn(),
  deactivateMyFcmTokenForCleanup: api.deactivate,
  FaithLogApiError: class FaithLogApiError extends Error {
    constructor(readonly detail: {message: string; kind: string; status?: number}) {
      super(detail.message);
    }
  },
  logoutUser: api.logout,
  refreshAuthTokenForCleanup: api.refresh,
  registerMyFcmToken: vi.fn(),
  registerMyFcmTokenForCleanup: api.register,
}));
vi.mock('../notifications/appInfo', () => ({APP_VERSION: '0.1.0-test'}));
vi.mock('../notifications/fcmEnvironment', () => ({
  getFcmRuntimeAvailability: vi.fn(() => ({enabled: true})),
  isFcmRuntimeEnabled: vi.fn(() => true),
}));
vi.mock('../notifications/notificationAdapter', () => ({
  checkNotificationPermission: vi.fn(), getDeviceFcmToken: vi.fn(),
  getDeviceType: vi.fn(() => 'IOS'), requestNotificationPermission: vi.fn(),
}));

describe('durable FCM reconciliation', () => {
  beforeEach(() => {
    state.storage.clear();
    vi.clearAllMocks();
    vi.resetModules();
    api.deactivate.mockResolvedValue(null);
    api.logout.mockResolvedValue(null);
    api.refresh.mockResolvedValue({
      accessToken: 'rotated-access', refreshToken: 'rotated-refresh',
      accessTokenExpiresIn: 3600, refreshTokenExpiresIn: 7200, tokenType: 'Bearer',
    });
  });

  it('clears registration and introduced rotated logout in one wait', async () => {
    const {FaithLogApiError} = await import('../api/client');
    api.register
      .mockRejectedValueOnce(new FaithLogApiError({
        kind: 'sessionExpired', status: 401, message: 'expired',
      }))
      .mockResolvedValueOnce({
        appVersion: '0.1.0-test', clientInstanceId: 'old-client', deviceType: 'IOS',
        isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
        lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 77,
      });
    const storage = await import('../api/tokenStorage');
    await storage.markFcmRemoteCleanupPending([{
      accessToken: 'expired-access', refreshToken: 'old-refresh', userId: 42,
      clientInstanceId: 'old-client', kind: 'registration', token: 'old-token', tokenId: null,
    }]);
    await import('../notifications/fcmRegistration');
    const {waitForFcmTransitionCleanup} = await import('./fcmTransitionCleanup');

    await expect(waitForFcmTransitionCleanup(5_000)).resolves.toBe(true);
    await expect(storage.getFcmRemoteCleanupObligations()).resolves.toBeNull();
    expect(api.logout).toHaveBeenCalledOnce();
    expect(api.logout).toHaveBeenCalledWith('rotated-access', {
      refreshToken: 'rotated-refresh', clientInstanceId: 'old-client',
    });
  });

  it('refreshes an expired client logout without appending a duplicate logout', async () => {
    const {FaithLogApiError} = await import('../api/client');
    api.logout
      .mockRejectedValueOnce(new FaithLogApiError({
        kind: 'sessionExpired', status: 401, message: 'expired',
      }))
      .mockResolvedValueOnce(null);
    const storage = await import('../api/tokenStorage');
    await storage.markFcmRemoteCleanupPending([{
      accessToken: 'expired-access', refreshToken: 'old-refresh', userId: null,
      clientInstanceId: null, kind: 'clientLogout', token: null, tokenId: null,
    }]);
    await import('../notifications/fcmRegistration');
    const {waitForFcmTransitionCleanup} = await import('./fcmTransitionCleanup');

    await expect(waitForFcmTransitionCleanup(5_000)).resolves.toBe(true);
    await expect(storage.getFcmRemoteCleanupObligations()).resolves.toBeNull();
    expect(api.logout).toHaveBeenCalledTimes(2);
    expect(api.logout).toHaveBeenLastCalledWith('rotated-access', {
      refreshToken: 'rotated-refresh',
    });
  });

  it('retries local client retirement without repeating remote logout', async () => {
    const storage = await import('../api/tokenStorage');
    const retiredClient = await storage.getOrCreateClientInstanceId();
    await storage.markFcmRemoteCleanupPending([{
      accessToken: 'retired-session', refreshToken: null, userId: null,
      clientInstanceId: retiredClient, kind: 'clientRetirement', token: null, tokenId: null,
    }]);
    await import('../notifications/fcmRegistration');
    const {waitForFcmTransitionCleanup} = await import('./fcmTransitionCleanup');

    await expect(waitForFcmTransitionCleanup(5_000)).resolves.toBe(true);
    await expect(storage.getFcmRemoteCleanupObligations()).resolves.toBeNull();
    await expect(storage.getStoredClientInstanceId()).resolves.not.toBe(retiredClient);
    expect(api.logout).not.toHaveBeenCalled();
  });
});
