import {beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({storage: new Map<string, string>()}));
const api = vi.hoisted(() => ({
  deactivateCleanup: vi.fn(),
  fetchCampuses: vi.fn(),
  fetchUser: vi.fn(),
  fcmPayload: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  registerCleanup: vi.fn(),
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
  deactivateMyFcmTokenForCleanup: api.deactivateCleanup,
  FaithLogApiError: class FaithLogApiError extends Error {
    constructor(readonly detail: {message: string; kind: string; status?: number}) {
      super(detail.message);
    }
  },
  fetchCurrentUser: api.fetchUser,
  fetchMyCampuses: api.fetchCampuses,
  loginUser: api.login,
  logoutUser: api.logout,
  refreshAuthToken: vi.fn(),
  refreshAuthTokenForCleanup: vi.fn(),
  registerMyFcmToken: api.register,
  registerMyFcmTokenForCleanup: api.registerCleanup,
  signupUser: vi.fn(),
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
vi.mock('./fcmLogout', () => ({getLogoutFcmDeactivationPayload: api.fcmPayload}));

describe('active remote cleanup ownership', () => {
  beforeEach(() => {
    state.storage.clear();
    vi.clearAllMocks();
    vi.resetModules();
    api.deactivateCleanup.mockResolvedValue(null);
    api.fcmPayload.mockResolvedValue({});
    api.logout.mockResolvedValue(null);
    api.login.mockResolvedValue({
      accessToken: 'new-access', refreshToken: 'new-refresh',
      accessTokenExpiresIn: 3600, refreshTokenExpiresIn: 7200, tokenType: 'Bearer',
    });
    api.fetchUser.mockResolvedValue({
      id: 42, email: 'next@example.test', name: '다음 사용자', role: 'USER',
      isActive: true, lastLoginAt: null, campusMemberships: [],
    });
    api.fetchCampuses.mockResolvedValue([]);
  });

  it('joins the original sent operation before durable reconciliation or next login', async () => {
    const storage = await import('../api/tokenStorage');
    const generation = await storage.beginAuthSession();
    await storage.saveTokens({accessToken: 'old-access', refreshToken: 'old-refresh'}, generation);
    let finishOriginal!: (value: {
      appVersion: string; clientInstanceId: string; deviceType: 'IOS'; isActive: boolean;
      lastRefreshedAt: string; lastSeenAt: string; tokenId: number;
    }) => void;
    api.register.mockReturnValue(new Promise((resolve) => { finishOriginal = resolve; }));
    const fcm = await import('../notifications/fcmRegistration');
    const session = await import('./session');
    const original = fcm.registerFcmTokenValue(
      'old-access', 42, 'old-device-token', generation,
    );
    await vi.waitFor(() => expect(api.register).toHaveBeenCalledOnce());
    const prepared = await session.prepareCurrentSessionLogout(42);
    const remote = prepared.completeRemoteLogout();
    const nextLogin = session.loginAndEstablishSession({
      email: 'next@example.test', password: 'test-password',
    });
    await Promise.resolve();
    expect(api.registerCleanup).not.toHaveBeenCalled();
    expect(api.login).not.toHaveBeenCalled();

    finishOriginal({
      appVersion: '0.1.0-test', clientInstanceId: 'faithlog-client', deviceType: 'IOS',
      isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 77,
    });
    await expect(original).rejects.toThrow();
    await expect(remote).resolves.toMatchObject({status: 'signedOut'});
    await expect(nextLogin).resolves.toMatchObject({status: 'noCampus'});
    await expect(storage.getFcmRemoteCleanupObligations()).resolves.toBeNull();
    expect(api.deactivateCleanup).toHaveBeenCalledWith('old-access', 77);
    expect(api.registerCleanup).not.toHaveBeenCalled();
    expect(api.logout.mock.invocationCallOrder[0]).toBeLessThan(
      api.login.mock.invocationCallOrder[0]!,
    );
  });

  it('persists a post-capture second recovery obligation before its POST', async () => {
    const storage = await import('../api/tokenStorage');
    const generation = await storage.beginAuthSession();
    await storage.saveTokens({accessToken: 'old-access', refreshToken: 'old-refresh'}, generation);
    await storage.saveFcmRegistrationAttempt({
      userId: 42, clientInstanceId: 'old-A', token: 'token-A',
    }, generation);
    await storage.saveFcmRegistrationAttempt({
      userId: 42, clientInstanceId: 'old-B', token: 'token-B',
    }, generation);
    let finishFirst!: (value: {
      appVersion: string; clientInstanceId: string; deviceType: 'IOS'; isActive: boolean;
      lastRefreshedAt: string; lastSeenAt: string; tokenId: number;
    }) => void;
    api.register
      .mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }))
      .mockReturnValueOnce(new Promise(() => {}));
    const fcm = await import('../notifications/fcmRegistration');
    const disable = fcm.deactivateCurrentFcmToken('old-access', 42, generation);
    void disable.catch(() => undefined);
    await vi.waitFor(() => expect(api.register).toHaveBeenCalledOnce());
    const captured = fcm.capturePendingFcmOperations(generation);
    await storage.markFcmRemoteCleanupPending(captured.obligations ?? []);
    finishFirst({
      appVersion: '0.1.0-test', clientInstanceId: 'old-A', deviceType: 'IOS',
      isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 101,
    });
    await vi.waitFor(() => expect(api.register).toHaveBeenCalledTimes(2));

    const snapshot = new Map(state.storage);
    vi.resetModules();
    state.storage = snapshot;
    const restartedStorage = await import('../api/tokenStorage');
    await expect(restartedStorage.getFcmRemoteCleanupObligations()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'registration', clientInstanceId: 'old-B', token: 'token-B',
          accessToken: 'old-access', refreshToken: 'old-refresh',
        }),
      ]),
    );
  });

  it('restarts a crash-safe session logout with the stored current client and retires it', async () => {
    const storage = await import('../api/tokenStorage');
    const generation = await storage.beginAuthSession();
    await storage.saveTokens({accessToken: 'old-access', refreshToken: 'old-refresh'}, generation);
    const currentClient = await storage.getOrCreateClientInstanceId();
    const session = await import('./session');
    api.fcmPayload.mockReturnValue(new Promise(() => {}));
    void session.prepareCurrentSessionLogout(42);
    await vi.waitFor(() => {
      expect(state.storage.get('faithlog.authInvalidated')).toBe('1');
      expect(state.storage.has('faithlog.fcmRemoteCleanupPending.v1')).toBe(true);
    });

    const snapshot = new Map(state.storage);
    expect(snapshot.get('faithlog.clientInstanceId')).toBe(currentClient);
    vi.resetModules();
    state.storage = snapshot;
    const restartedStorage = await import('../api/tokenStorage');
    await import('../notifications/fcmRegistration');
    const cleanup = await import('./fcmTransitionCleanup');

    await expect(cleanup.waitForFcmTransitionCleanup(5_000)).resolves.toBe(true);
    expect(api.logout).toHaveBeenCalledOnce();
    expect(api.logout).toHaveBeenCalledWith('old-access', {
      refreshToken: 'old-refresh', clientInstanceId: currentClient,
    });
    await expect(restartedStorage.getStoredClientInstanceId()).resolves.not.toBe(currentClient);
    await expect(restartedStorage.getFcmRemoteCleanupObligations()).resolves.toBeNull();
  });

  it('does not leave an empty durable gate after account deletion with no FCM work', async () => {
    const storage = await import('../api/tokenStorage');
    const generation = await storage.beginAuthSession();
    await storage.saveTokens({accessToken: 'old-access', refreshToken: 'old-refresh'}, generation);
    const fcm = await import('../notifications/fcmRegistration');
    const deleteAccount = vi.fn(async () => undefined);

    const result = await fcm.runAccountDeletionWithFcmPreflight(
      generation,
      async () => 'old-access',
      deleteAccount,
    );
    expect(result.status).toBe('completed');
    if (result.status === 'completed') await result.cleanup;
    expect(deleteAccount).toHaveBeenCalledWith('old-access');
    await expect(storage.getFcmRemoteCleanupObligations()).resolves.toBeNull();
  });

  it('joins an FCM credential rotation and deletes the account with stored A2', async () => {
    const storage = await import('../api/tokenStorage');
    const generation = await storage.beginAuthSession();
    await storage.saveTokens({accessToken: 'A1', refreshToken: 'R1'}, generation);
    const rotated = {accessToken: 'A2', refreshToken: 'R2'};
    api.register.mockImplementation(async (...args: unknown[]) => {
      await storage.saveTokens(rotated, generation);
      const onEffective = args[3] as ((tokens: typeof rotated) => Promise<void>) | undefined;
      await onEffective?.(rotated);
      return {
        appVersion: '0.1.0-test', clientInstanceId: 'current-client', deviceType: 'IOS',
        isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
        lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 77,
      };
    });
    const fcm = await import('../notifications/fcmRegistration');
    const registration = fcm.registerFcmTokenValue('A1', 42, 'device-token', generation);
    const deleteAccount = vi.fn(async () => undefined);
    const deletion = fcm.runAccountDeletionWithFcmPreflight(
      generation,
      async () => (await storage.getStoredAuthSession(generation)).accessToken,
      deleteAccount,
    );

    await registration;
    const result = await deletion;
    expect(result.status).toBe('completed');
    if (result.status === 'completed') await result.cleanup;
    expect(deleteAccount).toHaveBeenCalledOnce();
    expect(deleteAccount).toHaveBeenCalledWith('A2');
    expect(api.logout).not.toHaveBeenCalled();
  });

  it('clears captured receipts without teardown when account deletion fails normally', async () => {
    const storage = await import('../api/tokenStorage');
    const generation = await storage.beginAuthSession();
    await storage.saveTokens({accessToken: 'old-access', refreshToken: 'old-refresh'}, generation);
    let finishRegistration!: (value: {
      appVersion: string; clientInstanceId: string; deviceType: 'IOS'; isActive: boolean;
      lastRefreshedAt: string; lastSeenAt: string; tokenId: number;
    }) => void;
    api.register.mockReturnValue(new Promise((resolve) => { finishRegistration = resolve; }));
    const fcm = await import('../notifications/fcmRegistration');
    const registration = fcm.registerFcmTokenValue(
      'old-access', 42, 'desired-device-token', generation,
    );
    await vi.waitFor(() => expect(api.register).toHaveBeenCalledOnce());
    const deletion = fcm.runAccountDeletionWithFcmPreflight(
      generation,
      async () => 'old-access',
      async () => { throw new Error('wrong password'); },
    );
    finishRegistration({
      appVersion: '0.1.0-test', clientInstanceId: 'current-client', deviceType: 'IOS',
      isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 77,
    });
    await registration;

    await expect(deletion).rejects.toThrow('wrong password');
    await expect(storage.getFcmRemoteCleanupObligations()).resolves.toBeNull();
    await expect(storage.getStoredAuthSession(generation)).resolves.toMatchObject({
      accessToken: 'old-access', refreshToken: 'old-refresh',
    });
    expect(api.logout).not.toHaveBeenCalled();
    expect(api.deactivateCleanup).not.toHaveBeenCalled();
  });
});
