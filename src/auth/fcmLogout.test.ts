import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../api/tokenStorage', () => ({
  getOrCreateClientInstanceId: vi.fn(),
  getStoredFcmRegistration: vi.fn(),
}));

vi.mock('../notifications/fcmEnvironment', () => ({
  isFcmRuntimeEnabled: vi.fn(),
}));

import {
  getOrCreateClientInstanceId,
  getStoredFcmRegistration,
} from '../api/tokenStorage';
import {isFcmRuntimeEnabled} from '../notifications/fcmEnvironment';
import {getLogoutFcmDeactivationPayload} from './fcmLogout';

describe('logout FCM deactivation payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isFcmRuntimeEnabled).mockReturnValue(true);
    vi.mocked(getOrCreateClientInstanceId).mockResolvedValue('client-instance');
  });

  it('includes only a registration owned by the user being logged out', async () => {
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'device-token',
      tokenId: 77,
      userId: 42,
    });

    await expect(getLogoutFcmDeactivationPayload(42)).resolves.toEqual({
      clientInstanceId: 'client-instance',
      fcmToken: 'device-token',
    });
  });

  it('does not send another user registration during logout', async () => {
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'other-user-token',
      tokenId: 88,
      userId: 99,
    });

    await expect(getLogoutFcmDeactivationPayload(42)).resolves.toEqual({
      clientInstanceId: 'client-instance',
    });
    expect(getOrCreateClientInstanceId).toHaveBeenCalledOnce();
  });

  it('includes the client instance even before a registration is stored', async () => {
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: null,
      tokenId: null,
      userId: null,
    });

    await expect(getLogoutFcmDeactivationPayload(42)).resolves.toEqual({
      clientInstanceId: 'client-instance',
    });
  });

  it('keeps legacy ownerless registrations eligible for one-time cleanup', async () => {
    vi.mocked(getStoredFcmRegistration).mockResolvedValue({
      token: 'legacy-token',
      tokenId: 12,
      userId: null,
    });

    await expect(getLogoutFcmDeactivationPayload(42)).resolves.toEqual({
      clientInstanceId: 'client-instance',
      fcmToken: 'legacy-token',
    });
  });
});
