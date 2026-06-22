import type {LogoutRequest} from '../api/types';
import {getOrCreateClientInstanceId, getStoredFcmRegistration} from '../api/tokenStorage';

export type LogoutFcmDeactivationProvider = () => Promise<
  Pick<LogoutRequest, 'clientInstanceId' | 'fcmToken'>
>;

export const getLogoutFcmDeactivationPayload: LogoutFcmDeactivationProvider = async () => {
  const {token} = await getStoredFcmRegistration();

  if (!token) {
    return {};
  }

  return {
    clientInstanceId: await getOrCreateClientInstanceId(),
    fcmToken: token,
  };
};
