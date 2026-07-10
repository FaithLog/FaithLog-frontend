import type {LogoutRequest} from '../api/types';
import {getOrCreateClientInstanceId, getStoredFcmRegistration} from '../api/tokenStorage';
import {isFcmRuntimeEnabled} from '../notifications/fcmEnvironment';

export type LogoutFcmDeactivationProvider = (expectedUserId?: number) => Promise<
  Pick<LogoutRequest, 'clientInstanceId' | 'fcmToken'>
>;

export const getLogoutFcmDeactivationPayload: LogoutFcmDeactivationProvider = async (
  expectedUserId,
) => {
  if (!isFcmRuntimeEnabled()) {
    return {};
  }

  const {token, userId} = await getStoredFcmRegistration();
  const clientInstanceId = await getOrCreateClientInstanceId();

  if (
    !token ||
    (expectedUserId !== undefined && userId !== null && userId !== expectedUserId)
  ) {
    return {clientInstanceId};
  }

  return {
    clientInstanceId,
    fcmToken: token,
  };
};
