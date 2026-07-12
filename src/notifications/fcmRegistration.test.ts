import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => ({
  deactivateMyFcmToken: vi.fn(),
  deactivateMyFcmTokenForCleanup: vi.fn(),
  FaithLogApiError: class FaithLogApiError extends Error {
    readonly detail: unknown;

    constructor(detail: {message: string}) {
      super(detail.message);
      this.detail = detail;
    }
  },
  registerMyFcmToken: vi.fn(),
  registerMyFcmTokenForCleanup: vi.fn(),
  refreshAuthTokenForCleanup: vi.fn(),
  logoutUser: vi.fn(),
}));

vi.mock('../api/tokenStorage', () => ({
  CorruptFcmPrivacyStateError: class CorruptFcmPrivacyStateError extends Error {
    constructor() { super('Stored FCM privacy state is corrupt.'); }
  },
  clearFcmRegistration: vi.fn(),
  clearFcmRegistrationAttempt: vi.fn(),
  clearFcmRegistrationAttemptAfterRemoteCleanup: vi.fn(),
  clearFcmOptOut: vi.fn(),
  getAuthSessionGeneration: vi.fn(),
  getOrCreateClientInstanceId: vi.fn(),
  getFcmOptOutState: vi.fn(),
  getFcmRegistrationAttempts: vi.fn(),
  getStoredFcmRegistration: vi.fn(),
  getStoredAuthSession: vi.fn(),
  getStoredClientInstanceId: vi.fn(),
  isFcmOptedOut: vi.fn(),
  isAuthSessionGenerationCurrent: vi.fn(),
  isAuthSessionRequestAllowed: vi.fn(),
  saveFcmRegistration: vi.fn(),
  saveFcmRegistrationAttempt: vi.fn(),
  saveFcmOptOut: vi.fn(),
  markFcmRemoteCleanupPending: vi.fn(),
}));

vi.mock('./appInfo', () => ({
  APP_VERSION: '0.1.0-test',
}));

vi.mock('./fcmEnvironment', () => ({
  getFcmRuntimeAvailability: vi.fn(),
  isFcmRuntimeEnabled: vi.fn(),
}));

vi.mock('./notificationAdapter', () => ({
  checkNotificationPermission: vi.fn(),
  getDeviceFcmToken: vi.fn(),
  getDeviceType: vi.fn(),
  requestNotificationPermission: vi.fn(),
}));

import {
  deactivateMyFcmToken,
  deactivateMyFcmTokenForCleanup,
  FaithLogApiError,
  logoutUser,
  registerMyFcmToken,
  registerMyFcmTokenForCleanup,
  refreshAuthTokenForCleanup,
} from '../api/client';
import type {FcmTokenRegisterResponse} from '../api/types';
import {
  CorruptFcmPrivacyStateError,
  getAuthSessionGeneration,
  clearFcmRegistration,
  clearFcmOptOut,
  clearFcmRegistrationAttempt,
  getOrCreateClientInstanceId,
  getFcmOptOutState,
  getFcmRegistrationAttempts,
  getStoredFcmRegistration,
  getStoredAuthSession,
  getStoredClientInstanceId,
  isFcmOptedOut,
  isAuthSessionGenerationCurrent,
  isAuthSessionRequestAllowed,
  markFcmRemoteCleanupPending,
  saveFcmRegistration,
  saveFcmRegistrationAttempt,
  saveFcmOptOut,
  type AuthSessionGeneration,
} from '../api/tokenStorage';
import {getFcmRuntimeAvailability, isFcmRuntimeEnabled} from './fcmEnvironment';
import {
  capturePendingFcmRegistrationBarrier,
  capturePendingFcmOperations,
  compensateCapturedFcmOperations,
  deactivateCurrentFcmToken,
  ensureAutomaticFcmRegistration,
  inspectFcmRegistrationStatus,
  inspectFcmRegistrationStatusWithCleanup,
  registerCurrentFcmToken,
  registerFcmTokenValue,
  resetFcmRegistrationCoordinatorForTests,
} from './fcmRegistration';
import {
  checkNotificationPermission,
  getDeviceFcmToken,
  getDeviceType,
  requestNotificationPermission,
} from './notificationAdapter';

const AUTH_GENERATION = 7 as AuthSessionGeneration;
const USER_ID = 42;

