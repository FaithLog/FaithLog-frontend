import {beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  hasPendingFcm: true,
}));
const obligation = vi.hoisted(() => ({
  accessToken: 'old-access', refreshToken: 'old-refresh', userId: 42,
  clientInstanceId: 'old-client', kind: 'registration' as const,
  token: 'old-device-token', tokenId: null, state: 'mayHaveSent' as const,
}));
const logoutUser = vi.hoisted(() => vi.fn());

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: vi.fn(async (key: string) => state.storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { state.storage.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { state.storage.delete(key); }),
}));
vi.mock('react-native', () => ({Platform: {OS: 'ios'}}));
vi.mock('../api/client', () => ({
  FaithLogApiError: class FaithLogApiError extends Error {
    constructor(readonly detail: {message: string}) { super(detail.message); }
  },
  fetchCurrentUser: vi.fn(), fetchMyCampuses: vi.fn(), loginUser: vi.fn(),
  logoutUser, refreshAuthToken: vi.fn(), signupUser: vi.fn(),
}));
vi.mock('../notifications/fcmRegistration', () => ({
  capturePendingFcmOperations: vi.fn(() => state.hasPendingFcm
    ? {
        barrier: new Promise<void>(() => {}),
        settlement: new Promise<typeof obligation[]>(() => {}),
        obligations: [obligation],
        hasPendingOperations: true,
      }
    : {
        barrier: Promise.resolve(), settlement: Promise.resolve([]),
        obligations: [], hasPendingOperations: false,
      }),
  compensateCapturedFcmOperations: vi.fn(),
}));
vi.mock('./fcmLogout', () => ({
  getLogoutFcmDeactivationPayload: vi.fn(async () => ({})),
}));

describe('explicit logout durable cleanup snapshot', () => {
  beforeEach(() => {
    state.storage.clear();
    state.hasPendingFcm = true;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('persists captured obligations before local auth deletion survives restart', async () => {
    const tokenStorage = await import('../api/tokenStorage');
    const generation = await tokenStorage.beginAuthSession();
    await tokenStorage.saveTokens({
      accessToken: 'old-access', refreshToken: 'old-refresh',
    }, generation);
    const {prepareCurrentSessionLogout} = await import('./session');

    await prepareCurrentSessionLogout(42);
    expect(state.storage.get('faithlog.authInvalidated')).toBe('1');
    expect(state.storage.has('faithlog.fcmRemoteCleanupPending.v1')).toBe(true);

    const snapshot = new Map(state.storage);
    vi.resetModules();
    state.storage = snapshot;
    const restartedStorage = await import('../api/tokenStorage');
    await expect(restartedStorage.getStoredTokens()).resolves.toEqual({
      accessToken: null, refreshToken: null,
    });
    await expect(restartedStorage.getFcmRemoteCleanupObligations()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 42, clientInstanceId: 'old-client', token: 'old-device-token',
        }),
        expect.objectContaining({
          kind: 'clientLogout', accessToken: 'old-access', refreshToken: 'old-refresh',
        }),
      ]),
    );
  });

  it('persists current-session revoke before clear even without pending FCM work', async () => {
    state.hasPendingFcm = false;
    logoutUser.mockReturnValue(new Promise(() => {}));
    const tokenStorage = await import('../api/tokenStorage');
    const generation = await tokenStorage.beginAuthSession();
    await tokenStorage.saveTokens({
      accessToken: 'old-access', refreshToken: 'old-refresh',
    }, generation);
    const {prepareCurrentSessionLogout} = await import('./session');

    await prepareCurrentSessionLogout(42);
    const snapshot = new Map(state.storage);
    vi.resetModules();
    state.storage = snapshot;
    const restartedStorage = await import('../api/tokenStorage');
    await expect(restartedStorage.getFcmRemoteCleanupObligations()).resolves.toEqual([
      expect.objectContaining({
        kind: 'clientLogout', accessToken: 'old-access', refreshToken: 'old-refresh',
        clientInstanceId: null,
      }),
    ]);
    await expect(restartedStorage.getStoredTokens()).resolves.toEqual({
      accessToken: null, refreshToken: null,
    });
  });
});
