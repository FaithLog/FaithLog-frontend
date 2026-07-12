import {beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  failSet: new Set<string>(),
  failDelete: new Set<string>(),
}));
const refreshAndEstablishSession = vi.hoisted(() => vi.fn());

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: vi.fn(async (key: string) => state.storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    if (state.failSet.has(key)) throw new Error('set failed');
    state.storage.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    if (state.failDelete.has(key)) throw new Error('delete failed');
    state.storage.delete(key);
  }),
}));
vi.mock('react-native', () => ({Platform: {OS: 'ios'}}));
vi.mock('../api/client', () => ({
  FaithLogApiError: class FaithLogApiError extends Error {},
  validateRuntimeConfig: vi.fn(),
}));
vi.mock('./session', () => ({refreshAndEstablishSession}));

describe('cold bootstrap durable cleanup gate', () => {
  beforeEach(() => {
    state.storage.clear();
    state.failSet.clear();
    state.failDelete.clear();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('does not restore old tokens while a persisted FCM cleanup is unresolved', async () => {
    state.storage.set('faithlog.authTokens.v2', JSON.stringify({
      version: 1, accessToken: 'old-access', refreshToken: 'old-refresh',
    }));
    state.storage.set('faithlog.fcmRemoteCleanupPending.v1', JSON.stringify({
      version: 1,
      obligations: [{
        accessToken: 'old-access', refreshToken: 'old-refresh', userId: 42,
        clientInstanceId: 'old-client', kind: 'registration', token: 'old-device-token',
        tokenId: null,
      }],
    }));
    const cleanup = await import('./fcmTransitionCleanup');
    cleanup.configureFcmTransitionCleanup({
      capture: () => ({
        barrier: Promise.resolve(), settlement: Promise.resolve([]), hasPendingOperations: false,
      }),
      compensate: async () => { throw new Error('remote cleanup unavailable'); },
    });
    const {bootstrapAuthGate} = await import('./authGate');

    await expect(bootstrapAuthGate()).resolves.toMatchObject({status: 'signedOut'});
    expect(refreshAndEstablishSession).not.toHaveBeenCalled();
    expect(state.storage.has('faithlog.fcmRemoteCleanupPending.v1')).toBe(true);
    expect(state.storage.get('faithlog.authInvalidated')).toBe('1');
  });

  it('stays signed out after successful reconciliation instead of restoring old refresh tokens', async () => {
    state.storage.set('faithlog.authTokens.v2', JSON.stringify({
      version: 1, accessToken: 'old-access', refreshToken: 'old-refresh',
    }));
    state.storage.set('faithlog.fcmRemoteCleanupPending.v1', JSON.stringify({
      version: 1,
      obligations: [{
        accessToken: 'old-access', refreshToken: 'old-refresh', userId: null,
        clientInstanceId: null, kind: 'clientLogout', token: null, tokenId: null,
      }],
    }));
    const cleanup = await import('./fcmTransitionCleanup');
    cleanup.configureFcmTransitionCleanup({
      capture: () => ({
        barrier: Promise.resolve(), settlement: Promise.resolve([]), hasPendingOperations: false,
      }),
      compensate: async (obligations) => obligations,
    });
    const {bootstrapAuthGate} = await import('./authGate');

    await expect(bootstrapAuthGate()).resolves.toMatchObject({status: 'signedOut'});
    expect(refreshAndEstablishSession).not.toHaveBeenCalled();
    expect(state.storage.get('faithlog.authInvalidated')).toBe('1');
    expect(state.storage.has('faithlog.fcmRemoteCleanupPending.v1')).toBe(false);
  });

  it('keeps the durable teardown gate when auth invalidation cannot be committed', async () => {
    state.storage.set('faithlog.authTokens.v2', JSON.stringify({
      version: 1, accessToken: 'old-access', refreshToken: 'old-refresh',
    }));
    state.storage.set('faithlog.fcmRemoteCleanupPending.v1', JSON.stringify({
      version: 1,
      obligations: [{
        accessToken: 'old-access', refreshToken: 'old-refresh', userId: null,
        clientInstanceId: null, kind: 'clientLogout', token: null, tokenId: null,
      }],
    }));
    state.failSet.add('faithlog.authInvalidated');
    state.failDelete.add('faithlog.authTokens.v2');
    const cleanup = await import('./fcmTransitionCleanup');
    const compensate = vi.fn(async (obligations) => obligations);
    cleanup.configureFcmTransitionCleanup({
      capture: () => ({
        barrier: Promise.resolve(), settlement: Promise.resolve([]), hasPendingOperations: false,
      }),
      compensate,
    });
    const {bootstrapAuthGate} = await import('./authGate');

    await expect(bootstrapAuthGate()).resolves.toMatchObject({status: 'signedOut'});
    expect(compensate).not.toHaveBeenCalled();
    expect(refreshAndEstablishSession).not.toHaveBeenCalled();
    expect(state.storage.has('faithlog.fcmRemoteCleanupPending.v1')).toBe(true);
    expect(state.storage.has('faithlog.authTokens.v2')).toBe(true);

    const snapshot = new Map(state.storage);
    vi.resetModules();
    state.storage = snapshot;
    const restartedCleanup = await import('./fcmTransitionCleanup');
    const restartedCompensate = vi.fn(async (obligations) => obligations);
    restartedCleanup.configureFcmTransitionCleanup({
      capture: () => ({
        barrier: Promise.resolve(), settlement: Promise.resolve([]), hasPendingOperations: false,
      }),
      compensate: restartedCompensate,
    });
    const restartedGate = await import('./authGate');
    await expect(restartedGate.bootstrapAuthGate()).resolves.toMatchObject({status: 'signedOut'});
    expect(restartedCompensate).not.toHaveBeenCalled();
    expect(refreshAndEstablishSession).not.toHaveBeenCalled();
    expect(state.storage.has('faithlog.fcmRemoteCleanupPending.v1')).toBe(true);
  });
});
