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
  getOrCreateClientInstanceId: vi.fn(),
  getStoredFcmRegistration: vi.fn(),
  saveFcmToken: vi.fn(),
  saveFcmTokenId: vi.fn(),
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

import {registerMyFcmToken} from '../api/client';
import {
  getOrCreateClientInstanceId,
  getStoredFcmRegistration,
  saveFcmToken,
  saveFcmTokenId,
} from '../api/tokenStorage';
import {getFcmRuntimeAvailability, isFcmRuntimeEnabled} from './fcmEnvironment';
import {registerCurrentFcmToken} from './fcmRegistration';
import {
  getDeviceFcmToken,
  getDeviceType,
  requestNotificationPermission,
} from './notificationAdapter';

describe('FCM registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    });
    vi.mocked(getDeviceFcmToken).mockResolvedValue({
      status: 'available',
      token: 'same-device-token',
    });

    await expect(registerCurrentFcmToken('access-token')).resolves.toEqual({
      status: 'registeredLocal',
      permission: 'authorized',
      tokenId: 77,
    });

    expect(saveFcmToken).toHaveBeenCalledWith('same-device-token');
    expect(registerMyFcmToken).not.toHaveBeenCalled();
    expect(saveFcmTokenId).not.toHaveBeenCalled();
  });

  it('registers the current device token when the stored token is stale', async () => {
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'old-device-token',
      tokenId: 77,
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

    await expect(registerCurrentFcmToken('access-token')).resolves.toMatchObject({
      status: 'registered',
      permission: 'authorized',
      registration: {
        tokenId: 88,
        deviceType: 'IOS',
      },
    });

    expect(saveFcmToken).toHaveBeenCalledWith('new-device-token');
    expect(registerMyFcmToken).toHaveBeenCalledWith('access-token', {
      appVersion: '0.1.0-test',
      clientInstanceId: 'faithlog-client-1',
      deviceType: 'IOS',
      token: 'new-device-token',
    });
    expect(saveFcmTokenId).toHaveBeenCalledWith(88);
  });
});
