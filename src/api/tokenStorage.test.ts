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

  it('does not assign a queued token read to a generation created by logout', async () => {
    const tokenStorage = await import('./tokenStorage');
    const generation = await tokenStorage.beginAuthSession();
    let releaseWrite!: () => void;
    const blockedWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    secureStoreMocks.setItemAsync.mockImplementationOnce(async () => blockedWrite);
    const write = tokenStorage.saveTokens(
      {accessToken: 'old-access', refreshToken: 'old-refresh'}, generation,
    );
    const queuedRead = tokenStorage.getStoredTokens(generation);
    const logout = tokenStorage.clearTokens(generation);
    releaseWrite();
    await expect(write).resolves.toBe(false);
    await expect(queuedRead).rejects.toMatchObject({expectedGeneration: generation});
    await expect(logout).resolves.toBe(true);
  });

  it('keeps a tombstone if token rotation is interrupted after the token write', async () => {
    const tokenStorage = await import('./tokenStorage');
    const generation = await tokenStorage.beginAuthSession();
    let releaseTokenWrite!: () => void;
    const tokenWriteBlocked = new Promise<void>((resolve) => { releaseTokenWrite = resolve; });
    secureStoreMocks.setItemAsync
      .mockImplementationOnce(async (key: string, value: string) => {
        testState.storage.set(key, value); // auth tombstone
      })
      .mockImplementationOnce(async (key: string, value: string) => {
        testState.storage.set(key, value); // token record reached durable storage
        await tokenWriteBlocked;
      });
    const rotation = tokenStorage.saveTokens(
      {accessToken: 'rotated-access', refreshToken: 'rotated-refresh'}, generation,
    );
    await vi.waitFor(() => {
      expect(testState.storage.get('faithlog.authInvalidated')).toBe('1');
      expect(testState.storage.get('faithlog.authTokens.v2')).toContain('rotated-access');
    });

    const crashSnapshot = new Map(testState.storage);
    vi.resetModules();
    testState.storage = crashSnapshot;
    const restartedStorage = await import('./tokenStorage');
    await expect(restartedStorage.getStoredTokens()).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
    });
    releaseTokenWrite();
    await rotation;
  });

  it('turns a rejected old storage read into typed stale cancellation', async () => {
    const tokenStorage = await import('./tokenStorage');
    const generation = tokenStorage.getAuthSessionGeneration();
    let rejectRead!: (error: Error) => void;
    secureStoreMocks.getItemAsync.mockReturnValueOnce(new Promise((_, reject) => {
      rejectRead = reject;
    }));
    const oldRead = tokenStorage.getStoredAuthSession(generation);
    await vi.waitFor(() => expect(secureStoreMocks.getItemAsync).toHaveBeenCalled());
    const nextSession = tokenStorage.beginAuthSession();
    rejectRead(new Error('keychain unavailable'));
    await expect(oldRead).rejects.toMatchObject({expectedGeneration: generation});
    await nextSession;
    expect(tokenStorage.getAuthSessionGeneration()).toBe(generation + 1);
  });

  it('closes the current request gate synchronously before storage cleanup', async () => {
    const tokenStorage = await import('./tokenStorage');
    const generation = tokenStorage.getAuthSessionGeneration();
    expect(tokenStorage.markAuthSessionClosing(generation)).toBe(true);
    expect(tokenStorage.isAuthSessionRequestAllowed(generation)).toBe(false);
    await tokenStorage.clearTokens(generation);
  });

  it('keeps a tombstone and rejects rotated tokens when logout closes during save', async () => {
    const tokenStorage = await import('./tokenStorage');
    const generation = await tokenStorage.beginAuthSession();
    let releaseTokenWrite!: () => void;
    const tokenWriteBlocked = new Promise<void>((resolve) => { releaseTokenWrite = resolve; });
    secureStoreMocks.setItemAsync
      .mockImplementationOnce(async (key: string, value: string) => {
        testState.storage.set(key, value);
      })
      .mockImplementationOnce(async (key: string, value: string) => {
        testState.storage.set(key, value);
        await tokenWriteBlocked;
      });

    const saving = tokenStorage.saveTokens({
      accessToken: 'closing-rotated-access',
      refreshToken: 'closing-rotated-refresh',
    }, generation);
    await vi.waitFor(() => expect(
      testState.storage.get('faithlog.authTokens.v2'),
    ).toContain('closing-rotated-access'));
    expect(tokenStorage.markAuthSessionClosing(generation)).toBe(true);
    releaseTokenWrite();

    await expect(saving).resolves.toBe(false);
    expect(testState.storage.get('faithlog.authInvalidated')).toBe('1');
    await expect(tokenStorage.getStoredTokens(generation)).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
    });
    await expect(tokenStorage.isAccessTokenOwnedByAuthSession(
      'closing-rotated-access', generation,
    )).resolves.toBe(false);
  });

  it('keeps fail-closed marker when final token commit marker removal fails', async () => {
    const tokenStorage = await import('./tokenStorage');
    const generation = await tokenStorage.beginAuthSession();
    secureStoreMocks.deleteItemAsync.mockImplementation(async (key: string) => {
      if (key === 'faithlog.authInvalidated') throw new Error('delete interrupted');
      testState.storage.delete(key);
    });
    await expect(tokenStorage.saveTokens({
      accessToken: 'new-access', refreshToken: 'new-refresh',
    }, generation)).rejects.toThrow('delete interrupted');
    expect(testState.storage.get('faithlog.authInvalidated')).toBe('1');
    secureStoreMocks.deleteItemAsync.mockImplementation(async (key: string) => {
      testState.storage.delete(key);
    });
  });

  it('keeps fail-closed marker when legacy migration finalization is interrupted', async () => {
    testState.storage.set('faithlog.accessToken', 'legacy-access');
    testState.storage.set('faithlog.refreshToken', 'legacy-refresh');
    secureStoreMocks.deleteItemAsync.mockImplementation(async (key: string) => {
      if (key === 'faithlog.authInvalidated') throw new Error('migration interrupted');
      testState.storage.delete(key);
    });
    const tokenStorage = await import('./tokenStorage');
    await expect(tokenStorage.getStoredTokens()).rejects.toThrow('migration interrupted');
    expect(testState.storage.get('faithlog.authInvalidated')).toBe('1');
    secureStoreMocks.deleteItemAsync.mockImplementation(async (key: string) => {
      testState.storage.delete(key);
    });
  });

  it('keeps every rotated access token owned by the same auth session', async () => {
    const tokenStorage = await import('./tokenStorage');
    const generation = await tokenStorage.beginAuthSession();

    await tokenStorage.saveTokens(
      {accessToken: 'first-access', refreshToken: 'first-refresh'},
      generation,
    );
    await tokenStorage.saveTokens(
      {accessToken: 'rotated-access', refreshToken: 'rotated-refresh'},
      generation,
    );

    await expect(
      tokenStorage.isAccessTokenOwnedByAuthSession('first-access', generation),
    ).resolves.toBe(true);
    await expect(
      tokenStorage.isAccessTokenOwnedByAuthSession('rotated-access', generation),
    ).resolves.toBe(true);
    await expect(
      tokenStorage.isAccessTokenOwnedByAuthSession('unknown-access', generation),
    ).resolves.toBe(false);
  });

  it('forgets the previous account token lineage before a new session starts', async () => {
    const tokenStorage = await import('./tokenStorage');
    const previousGeneration = await tokenStorage.beginAuthSession();
    await tokenStorage.saveTokens(
      {accessToken: 'previous-access', refreshToken: 'previous-refresh'},
      previousGeneration,
    );

    const currentGeneration = await tokenStorage.beginAuthSession();
    await tokenStorage.saveTokens(
      {accessToken: 'current-access', refreshToken: 'current-refresh'},
      currentGeneration,
    );

    await expect(
      tokenStorage.isAccessTokenOwnedByAuthSession(
        'previous-access',
        previousGeneration,
      ),
    ).resolves.toBe(false);
    await expect(
      tokenStorage.isAccessTokenOwnedByAuthSession(
        'previous-access',
        currentGeneration,
      ),
    ).resolves.toBe(false);
    await expect(
      tokenStorage.isAccessTokenOwnedByAuthSession(
        'current-access',
        currentGeneration,
      ),
    ).resolves.toBe(true);
  });

  it('stores FCM registration atomically with its owning user and session', async () => {
    const tokenStorage = await import('./tokenStorage');
    const generation = await tokenStorage.beginAuthSession();

    await expect(
      tokenStorage.saveFcmRegistration(
        {
          token: 'device-token',
          tokenId: 71,
          userId: 42,
          clientInstanceId: 'client-instance-1',
        },
        generation,
      ),
    ).resolves.toBe(true);
    await expect(tokenStorage.getStoredFcmRegistration()).resolves.toEqual({
      token: 'device-token',
      tokenId: 71,
      userId: 42,
      clientInstanceId: 'client-instance-1',
    });

    await tokenStorage.clearTokens(generation);
    await expect(tokenStorage.getStoredFcmRegistration()).resolves.toEqual({
      token: null,
      tokenId: null,
      userId: null,
      clientInstanceId: null,
    });
  });

  it('uses an FCM tombstone when the current registration cannot be deleted', async () => {
    const tokenStorage = await import('./tokenStorage');
    const generation = await tokenStorage.beginAuthSession();

    await tokenStorage.saveFcmRegistration(
      {
        token: 'device-token',
        tokenId: 71,
        userId: 42,
        clientInstanceId: 'client-instance-1',
      },
      generation,
    );
    secureStoreMocks.deleteItemAsync.mockImplementationOnce(async (key: string) => {
      if (key === 'faithlog.fcmRegistration.v2') {
        throw new Error('FCM registration deletion unavailable');
      }

      testState.storage.delete(key);
    });

    await expect(
      tokenStorage.clearFcmRegistration(generation),
    ).resolves.toBe(true);
    expect(testState.storage.has('faithlog.fcmRegistration.v2')).toBe(true);
    expect(testState.storage.get('faithlog.fcmRegistrationInvalidated')).toBe('1');
    await expect(tokenStorage.getStoredFcmRegistration()).resolves.toEqual({
      token: null,
      tokenId: null,
      userId: null,
      clientInstanceId: null,
    });
  });

  it('reports failure when neither the FCM tombstone nor deletion is durable', async () => {
    const tokenStorage = await import('./tokenStorage');
    const generation = await tokenStorage.beginAuthSession();

    await tokenStorage.saveFcmRegistration(
      {
        token: 'device-token',
        tokenId: 71,
        userId: 42,
        clientInstanceId: 'client-instance-1',
      },
      generation,
    );
    secureStoreMocks.setItemAsync.mockRejectedValueOnce(
      new Error('FCM tombstone unavailable'),
    );
    secureStoreMocks.deleteItemAsync.mockRejectedValueOnce(
      new Error('FCM registration deletion unavailable'),
    );

    await expect(
      tokenStorage.clearFcmRegistration(generation),
    ).rejects.toThrow('Unable to invalidate stored FCM registration.');
    await expect(tokenStorage.getStoredFcmRegistration()).resolves.toEqual({
      token: 'device-token',
      tokenId: 71,
      userId: 42,
      clientInstanceId: 'client-instance-1',
    });
  });

  it('treats a legacy FCM record as unbound to the current client instance', async () => {
    testState.storage.set(
      'faithlog.fcmRegistration.v2',
      JSON.stringify({
        version: 1,
        token: 'legacy-device-token',
        tokenId: 70,
        userId: 42,
      }),
    );
    const tokenStorage = await import('./tokenStorage');

    await expect(tokenStorage.getStoredFcmRegistration()).resolves.toEqual({
      token: 'legacy-device-token',
      tokenId: 70,
      userId: 42,
      clientInstanceId: null,
    });
  });

  it('durably rotates a retired client instance before it can be reused', async () => {
    testState.storage.set('faithlog.clientInstanceId', 'retired-client-instance');
    const tokenStorage = await import('./tokenStorage');

    await expect(
      tokenStorage.rotateClientInstanceId('retired-client-instance'),
    ).resolves.toBe(true);

    const replacement = testState.storage.get('faithlog.clientInstanceId');
    expect(replacement).toBeTruthy();
    expect(replacement).not.toBe('retired-client-instance');
    await expect(tokenStorage.getOrCreateClientInstanceId()).resolves.toBe(
      replacement,
    );
  });

  it('does not overwrite a client instance that has already changed', async () => {
    testState.storage.set('faithlog.clientInstanceId', 'current-client-instance');
    const tokenStorage = await import('./tokenStorage');

    await expect(
      tokenStorage.rotateClientInstanceId('stale-client-instance'),
    ).resolves.toBe(false);
    expect(testState.storage.get('faithlog.clientInstanceId')).toBe(
      'current-client-instance',
    );
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

  it('reports logout storage failure when FCM invalidation is not durable', async () => {
    testState.storage.set(
      'faithlog.fcmRegistration.v2',
      JSON.stringify({
        version: 2,
        token: 'device-token',
        tokenId: 71,
        userId: 42,
        clientInstanceId: 'client-instance-1',
      }),
    );
    secureStoreMocks.setItemAsync.mockImplementation(
      async (key: string, value: string) => {
        if (key === 'faithlog.fcmRegistrationInvalidated') {
          throw new Error('FCM tombstone unavailable');
        }

        testState.storage.set(key, value);
      },
    );
    secureStoreMocks.deleteItemAsync.mockImplementation(async (key: string) => {
      if (key === 'faithlog.fcmRegistration.v2') {
        throw new Error('FCM registration deletion unavailable');
      }

      testState.storage.delete(key);
    });
    const tokenStorage = await import('./tokenStorage');

    await expect(tokenStorage.clearTokens()).rejects.toThrow(
      'Unable to invalidate stored authentication data.',
    );
    await expect(tokenStorage.getStoredFcmRegistration()).resolves.toEqual({
      token: 'device-token',
      tokenId: 71,
      userId: 42,
      clientInstanceId: 'client-instance-1',
    });
  });

  it('does not provide a browser storage fallback', async () => {
    testState.platform = 'web';
    const tokenStorage = await import('./tokenStorage');

    await expect(tokenStorage.getStoredTokens()).rejects.toThrow(
      'FaithLog web builds are not supported.',
    );
  });
});