describe('FCM registration', () => {
  beforeEach(() => {
    resetFcmRegistrationCoordinatorForTests();
    vi.clearAllMocks();
    vi.mocked(getAuthSessionGeneration).mockReturnValue(AUTH_GENERATION);
    vi.mocked(isAuthSessionGenerationCurrent).mockReturnValue(true);
    vi.mocked(isAuthSessionRequestAllowed).mockReturnValue(true);
    vi.mocked(saveFcmRegistration).mockResolvedValue(true);
    vi.mocked(getStoredAuthSession).mockResolvedValue({
      generation: AUTH_GENERATION,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    vi.mocked(getStoredClientInstanceId).mockResolvedValue('faithlog-client-1');
    vi.mocked(refreshAuthTokenForCleanup).mockResolvedValue({
      accessToken: 'cleanup-access-token', refreshToken: 'cleanup-refresh-token',
      accessTokenExpiresIn: 3600, refreshTokenExpiresIn: 86400, tokenType: 'Bearer',
    });
    vi.mocked(deactivateMyFcmTokenForCleanup).mockResolvedValue(null);
    vi.mocked(registerMyFcmTokenForCleanup).mockResolvedValue({
      appVersion: '0.1.0-test', clientInstanceId: 'cleanup-client', deviceType: 'IOS',
      isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 999,
    });
    vi.mocked(saveFcmRegistrationAttempt).mockResolvedValue(true);
    vi.mocked(clearFcmRegistrationAttempt).mockResolvedValue(undefined);
    vi.mocked(saveFcmOptOut).mockResolvedValue(true);
    vi.mocked(isFcmOptedOut).mockResolvedValue(false);
    vi.mocked(getFcmOptOutState).mockResolvedValue(null);
    vi.mocked(getFcmRegistrationAttempts).mockResolvedValue([]);
    vi.mocked(getFcmRuntimeAvailability).mockReturnValue({enabled: true});
    vi.mocked(isFcmRuntimeEnabled).mockReturnValue(true);
    vi.mocked(requestNotificationPermission).mockResolvedValue('authorized');
    vi.mocked(checkNotificationPermission).mockResolvedValue('authorized');
    vi.mocked(getDeviceType).mockReturnValue('IOS');
    vi.mocked(getOrCreateClientInstanceId).mockResolvedValue('faithlog-client-1');
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: null, tokenId: null, userId: null, clientInstanceId: null,
    });
  });

  it('respects persistent opt-out for automatic and token-refresh registration', async () => {
    vi.mocked(isFcmOptedOut).mockResolvedValue(true);
    vi.mocked(getFcmOptOutState).mockResolvedValue({
      clientInstanceId: 'faithlog-client-1', status: 'confirmed', tokenId: null,
    });

    await expect(registerCurrentFcmToken(
      'access-token', USER_ID, AUTH_GENERATION, 'automatic',
    )).resolves.toMatchObject({status: 'optedOut'});
    await expect(registerFcmTokenValue(
      'access-token', USER_ID, 'refreshed-device-token', AUTH_GENERATION,
    )).resolves.toBeNull();
    expect(requestNotificationPermission).not.toHaveBeenCalled();
    expect(registerMyFcmToken).not.toHaveBeenCalled();
  });

  it('routes the production automatic coordinator through persistent opt-out', async () => {
    vi.mocked(getFcmOptOutState).mockResolvedValue({
      clientInstanceId: 'faithlog-client-1', status: 'confirmed', tokenId: null,
    });
    await expect(ensureAutomaticFcmRegistration(
      'access-token', USER_ID, AUTH_GENERATION,
    )).resolves.toMatchObject({status: 'optedOut'});
    expect(registerMyFcmToken).not.toHaveBeenCalled();
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('does not auto-register after the Root operation becomes stale', async () => {
    await expect(ensureAutomaticFcmRegistration(
      'access-token', USER_ID, AUTH_GENERATION, () => false,
    )).resolves.toMatchObject({status: 'tokenUnavailable'});
    expect(requestNotificationPermission).not.toHaveBeenCalled();
    expect(registerMyFcmToken).not.toHaveBeenCalled();
  });

  it('waits for pending registration then deactivates its latest token after opt-out', async () => {
    let stored = {token: null, tokenId: null, userId: null, clientInstanceId: null} as Awaited<
      ReturnType<typeof getStoredFcmRegistration>
    >;
    let optedOut = false;
    let optOutState: Awaited<ReturnType<typeof getFcmOptOutState>> = null;
    let resolveRegistration!: (value: FcmTokenRegisterResponse) => void;
    vi.mocked(isFcmOptedOut).mockImplementation(async () => optedOut);
    vi.mocked(getFcmOptOutState).mockImplementation(async () => optOutState);
    vi.mocked(saveFcmOptOut).mockImplementation(async (_userId, clientInstanceId, _generation, state) => {
      optedOut = true;
      optOutState = {
        clientInstanceId,
        status: state?.status ?? 'pending',
        tokenId: state?.tokenId ?? null,
      };
      return true;
    });
    vi.mocked(getStoredFcmRegistration).mockImplementation(async () => stored);
    vi.mocked(saveFcmRegistration).mockImplementation(async (registration) => {
      stored = registration;
      return true;
    });
    vi.mocked(clearFcmRegistration).mockImplementation(async () => {
      stored = {token: null, tokenId: null, userId: null, clientInstanceId: null};
      return true;
    });
    vi.mocked(registerMyFcmToken).mockReturnValue(new Promise((resolve) => {
      resolveRegistration = resolve;
    }));

    const registration = registerFcmTokenValue(
      'access-token', USER_ID, 'pending-device-token', AUTH_GENERATION,
    );
    await vi.waitFor(() => expect(registerMyFcmToken).toHaveBeenCalledOnce());
    const deactivation = deactivateCurrentFcmToken(
      'access-token', USER_ID, AUTH_GENERATION,
    );
    expect(saveFcmOptOut).not.toHaveBeenCalled();
    expect(deactivateMyFcmToken).not.toHaveBeenCalled();

    resolveRegistration({
      appVersion: '0.1.0-test', clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS', isActive: true,
      lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 91,
    });
    await expect(registration).resolves.toMatchObject({tokenId: 91});
    await vi.waitFor(() => expect(saveFcmOptOut).toHaveBeenCalled());
    await expect(deactivation).resolves.toEqual({status: 'deactivated'});
    expect(deactivateMyFcmToken).toHaveBeenCalledWith(
      'access-token', 91, AUTH_GENERATION, expect.any(Function),
    );
    expect(vi.mocked(saveFcmRegistration).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deactivateMyFcmToken).mock.invocationCallOrder[0]!,
    );
    expect(stored.tokenId).toBeNull();
    expect(clearFcmOptOut).not.toHaveBeenCalled();
  });

  it('persists disable intent while an older registration POST is still pending', async () => {
    let finishRegistration!: (value: FcmTokenRegisterResponse) => void;
    vi.mocked(registerMyFcmToken).mockReturnValue(new Promise((resolve) => {
      finishRegistration = resolve;
    }));
    const registration = registerFcmTokenValue(
      'access-token', USER_ID, 'pending-token', AUTH_GENERATION,
    );
    await vi.waitFor(() => expect(registerMyFcmToken).toHaveBeenCalledOnce());
    const disable = deactivateCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION);
    await vi.waitFor(() => expect(saveFcmOptOut).toHaveBeenCalledWith(
      USER_ID, 'faithlog-client-1', AUTH_GENERATION,
      expect.objectContaining({status: 'pending'}),
    ));
    finishRegistration({
      appVersion: '0.1.0-test', clientInstanceId: 'faithlog-client-1', deviceType: 'IOS',
      isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 91,
    });
    await registration;
    await disable;
  });

  it('marks a known-token DELETE as server-capable until it settles', async () => {
    let resolveDelete!: () => void;
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'stored-token', tokenId: 77, userId: USER_ID,
      clientInstanceId: 'faithlog-client-1',
    });
    vi.mocked(deactivateMyFcmToken).mockReturnValue(new Promise((resolve) => {
      resolveDelete = () => resolve(null);
    }));
    const deactivation = deactivateCurrentFcmToken(
      'old-access', USER_ID, AUTH_GENERATION,
    );
    await vi.waitFor(() => expect(deactivateMyFcmToken).toHaveBeenCalledOnce());
    const captured = capturePendingFcmOperations();
    expect(captured.hasPendingOperations).toBe(true);
    resolveDelete();
    await deactivation;
    await expect(captured.settlement).resolves.toEqual([]);
  });

  it('marks attempt recovery POST as server-capable until cleanup settles', async () => {
    let resolveRecovery!: (value: FcmTokenRegisterResponse) => void;
    vi.mocked(getFcmRegistrationAttempts).mockResolvedValue([{
      userId: USER_ID, clientInstanceId: 'old-client', token: 'unknown-token',
    }]);
    vi.mocked(registerMyFcmToken).mockReturnValue(new Promise((resolve) => {
      resolveRecovery = resolve;
    }));
    const deactivation = deactivateCurrentFcmToken(
      'old-access', USER_ID, AUTH_GENERATION,
    );
    await vi.waitFor(() => expect(registerMyFcmToken).toHaveBeenCalledOnce());
    const captured = capturePendingFcmOperations();
    expect(captured.hasPendingOperations).toBe(true);
    resolveRecovery({
      appVersion: '0.1.0-test', clientInstanceId: 'old-client', deviceType: 'IOS',
      isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 91,
    });
    await deactivation;
    await expect(captured.settlement).resolves.toEqual([]);
  });

  it('compensates every distinct old-client registration before auth cleanup', async () => {
    vi.mocked(registerMyFcmTokenForCleanup)
      .mockResolvedValueOnce({
        appVersion: '0.1.0-test', clientInstanceId: 'old-A', deviceType: 'IOS',
        isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
        lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 101,
      })
      .mockResolvedValueOnce({
        appVersion: '0.1.0-test', clientInstanceId: 'old-B', deviceType: 'IOS',
        isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
        lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 102,
      });
    const obligations = [
      {
        accessToken: 'old-access', userId: USER_ID,
        clientInstanceId: 'old-A', kind: 'registration' as const,
        token: 'token-A', tokenId: null, state: 'mayHaveSent' as const,
      },
      {
        accessToken: 'old-access', userId: USER_ID,
        clientInstanceId: 'old-B', kind: 'registration' as const,
        token: 'token-B', tokenId: null, state: 'mayHaveSent' as const,
      },
    ];

    await compensateCapturedFcmOperations(obligations);
    expect(registerMyFcmTokenForCleanup).toHaveBeenNthCalledWith(
      1, 'old-access', expect.objectContaining({clientInstanceId: 'old-A', token: 'token-A'}),
    );
    expect(registerMyFcmTokenForCleanup).toHaveBeenNthCalledWith(
      2, 'old-access', expect.objectContaining({clientInstanceId: 'old-B', token: 'token-B'}),
    );
    expect(deactivateMyFcmTokenForCleanup).toHaveBeenNthCalledWith(1, 'old-access', 101);
    expect(deactivateMyFcmTokenForCleanup).toHaveBeenNthCalledWith(2, 'old-access', 102);
    expect(obligations.every((obligation) => String(obligation.state) === 'cleaned')).toBe(true);
  });

  it('refreshes an expired cleanup credential and durably schedules its rotated session logout', async () => {
    vi.mocked(registerMyFcmTokenForCleanup)
      .mockRejectedValueOnce(new FaithLogApiError({
        kind: 'sessionExpired', status: 401, message: 'expired',
      } as never))
      .mockResolvedValueOnce({
        appVersion: '0.1.0-test', clientInstanceId: 'old-client', deviceType: 'IOS',
        isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
        lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 101,
      });
    const obligations = [{
      accessToken: 'expired-access', refreshToken: 'old-refresh', userId: USER_ID,
      clientInstanceId: 'old-client', kind: 'registration' as const,
      token: 'old-token', tokenId: null, state: 'mayHaveSent' as const,
    }];

    await compensateCapturedFcmOperations(obligations);
    expect(refreshAuthTokenForCleanup).toHaveBeenCalledWith('old-refresh');
    expect(registerMyFcmTokenForCleanup).toHaveBeenLastCalledWith(
      'cleanup-access-token', expect.objectContaining({token: 'old-token'}),
    );
    expect(deactivateMyFcmTokenForCleanup).toHaveBeenCalledWith(
      'cleanup-access-token', 101,
    );
    expect(vi.mocked(markFcmRemoteCleanupPending)).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({kind: 'clientLogout'})]),
    );
    expect(logoutUser).toHaveBeenCalledWith('cleanup-access-token', {
      refreshToken: 'cleanup-refresh-token', clientInstanceId: 'old-client',
    });
  });

  it('refreshes an expired client logout and sends the rotated logout exactly once', async () => {
    vi.mocked(logoutUser)
      .mockRejectedValueOnce(new FaithLogApiError({
        kind: 'sessionExpired', status: 401, message: 'expired',
      } as never))
      .mockResolvedValueOnce(null);
    const obligation = {
      accessToken: 'expired-access', refreshToken: 'old-refresh', userId: null,
      clientInstanceId: null, kind: 'clientLogout' as const,
      token: null, tokenId: null, state: 'mayHaveSent' as const,
    };

    await expect(compensateCapturedFcmOperations([obligation])).resolves.toEqual([obligation]);
    expect(refreshAuthTokenForCleanup).toHaveBeenCalledOnce();
    expect(logoutUser).toHaveBeenCalledTimes(2);
    expect(logoutUser).toHaveBeenLastCalledWith('cleanup-access-token', {
      refreshToken: 'cleanup-refresh-token',
    });
  });

  it('retries known-token remote deactivation after restart before confirming opt-out', async () => {
    let optOutState: NonNullable<Awaited<ReturnType<typeof getFcmOptOutState>>> = {
      clientInstanceId: 'faithlog-client-1', status: 'pending' as const, tokenId: 77,
    };
    vi.mocked(getFcmOptOutState).mockImplementation(async () => optOutState);
    vi.mocked(isFcmOptedOut).mockResolvedValue(true);
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'stored-token', tokenId: 77, userId: USER_ID,
      clientInstanceId: 'faithlog-client-1',
    });
    vi.mocked(saveFcmOptOut).mockImplementation(async (_userId, clientInstanceId, _generation, state) => {
      optOutState = {
        clientInstanceId,
        status: state?.status ?? 'pending',
        tokenId: state?.tokenId ?? null,
      };
      return true;
    });
    vi.mocked(deactivateMyFcmToken)
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(null);

    await expect(inspectFcmRegistrationStatus(
      USER_ID, AUTH_GENERATION,
    )).resolves.toMatchObject({status: 'optedOutPending'});
    await expect(inspectFcmRegistrationStatusWithCleanup(
      'access-token', USER_ID, AUTH_GENERATION,
    )).resolves.toMatchObject({status: 'optedOutPending'});
    expect(deactivateMyFcmToken).toHaveBeenCalledTimes(1);
    expect(optOutState.status).toBe('pending');

    await expect(ensureAutomaticFcmRegistration(
      'access-token', USER_ID, AUTH_GENERATION,
    )).resolves.toMatchObject({status: 'optedOut'});
    expect(deactivateMyFcmToken).toHaveBeenCalledTimes(2);
    expect(optOutState.status).toBe('confirmed');
  });

  it('keeps outcome-unknown registration pending until re-register and DELETE confirm cleanup', async () => {
    let attempts: Awaited<ReturnType<typeof getFcmRegistrationAttempts>> = [];
    let optOutState: Awaited<ReturnType<typeof getFcmOptOutState>> = null;
    let resolveRecovery!: (value: FcmTokenRegisterResponse) => void;
    vi.mocked(saveFcmRegistrationAttempt).mockImplementation(async (nextAttempt) => {
      attempts = [...attempts.filter((attempt) =>
        attempt.userId !== nextAttempt.userId ||
        attempt.clientInstanceId !== nextAttempt.clientInstanceId ||
        attempt.token !== nextAttempt.token), nextAttempt];
      return true;
    });
    vi.mocked(getFcmRegistrationAttempts).mockImplementation(async () => attempts);
    vi.mocked(clearFcmRegistrationAttempt).mockImplementation(async (cleared) => {
      attempts = attempts.filter((attempt) =>
        attempt.userId !== cleared.userId ||
        attempt.clientInstanceId !== cleared.clientInstanceId ||
        attempt.token !== cleared.token);
    });
    vi.mocked(getFcmOptOutState).mockImplementation(async () => optOutState);
    vi.mocked(saveFcmOptOut).mockImplementation(async (_userId, clientInstanceId, _generation, state) => {
      optOutState = {
        clientInstanceId,
        status: state?.status ?? 'pending',
        tokenId: state?.tokenId ?? null,
      };
      return true;
    });
    vi.mocked(registerMyFcmToken)
      .mockRejectedValueOnce(new TypeError('response timed out after server commit'))
      .mockReturnValueOnce(new Promise((resolve) => { resolveRecovery = resolve; }));

    await expect(registerFcmTokenValue(
      'access-token', USER_ID, 'outcome-unknown-token', AUTH_GENERATION,
    )).rejects.toThrow('response timed out');
    expect(attempts).toContainEqual(expect.objectContaining({
      token: 'outcome-unknown-token', userId: USER_ID,
    }));

    const deactivation = deactivateCurrentFcmToken(
      'access-token', USER_ID, AUTH_GENERATION,
    );
    await vi.waitFor(() => expect(registerMyFcmToken).toHaveBeenCalledTimes(2));
    expect(optOutState).toEqual(expect.objectContaining({status: 'pending'}));
    expect(deactivateMyFcmToken).not.toHaveBeenCalled();
    resolveRecovery({
      appVersion: '0.1.0-test', clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS', isActive: true,
      lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 92,
    });
    await expect(deactivation).resolves.toEqual({status: 'deactivated'});
    expect(deactivateMyFcmToken).toHaveBeenCalledWith(
      'access-token', 92, AUTH_GENERATION, expect.any(Function),
    );
    expect(optOutState).toEqual(expect.objectContaining({status: 'confirmed'}));
    expect(attempts).toEqual([]);
  });

  it('cleans stored T2 and unresolved T1 before confirming opt-out', async () => {
    const firstAttempt = {
      userId: USER_ID, clientInstanceId: 'faithlog-client-1', token: 'token-T1',
    };
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'token-T2', tokenId: 202, userId: USER_ID,
      clientInstanceId: 'faithlog-client-1',
    });
    vi.mocked(getFcmRegistrationAttempts).mockResolvedValue([firstAttempt]);
    vi.mocked(registerMyFcmToken).mockResolvedValue({
      appVersion: '0.1.0-test', clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS', isActive: true,
      lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 101,
    });

    await expect(deactivateCurrentFcmToken(
      'access-token', USER_ID, AUTH_GENERATION,
    )).resolves.toEqual({status: 'deactivated'});
    expect(deactivateMyFcmToken).toHaveBeenNthCalledWith(
      1, 'access-token', 202, AUTH_GENERATION, expect.any(Function),
    );
    expect(deactivateMyFcmToken).toHaveBeenNthCalledWith(
      2, 'access-token', 101, AUTH_GENERATION, expect.any(Function),
    );
    expect(clearFcmRegistrationAttempt).toHaveBeenCalledWith(
      firstAttempt, AUTH_GENERATION,
    );
    expect(saveFcmOptOut).toHaveBeenLastCalledWith(
      USER_ID, 'faithlog-client-1', AUTH_GENERATION, {status: 'confirmed'},
    );
  });

  it('fails closed when privacy state is corrupt', async () => {
    vi.mocked(getFcmOptOutState).mockRejectedValue(
      new CorruptFcmPrivacyStateError('optOut'),
    );
    await expect(registerCurrentFcmToken(
      'access-token', USER_ID, AUTH_GENERATION, 'automatic',
    )).resolves.toMatchObject({status: 'optedOutPending'});
    expect(registerMyFcmToken).not.toHaveBeenCalled();
    expect(saveFcmOptOut).not.toHaveBeenCalledWith(
      USER_ID, expect.anything(), AUTH_GENERATION, {status: 'confirmed'},
    );
  });

  it('never confirms opt-out when unresolved-attempt storage is corrupt', async () => {
    vi.mocked(getFcmRegistrationAttempts).mockRejectedValue(
      new CorruptFcmPrivacyStateError('registrationAttempts'),
    );
    await expect(deactivateCurrentFcmToken(
      'access-token', USER_ID, AUTH_GENERATION,
    )).rejects.toThrow('corrupt');
    expect(registerMyFcmToken).not.toHaveBeenCalled();
    expect(deactivateMyFcmToken).not.toHaveBeenCalled();
    expect(saveFcmOptOut).not.toHaveBeenCalledWith(
      USER_ID, expect.anything(), AUTH_GENERATION, {status: 'confirmed'},
    );
  });

  it('does not persist an unsent attempt when closing wins the opt-out read', async () => {
    let resolveOptOut!: (value: boolean) => void;
    let requestAllowed = true;
    vi.mocked(isAuthSessionRequestAllowed).mockImplementation(() => requestAllowed);
    vi.mocked(isFcmOptedOut).mockReturnValue(new Promise((resolve) => {
      resolveOptOut = resolve;
    }));
    const registration = registerFcmTokenValue(
      'access-token', USER_ID, 'closing-token', AUTH_GENERATION,
    );
    await vi.waitFor(() => expect(isFcmOptedOut).toHaveBeenCalledOnce());
    requestAllowed = false;
    resolveOptOut(false);

    await expect(registration).rejects.toThrow('로그인 계정이 변경');
    expect(saveFcmRegistrationAttempt).not.toHaveBeenCalled();
    expect(registerMyFcmToken).not.toHaveBeenCalled();
  });

  it('serializes manual enable intent after an older pending deactivation', async () => {
    let resolveDeactivation!: () => void;
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'stored-token', tokenId: 77, userId: USER_ID,
      clientInstanceId: 'faithlog-client-1',
    });
    vi.mocked(getFcmOptOutState).mockResolvedValue({
      clientInstanceId: 'faithlog-client-1', status: 'pending', tokenId: 77,
    });
    vi.mocked(deactivateMyFcmToken).mockReturnValue(new Promise((resolve) => {
      resolveDeactivation = () => resolve(null);
    }));
    vi.mocked(getDeviceFcmToken).mockResolvedValue({
      status: 'unavailable', reason: 'permissionUnavailable', message: 'token unavailable',
    });

    const deactivation = deactivateCurrentFcmToken(
      'access-token', USER_ID, AUTH_GENERATION,
    );
    await vi.waitFor(() => expect(deactivateMyFcmToken).toHaveBeenCalledOnce());
    const enable = registerCurrentFcmToken(
      'access-token', USER_ID, AUTH_GENERATION, 'user',
    );
    await Promise.resolve();
    await vi.waitFor(() => expect(clearFcmOptOut).toHaveBeenCalledOnce());
    resolveDeactivation();
    await expect(deactivation).rejects.toThrow('알림 설정이 변경');
    await enable;
    expect(saveFcmOptOut).not.toHaveBeenCalledWith(
      USER_ID, expect.anything(), AUTH_GENERATION, {status: 'confirmed'},
    );
  });

  it('ignores stale inspect cleanup after a newer manual enable intent', async () => {
    let resolveInspectOptOut!: (value: Awaited<ReturnType<typeof getFcmOptOutState>>) => void;
    let optOutState: Awaited<ReturnType<typeof getFcmOptOutState>> = {
      clientInstanceId: 'faithlog-client-1', status: 'pending', tokenId: 77,
    };
    vi.mocked(getFcmOptOutState)
      .mockReturnValueOnce(new Promise((resolve) => { resolveInspectOptOut = resolve; }))
      .mockImplementation(async () => optOutState);
    vi.mocked(clearFcmOptOut).mockImplementation(async () => { optOutState = null; });
    vi.mocked(getDeviceFcmToken).mockResolvedValue({
      status: 'available', token: 'enabled-device-token',
    });
    vi.mocked(registerMyFcmToken).mockResolvedValue({
      appVersion: '0.1.0-test', clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS', isActive: true,
      lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 303,
    });

    const staleInspect = inspectFcmRegistrationStatusWithCleanup(
      'access-token', USER_ID, AUTH_GENERATION,
    );
    const enable = registerCurrentFcmToken(
      'access-token', USER_ID, AUTH_GENERATION, 'user',
    );
    await vi.waitFor(() => expect(clearFcmOptOut).toHaveBeenCalledOnce());
    resolveInspectOptOut({
      clientInstanceId: 'faithlog-client-1', status: 'pending', tokenId: 77,
    });

    await expect(enable).resolves.toMatchObject({status: 'registered'});
    await staleInspect;
    expect(deactivateMyFcmToken).not.toHaveBeenCalled();
    expect(optOutState).toBeNull();
    expect(registerMyFcmToken).toHaveBeenCalledOnce();
  });

  it('reserves the whole disable before a newer enable can enter the queue', async () => {
    let releaseDisableClient!: () => void;
    const delayedClient = new Promise<string>((resolve) => {
      releaseDisableClient = () => resolve('faithlog-client-1');
    });
    vi.mocked(getOrCreateClientInstanceId)
      .mockReturnValueOnce(delayedClient)
      .mockResolvedValue('faithlog-client-1');
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'old-token', tokenId: 77, userId: USER_ID,
      clientInstanceId: 'faithlog-client-1',
    });
    vi.mocked(getDeviceFcmToken).mockResolvedValue({status: 'available', token: 'new-token'});
    vi.mocked(registerMyFcmToken).mockResolvedValue({
      appVersion: '0.1.0-test', clientInstanceId: 'faithlog-client-1', deviceType: 'IOS',
      isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 88,
    });

    const disable = deactivateCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION);
    await vi.waitFor(() => expect(getOrCreateClientInstanceId).toHaveBeenCalledOnce());
    const enable = registerCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION, 'user');
    expect(registerMyFcmToken).not.toHaveBeenCalled();
    expect(deactivateMyFcmToken).not.toHaveBeenCalled();
    releaseDisableClient();
    await expect(disable).rejects.toThrow('알림 설정이 변경');
    await enable;

    expect(saveFcmOptOut).not.toHaveBeenCalled();
    expect(registerMyFcmToken).toHaveBeenCalledWith(
      'access-token', expect.objectContaining({token: 'new-token'}), AUTH_GENERATION,
      expect.any(Function),
    );
    expect(deactivateMyFcmToken).toHaveBeenCalledWith(
      'access-token', 77, AUTH_GENERATION, expect.any(Function),
    );
    expect(vi.mocked(registerMyFcmToken).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deactivateMyFcmToken).mock.invocationCallOrder[0]!,
    );
    expect(vi.mocked(clearFcmOptOut).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(registerMyFcmToken).mock.invocationCallOrder[0]!,
    );
  });

  it('cancels an old disable after its internal await when a newer enable wins', async () => {
    let releaseInternalPendingWrite!: () => void;
    let saveCalls = 0;
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'old-token', tokenId: 77, userId: USER_ID,
      clientInstanceId: 'faithlog-client-1',
    });
    vi.mocked(saveFcmOptOut).mockImplementation(async () => {
      saveCalls += 1;
      if (saveCalls === 2) {
        await new Promise<void>((resolve) => { releaseInternalPendingWrite = resolve; });
      }
      return true;
    });
    vi.mocked(getDeviceFcmToken).mockResolvedValue({
      status: 'unavailable', reason: 'permissionUnavailable', message: 'token unavailable',
    });

    const disable = deactivateCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION);
    await vi.waitFor(() => expect(saveCalls).toBe(2));
    const enable = registerCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION, 'user');
    await vi.waitFor(() => expect(clearFcmOptOut).toHaveBeenCalledOnce());
    releaseInternalPendingWrite();
    await expect(disable).rejects.toThrow('알림 설정이 변경');
    await enable;
    expect(deactivateMyFcmToken).not.toHaveBeenCalled();
    expect(saveFcmOptOut).not.toHaveBeenCalledWith(
      USER_ID, expect.anything(), AUTH_GENERATION, {status: 'confirmed'},
    );
  });

  it('re-registers after an old disable DELETE succeeds behind a newer enable intent', async () => {
    let stored = {
      token: 'same-token', tokenId: 77, userId: USER_ID,
      clientInstanceId: 'faithlog-client-1',
    } as Awaited<ReturnType<typeof getStoredFcmRegistration>>;
    let finishDelete!: () => void;
    vi.mocked(getStoredFcmRegistration).mockImplementation(async () => stored);
    vi.mocked(clearFcmRegistration).mockImplementation(async () => {
      stored = {token: null, tokenId: null, userId: null, clientInstanceId: null};
      return true;
    });
    vi.mocked(saveFcmRegistration).mockImplementation(async (registration) => {
      stored = registration;
      return true;
    });
    vi.mocked(deactivateMyFcmToken).mockReturnValue(new Promise((resolve) => {
      finishDelete = () => resolve(null);
    }));
    vi.mocked(getDeviceFcmToken).mockResolvedValue({status: 'available', token: 'same-token'});
    vi.mocked(registerMyFcmToken).mockResolvedValue({
      appVersion: '0.1.0-test', clientInstanceId: 'faithlog-client-1', deviceType: 'IOS',
      isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 88,
    });

    const disable = deactivateCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION);
    await vi.waitFor(() => expect(deactivateMyFcmToken).toHaveBeenCalledOnce());
    const enable = registerCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION, 'user');
    await vi.waitFor(() => expect(clearFcmOptOut).toHaveBeenCalledOnce());
    finishDelete();
    await expect(disable).rejects.toThrow('알림 설정이 변경');
    await expect(enable).resolves.toMatchObject({status: 'registered'});
    expect(registerMyFcmToken).toHaveBeenCalledWith(
      'access-token', expect.objectContaining({token: 'same-token'}), AUTH_GENERATION,
      expect.any(Function),
    );
    expect(stored).toMatchObject({token: 'same-token', tokenId: 88});
  });

  it('compensates a stale recovery POST before a newer enable re-registers', async () => {
    const attempt = {userId: USER_ID, clientInstanceId: 'old-client', token: 'same-token'};
    let finishRecovery!: (value: FcmTokenRegisterResponse) => void;
    vi.mocked(getFcmRegistrationAttempts).mockResolvedValue([attempt]);
    vi.mocked(getDeviceFcmToken).mockResolvedValue({status: 'available', token: 'same-token'});
    vi.mocked(registerMyFcmToken)
      .mockReturnValueOnce(new Promise((resolve) => { finishRecovery = resolve; }))
      .mockResolvedValueOnce({
        appVersion: '0.1.0-test', clientInstanceId: 'faithlog-client-1', deviceType: 'IOS',
        isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
        lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 202,
      });

    const disable = deactivateCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION);
    await vi.waitFor(() => expect(registerMyFcmToken).toHaveBeenCalledOnce());
    const enable = registerCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION, 'user');
    await vi.waitFor(() => expect(clearFcmOptOut).toHaveBeenCalledOnce());
    finishRecovery({
      appVersion: '0.1.0-test', clientInstanceId: 'old-client', deviceType: 'IOS',
      isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 101,
    });

    await expect(disable).rejects.toThrow('알림 설정이 변경');
    await expect(enable).resolves.toMatchObject({status: 'registered'});
    expect(deactivateMyFcmToken).toHaveBeenCalledWith(
      'access-token', 101, AUTH_GENERATION, expect.any(Function),
    );
    expect(registerMyFcmToken).toHaveBeenCalledTimes(2);
    expect(saveFcmOptOut).not.toHaveBeenCalledWith(
      USER_ID, expect.anything(), AUTH_GENERATION, {status: 'confirmed'},
    );
  });

  it('durably upserts obligations added after capture before their network send', async () => {
    const attempts = [
      {userId: USER_ID, clientInstanceId: 'old-A', token: 'token-A'},
      {userId: USER_ID, clientInstanceId: 'old-B', token: 'token-B'},
    ];
    let resolveFirst!: (value: FcmTokenRegisterResponse) => void;
    vi.mocked(getFcmRegistrationAttempts).mockResolvedValue(attempts);
    vi.mocked(registerMyFcmToken)
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({
        appVersion: '0.1.0-test', clientInstanceId: 'old-B', deviceType: 'IOS',
        isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
        lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 102,
      });
    const disable = deactivateCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION);
    await vi.waitFor(() => expect(registerMyFcmToken).toHaveBeenCalledOnce());
    capturePendingFcmOperations(AUTH_GENERATION);
    resolveFirst({
      appVersion: '0.1.0-test', clientInstanceId: 'old-A', deviceType: 'IOS',
      isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 101,
    });
    await vi.waitFor(() => expect(registerMyFcmToken).toHaveBeenCalledTimes(2));
    const secondPersist = vi.mocked(markFcmRemoteCleanupPending).mock.calls.findIndex(
      ([items]) => Array.isArray(items) && items.some((item) => item.token === 'token-B'),
    );
    expect(secondPersist).toBeGreaterThanOrEqual(0);
    expect(vi.mocked(markFcmRemoteCleanupPending).mock.invocationCallOrder[secondPersist]).toBeLessThan(
      vi.mocked(registerMyFcmToken).mock.invocationCallOrder[1]!,
    );
    await disable;
  });

  it('updates captured obligations with transparent refresh credentials before retry', async () => {
    let finish!: (value: FcmTokenRegisterResponse) => void;
    vi.mocked(registerMyFcmToken).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const registration = registerFcmTokenValue(
      'access-token', USER_ID, 'refreshing-token', AUTH_GENERATION,
    );
    await vi.waitFor(() => expect(registerMyFcmToken).toHaveBeenCalledOnce());
    capturePendingFcmOperations(AUTH_GENERATION);
    const effectiveTokens = vi.mocked(registerMyFcmToken).mock.calls[0]?.[3];
    await effectiveTokens?.({accessToken: 'rotated-A2', refreshToken: 'rotated-R2'});
    expect(markFcmRemoteCleanupPending).toHaveBeenCalledWith([
      expect.objectContaining({
        accessToken: 'rotated-A2', refreshToken: 'rotated-R2', token: 'refreshing-token',
      }),
    ]);
    finish({
      appVersion: '0.1.0-test', clientInstanceId: 'faithlog-client-1', deviceType: 'IOS',
      isActive: true, lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 103,
    });
    await registration;
  });

  it('keeps the existing server registration when the current device token is unchanged', async () => {
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'same-device-token',
      tokenId: 77,
      userId: USER_ID,
      clientInstanceId: 'faithlog-client-1',
    });
    vi.mocked(getDeviceFcmToken).mockResolvedValue({
      status: 'available',
      token: 'same-device-token',
    });

    await expect(
      registerCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION),
    ).resolves.toEqual({
      status: 'registeredLocal',
      permission: 'authorized',
      tokenId: 77,
    });

    expect(registerMyFcmToken).not.toHaveBeenCalled();
    expect(saveFcmRegistration).not.toHaveBeenCalled();
    expect(deactivateMyFcmToken).not.toHaveBeenCalled();
  });

  it('re-registers an unchanged token when its stored client instance was retired', async () => {
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'same-device-token',
      tokenId: 77,
      userId: USER_ID,
      clientInstanceId: 'retired-client-instance',
    });
    vi.mocked(getDeviceFcmToken).mockResolvedValue({
      status: 'available',
      token: 'same-device-token',
    });
    vi.mocked(registerMyFcmToken).mockResolvedValue({
      appVersion: '0.1.0-test',
      clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS',
      isActive: true,
      lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z',
      tokenId: 88,
    });

    await expect(
      registerCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION),
    ).resolves.toMatchObject({
      status: 'registered',
      registration: {tokenId: 88},
    });

    expect(registerMyFcmToken).toHaveBeenCalledOnce();
    expect(saveFcmRegistration).toHaveBeenCalledWith(
      {
        token: 'same-device-token',
        tokenId: 88,
        userId: USER_ID,
        clientInstanceId: 'faithlog-client-1',
      },
      AUTH_GENERATION,
    );
  });

  it('registers the current device token when the stored token is stale', async () => {
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'old-device-token',
      tokenId: 77,
      userId: USER_ID,
      clientInstanceId: 'faithlog-client-1',
    });
    vi.mocked(getDeviceFcmToken).mockResolvedValue({
      status: 'available',
      token: 'new-device-token',
    });
    vi.mocked(registerMyFcmToken).mockResolvedValue({
      appVersion: '0.1.0-test',
      clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS',
      isActive: true,
      lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z',
      tokenId: 88,
    });

    await expect(
      registerCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION),
    ).resolves.toMatchObject({
      status: 'registered',
      permission: 'authorized',
      registration: {
        tokenId: 88,
        deviceType: 'IOS',
      },
    });

    expect(registerMyFcmToken).toHaveBeenCalledWith(
      'access-token',
      {
        appVersion: '0.1.0-test',
        clientInstanceId: 'faithlog-client-1',
        deviceType: 'IOS',
        token: 'new-device-token',
      },
      AUTH_GENERATION,
      expect.any(Function),
    );
    expect(saveFcmRegistration).toHaveBeenCalledWith(
      {
        token: 'new-device-token',
        tokenId: 88,
        userId: USER_ID,
        clientInstanceId: 'faithlog-client-1',
      },
      AUTH_GENERATION,
    );
    expect(deactivateMyFcmToken).toHaveBeenCalledWith(
      'access-token',
      77,
      AUTH_GENERATION,
      expect.any(Function),
    );
  });

  it('does not deactivate the previous token when the server refreshes the same token id', async () => {
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'old-device-token',
      tokenId: 77,
      userId: USER_ID,
      clientInstanceId: 'faithlog-client-1',
    });
    vi.mocked(getDeviceFcmToken).mockResolvedValue({
      status: 'available',
      token: 'new-device-token',
    });
    vi.mocked(registerMyFcmToken).mockResolvedValue({
      appVersion: '0.1.0-test',
      clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS',
      isActive: true,
      lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z',
      tokenId: 77,
    });

    await expect(
      registerCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION),
    ).resolves.toMatchObject({
      status: 'registered',
      registration: {
        tokenId: 77,
      },
    });

    expect(deactivateMyFcmToken).not.toHaveBeenCalled();
  });

  it('does not deactivate a token registration owned by another user', async () => {
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'previous-user-token',
      tokenId: 77,
      userId: 41,
      clientInstanceId: 'faithlog-client-1',
    });
    vi.mocked(getDeviceFcmToken).mockResolvedValue({
      status: 'available',
      token: 'current-user-token',
    });
    vi.mocked(registerMyFcmToken).mockResolvedValue({
      appVersion: '0.1.0-test',
      clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS',
      isActive: true,
      lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z',
      tokenId: 88,
    });

    await expect(
      registerCurrentFcmToken('access-token', USER_ID, AUTH_GENERATION),
    ).resolves.toMatchObject({status: 'registered'});

    expect(saveFcmRegistration).toHaveBeenCalledWith(
      {
        token: 'current-user-token',
        tokenId: 88,
        userId: USER_ID,
        clientInstanceId: 'faithlog-client-1',
      },
      AUTH_GENERATION,
    );
    expect(deactivateMyFcmToken).not.toHaveBeenCalled();
  });

  it('discards a delayed server registration after the auth session changes', async () => {
    let resolveRegistration!: (value: FcmTokenRegisterResponse) => void;
    const serverResponse = new Promise<FcmTokenRegisterResponse>((resolve) => {
      resolveRegistration = resolve;
    });
    let current = true;
    vi.mocked(isAuthSessionGenerationCurrent).mockImplementation(() => current);
    vi.mocked(registerMyFcmToken).mockReturnValue(serverResponse);

    const pending = registerFcmTokenValue(
      'access-token',
      USER_ID,
      'delayed-device-token',
      AUTH_GENERATION,
    );
    await vi.waitFor(() => expect(registerMyFcmToken).toHaveBeenCalledOnce());
    expect(capturePendingFcmOperations((AUTH_GENERATION + 1) as AuthSessionGeneration))
      .toMatchObject({hasPendingOperations: false});
    const capturedOperations = capturePendingFcmOperations();
    const logoutBarrier = capturedOperations.barrier;
    let barrierResolved = false;
    void logoutBarrier.then(() => {
      barrierResolved = true;
    });
    await Promise.resolve();
    expect(barrierResolved).toBe(false);
    current = false;
    resolveRegistration({
      appVersion: '0.1.0-test',
      clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS',
      isActive: true,
      lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z',
      tokenId: 99,
    });

    await expect(pending).rejects.toThrow('로그인 계정이 변경');
    await expect(logoutBarrier).resolves.toBeUndefined();
    expect(barrierResolved).toBe(true);
    expect(saveFcmRegistration).not.toHaveBeenCalled();
    await expect(capturedOperations.settlement).resolves.toEqual([
      expect.objectContaining({
        accessToken: 'access-token', clientInstanceId: 'faithlog-client-1',
        kind: 'registration', token: 'delayed-device-token', tokenId: 99,
      }),
    ]);
  });

  it('serializes token registrations so a newer refresh cannot finish first', async () => {
    let resolveFirst!: (value: FcmTokenRegisterResponse) => void;
    let resolveSecond!: (value: FcmTokenRegisterResponse) => void;
    const firstResponse = new Promise<FcmTokenRegisterResponse>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise<FcmTokenRegisterResponse>((resolve) => {
      resolveSecond = resolve;
    });
    vi.mocked(registerMyFcmToken)
      .mockReturnValueOnce(firstResponse)
      .mockReturnValueOnce(secondResponse);

    const first = registerFcmTokenValue(
      'access-token',
      USER_ID,
      'older-device-token',
      AUTH_GENERATION,
    );
    const second = registerFcmTokenValue(
      'access-token',
      USER_ID,
      'newer-device-token',
      AUTH_GENERATION,
    );

    await vi.waitFor(() => expect(registerMyFcmToken).toHaveBeenCalledOnce());
    resolveFirst({
      appVersion: '0.1.0-test',
      clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS',
      isActive: true,
      lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z',
      tokenId: 77,
    });

    await vi.waitFor(() => expect(registerMyFcmToken).toHaveBeenCalledTimes(2));
    resolveSecond({
      appVersion: '0.1.0-test',
      clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS',
      isActive: true,
      lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z',
      tokenId: 88,
    });

    await expect(first).resolves.toMatchObject({tokenId: 77});
    await expect(second).resolves.toMatchObject({tokenId: 88});
    expect(saveFcmRegistration).toHaveBeenNthCalledWith(
      1,
      {
        token: 'older-device-token',
        tokenId: 77,
        userId: USER_ID,
        clientInstanceId: 'faithlog-client-1',
      },
      AUTH_GENERATION,
    );
    expect(saveFcmRegistration).toHaveBeenNthCalledWith(
      2,
      {
        token: 'newer-device-token',
        tokenId: 88,
        userId: USER_ID,
        clientInstanceId: 'faithlog-client-1',
      },
      AUTH_GENERATION,
    );
  });

  it('continues the registration queue after an earlier request fails', async () => {
    const registrationError = new Error('temporary registration failure');
    vi.mocked(registerMyFcmToken)
      .mockRejectedValueOnce(registrationError)
      .mockResolvedValueOnce({
        appVersion: '0.1.0-test',
        clientInstanceId: 'faithlog-client-1',
        deviceType: 'IOS',
        isActive: true,
        lastRefreshedAt: '2026-07-03T00:00:00.000Z',
        lastSeenAt: '2026-07-03T00:00:00.000Z',
        tokenId: 88,
      });

    const failed = registerFcmTokenValue(
      'access-token',
      USER_ID,
      'failed-device-token',
      AUTH_GENERATION,
    );
    const recovered = registerFcmTokenValue(
      'access-token',
      USER_ID,
      'recovered-device-token',
      AUTH_GENERATION,
    );
    const logoutBarrier = capturePendingFcmRegistrationBarrier();

    await expect(failed).rejects.toBe(registrationError);
    await expect(recovered).resolves.toMatchObject({tokenId: 88});
    await expect(logoutBarrier).resolves.toBeUndefined();
    expect(registerMyFcmToken).toHaveBeenCalledTimes(2);
    expect(saveFcmRegistration).toHaveBeenCalledOnce();
    expect(saveFcmRegistration).toHaveBeenCalledWith(
      {
        token: 'recovered-device-token',
        tokenId: 88,
        userId: USER_ID,
        clientInstanceId: 'faithlog-client-1',
      },
      AUTH_GENERATION,
    );
  });
});
