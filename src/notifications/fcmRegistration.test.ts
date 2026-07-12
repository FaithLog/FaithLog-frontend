import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => ({
  deactivateMyFcmToken: vi.fn(),
  FaithLogApiError: class FaithLogApiError extends Error {
    readonly detail: unknown;

    constructor(detail: {message: string}) {
      super(detail.message);
      this.detail = detail;
    }
  },
  registerMyFcmToken: vi.fn(),
}));

vi.mock('../api/tokenStorage', () => ({
  clearFcmRegistration: vi.fn(),
  clearFcmRegistrationAttempt: vi.fn(),
  clearFcmOptOut: vi.fn(),
  getAuthSessionGeneration: vi.fn(),
  getOrCreateClientInstanceId: vi.fn(),
  getFcmOptOutState: vi.fn(),
  getFcmRegistrationAttempt: vi.fn(),
  getStoredFcmRegistration: vi.fn(),
  isFcmOptedOut: vi.fn(),
  isAuthSessionGenerationCurrent: vi.fn(),
  isAuthSessionRequestAllowed: vi.fn(),
  saveFcmRegistration: vi.fn(),
  saveFcmRegistrationAttempt: vi.fn(),
  saveFcmOptOut: vi.fn(),
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

import {deactivateMyFcmToken, registerMyFcmToken} from '../api/client';
import type {FcmTokenRegisterResponse} from '../api/types';
import {
  getAuthSessionGeneration,
  clearFcmRegistration,
  clearFcmOptOut,
  clearFcmRegistrationAttempt,
  getOrCreateClientInstanceId,
  getFcmOptOutState,
  getFcmRegistrationAttempt,
  getStoredFcmRegistration,
  isFcmOptedOut,
  isAuthSessionGenerationCurrent,
  isAuthSessionRequestAllowed,
  saveFcmRegistration,
  saveFcmRegistrationAttempt,
  saveFcmOptOut,
  type AuthSessionGeneration,
} from '../api/tokenStorage';
import {getFcmRuntimeAvailability, isFcmRuntimeEnabled} from './fcmEnvironment';
import {
  capturePendingFcmRegistrationBarrier,
  capturePendingFcmOperations,
  deactivateCurrentFcmToken,
  ensureAutomaticFcmRegistration,
  inspectFcmRegistrationStatus,
  inspectFcmRegistrationStatusWithCleanup,
  registerCurrentFcmToken,
  registerFcmTokenValue,
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
    vi.clearAllMocks();
    vi.mocked(getAuthSessionGeneration).mockReturnValue(AUTH_GENERATION);
    vi.mocked(isAuthSessionGenerationCurrent).mockReturnValue(true);
    vi.mocked(isAuthSessionRequestAllowed).mockReturnValue(true);
    vi.mocked(saveFcmRegistration).mockResolvedValue(true);
    vi.mocked(saveFcmRegistrationAttempt).mockResolvedValue(true);
    vi.mocked(clearFcmRegistrationAttempt).mockResolvedValue(undefined);
    vi.mocked(saveFcmOptOut).mockResolvedValue(true);
    vi.mocked(isFcmOptedOut).mockResolvedValue(false);
    vi.mocked(getFcmOptOutState).mockResolvedValue(null);
    vi.mocked(getFcmRegistrationAttempt).mockResolvedValue(null);
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
    await vi.waitFor(() => expect(saveFcmOptOut).toHaveBeenCalledOnce());
    expect(deactivateMyFcmToken).not.toHaveBeenCalled();

    resolveRegistration({
      appVersion: '0.1.0-test', clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS', isActive: true,
      lastRefreshedAt: '2026-07-03T00:00:00.000Z',
      lastSeenAt: '2026-07-03T00:00:00.000Z', tokenId: 91,
    });
    await expect(registration).resolves.toMatchObject({tokenId: 91});
    await expect(deactivation).resolves.toEqual({status: 'deactivated'});
    expect(deactivateMyFcmToken).toHaveBeenCalledWith(
      'access-token', 91, AUTH_GENERATION,
    );
    expect(vi.mocked(saveFcmRegistration).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deactivateMyFcmToken).mock.invocationCallOrder[0]!,
    );
    expect(stored.tokenId).toBeNull();
    expect(clearFcmOptOut).not.toHaveBeenCalled();
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
    let attempt: Awaited<ReturnType<typeof getFcmRegistrationAttempt>> = null;
    let optOutState: Awaited<ReturnType<typeof getFcmOptOutState>> = null;
    let resolveRecovery!: (value: FcmTokenRegisterResponse) => void;
    vi.mocked(saveFcmRegistrationAttempt).mockImplementation(async (nextAttempt) => {
      attempt = nextAttempt;
      return true;
    });
    vi.mocked(getFcmRegistrationAttempt).mockImplementation(async () => attempt);
    vi.mocked(clearFcmRegistrationAttempt).mockImplementation(async () => { attempt = null; });
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
    expect(attempt).toMatchObject({token: 'outcome-unknown-token', userId: USER_ID});

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
      'access-token', 92, AUTH_GENERATION,
    );
    expect(optOutState).toEqual(expect.objectContaining({status: 'confirmed'}));
    expect(attempt).toBeNull();
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
    expect(clearFcmOptOut).not.toHaveBeenCalled();
    resolveDeactivation();
    await deactivation;
    await enable;

    expect(vi.mocked(saveFcmOptOut).mock.invocationCallOrder.at(-1)).toBeLessThan(
      vi.mocked(clearFcmOptOut).mock.invocationCallOrder[0]!,
    );
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
    await expect(capturedOperations.settlement).resolves.toEqual({
      accessToken: 'access-token', clientInstanceId: 'faithlog-client-1',
    });
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
