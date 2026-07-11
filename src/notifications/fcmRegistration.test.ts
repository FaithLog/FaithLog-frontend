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
  getAuthSessionGeneration: vi.fn(),
  getOrCreateClientInstanceId: vi.fn(),
  getStoredFcmRegistration: vi.fn(),
  isAuthSessionGenerationCurrent: vi.fn(),
  saveFcmRegistration: vi.fn(),
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
  getOrCreateClientInstanceId,
  getStoredFcmRegistration,
  isAuthSessionGenerationCurrent,
  saveFcmRegistration,
  type AuthSessionGeneration,
} from '../api/tokenStorage';
import {getFcmRuntimeAvailability, isFcmRuntimeEnabled} from './fcmEnvironment';
import {
  capturePendingFcmRegistrationBarrier,
  registerCurrentFcmToken,
  registerFcmTokenValue,
} from './fcmRegistration';
import {
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
    vi.mocked(saveFcmRegistration).mockResolvedValue(true);
    vi.mocked(getFcmRuntimeAvailability).mockReturnValue({enabled: true});
    vi.mocked(isFcmRuntimeEnabled).mockReturnValue(true);
    vi.mocked(requestNotificationPermission).mockResolvedValue('authorized');
    vi.mocked(getDeviceType).mockReturnValue('IOS');
    vi.mocked(getOrCreateClientInstanceId).mockResolvedValue('faithlog-client-1');
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
    const logoutBarrier = capturePendingFcmRegistrationBarrier();
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

    await expect(pending).resolves.toBeNull();
    await expect(logoutBarrier).resolves.toBeUndefined();
    expect(barrierResolved).toBe(true);
    expect(saveFcmRegistration).not.toHaveBeenCalled();
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
