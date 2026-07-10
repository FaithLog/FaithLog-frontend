import type {LogoutRequest} from '../api/types';
import {getStoredClientInstanceId} from '../api/tokenStorage';
import {isFcmRuntimeEnabled} from '../notifications/fcmEnvironment';

export type LogoutFcmDeactivationProvider = (expectedUserId?: number) => Promise<
  Pick<LogoutRequest, 'clientInstanceId' | 'fcmToken'>
>;

export const getLogoutFcmDeactivationPayload: LogoutFcmDeactivationProvider = async () => {
  if (!isFcmRuntimeEnabled()) {
    return {};
  }

  const clientInstanceId = await getStoredClientInstanceId();

  return clientInstanceId ? {clientInstanceId} : {};
};
