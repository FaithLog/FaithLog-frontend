import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../api/tokenStorage', () => ({
  getStoredClientInstanceId: vi.fn(),
}));

vi.mock('../notifications/fcmEnvironment', () => ({
  isFcmRuntimeEnabled: vi.fn(),
}));

import {getStoredClientInstanceId} from '../api/tokenStorage';
import {isFcmRuntimeEnabled} from '../notifications/fcmEnvironment';
import {getLogoutFcmDeactivationPayload} from './fcmLogout';

describe('logout FCM deactivation payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isFcmRuntimeEnabled).mockReturnValue(true);
    vi.mocked(getStoredClientInstanceId).mockResolvedValue('client-instance');
  });

  it('scopes cleanup to the existing client instance without sending the FCM token', async () => {
    await expect(getLogoutFcmDeactivationPayload(42)).resolves.toEqual({
      clientInstanceId: 'client-instance',
    });
  });

  it('does not create an identifier just to perform logout cleanup', async () => {
    vi.mocked(getStoredClientInstanceId).mockResolvedValue(null);

    await expect(getLogoutFcmDeactivationPayload(42)).resolves.toEqual({});
  });

  it('does not read native FCM identity when the runtime is disabled', async () => {
    vi.mocked(isFcmRuntimeEnabled).mockReturnValue(false);

    await expect(getLogoutFcmDeactivationPayload(42)).resolves.toEqual({});
    expect(getStoredClientInstanceId).not.toHaveBeenCalled();
  });
});
