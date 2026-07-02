import type {LogoutRequest} from '../api/types';
import {getOrCreateClientInstanceId, getStoredFcmRegistration} from '../api/tokenStorage';
import {isFcmRuntimeEnabled} from '../notifications/fcmEnvironment';

export type LogoutFcmDeactivationProvider = () => Promise<
  Pick<LogoutRequest, 'clientInstanceId' | 'fcmToken'>
>;

export const getLogoutFcmDeactivationPayload: LogoutFcmDeactivationProvider = async () => {
  if (!isFcmRuntimeEnabled()) {
    return {};
  }

  const {token} = await getStoredFcmRegistration();

  if (!token) {
    return {};
  }

  return {
    clientInstanceId: await getOrCreateClientInstanceId(),
    fcmToken: token,
  };
};
