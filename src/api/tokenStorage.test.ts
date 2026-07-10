import {beforeEach, describe, expect, it, vi} from 'vitest';

const testState = vi.hoisted(() => ({
  platform: 'ios',
  storage: new Map<string, string>(),
}));

const secureStoreMocks = vi.hoisted(() => ({
  deleteItemAsync: vi.fn(async (key: string) => {
    testState.storage.delete(key);
  }),
  getItemAsync: vi.fn(async (key: string) => testState.storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string, _options?: unknown) => {
    testState.storage.set(key, value);
  }),
}));

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  ...secureStoreMocks,
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return testState.platform;
    },
  },
}));

describe('native auth token storage', () => {
  beforeEach(() => {
    testState.platform = 'ios';
    testState.storage.clear();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('migrates a complete legacy token pair into one protected record', async () => {
    testState.storage.set('faithlog.accessToken', 'legacy-access');
    testState.storage.set('faithlog.refreshToken', 'legacy-refresh');
    const tokenStorage = await import('./tokenStorage');

    await expect(tokenStorage.getStoredTokens()).resolves.toEqual({
      accessToken: 'legacy-access',
      refreshToken: 'legacy-refresh',
    });

    expect(testState.storage.has('faithlog.accessToken')).toBe(false);
    expect(testState.storage.has('faithlog.refreshToken')).toBe(false);
    expect(JSON.parse(testState.storage.get('faithlog.authTokens.v2')!)).toEqual({
      version: 1,
      accessToken: 'legacy-access',
      refreshToken: 'legacy-refresh',
    });
    expect(secureStoreMocks.setItemAsync).toHaveBeenCalledWith(
      'faithlog.authTokens.v2',
      expect.any(String),
      {keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY'},
    );
  });

  it('rejects stale writes after a newer auth session invalidates storage', async () => {
    const tokenStorage = await import('./tokenStorage');
    const staleGeneration = await tokenStorage.beginAuthSession();
    const currentGeneration = await tokenStorage.beginAuthSession();

    await expect(
      tokenStorage.saveTokens(
        {accessToken: 'stale-access', refreshToken: 'stale-refresh'},
        staleGeneration,
      ),
    ).resolves.toBe(false);
    await expect(
      tokenStorage.saveTokens(
        {accessToken: 'current-access', refreshToken: 'current-refresh'},
        currentGeneration,
      ),
    ).resolves.toBe(true);
    await expect(tokenStorage.getStoredAuthSession()).resolves.toEqual({
      generation: currentGeneration,
      accessToken: 'current-access',
      refreshToken: 'current-refresh',
    });
    await expect(
      tokenStorage.isAccessTokenOwnedByAuthSession(
        'current-access',
        currentGeneration,
      ),
    ).resolves.toBe(true);
    await expect(
      tokenStorage.isAccessTokenOwnedByAuthSession(
        'stale-access',
        currentGeneration,
      ),
    ).resolves.toBe(false);
  });

  it('stores FCM registration atomically with its owning user and session', async () => {
    const tokenStorage = await import('./tokenStorage');
    const generation = await tokenStorage.beginAuthSession();

    await expect(
      tokenStorage.saveFcmRegistration(
        {token: 'device-token', tokenId: 71, userId: 42},
        generation,
      ),
    ).resolves.toBe(true);
    await expect(tokenStorage.getStoredFcmRegistration()).resolves.toEqual({
      token: 'device-token',
      tokenId: 71,
      userId: 42,
    });

    await tokenStorage.clearTokens(generation);
    await expect(tokenStorage.getStoredFcmRegistration()).resolves.toEqual({
      token: null,
      tokenId: null,
      userId: null,
    });
  });

  it('fails closed when a stored token record is malformed', async () => {
    testState.storage.set('faithlog.authTokens.v2', '{"version":1,"accessToken":7}');
    const tokenStorage = await import('./tokenStorage');

    await expect(tokenStorage.getStoredTokens()).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
    });
    expect(testState.storage.get('faithlog.authInvalidated')).toBe('1');
    expect(testState.storage.has('faithlog.authTokens.v2')).toBe(false);
  });

  it('still invalidates tokens when the tombstone write fails but deletion succeeds', async () => {
    testState.storage.set(
      'faithlog.authTokens.v2',
      JSON.stringify({
        version: 1,
        accessToken: 'stored-access',
        refreshToken: 'stored-refresh',
      }),
    );
    secureStoreMocks.setItemAsync.mockRejectedValueOnce(
      new Error('tombstone unavailable'),
    );
    const tokenStorage = await import('./tokenStorage');

    await expect(tokenStorage.clearTokens()).resolves.toBe(true);
    expect(testState.storage.has('faithlog.authTokens.v2')).toBe(false);
  });

  it('reports failure when neither a tombstone nor token deletion is durable', async () => {
    testState.storage.set(
      'faithlog.authTokens.v2',
      JSON.stringify({
        version: 1,
        accessToken: 'stored-access',
        refreshToken: 'stored-refresh',
      }),
    );
    secureStoreMocks.setItemAsync.mockRejectedValueOnce(
      new Error('tombstone unavailable'),
    );
    secureStoreMocks.deleteItemAsync.mockRejectedValueOnce(
      new Error('token deletion unavailable'),
    );
    const tokenStorage = await import('./tokenStorage');

    await expect(tokenStorage.clearTokens()).rejects.toThrow(
      'Unable to invalidate stored authentication data.',
    );
    expect(testState.storage.has('faithlog.authTokens.v2')).toBe(true);
  });

  it('does not provide a browser storage fallback', async () => {
    testState.platform = 'web';
    const tokenStorage = await import('./tokenStorage');

    await expect(tokenStorage.getStoredTokens()).rejects.toThrow(
      'FaithLog web builds are not supported.',
    );
  });
});
