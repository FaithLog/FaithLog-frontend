import type {LogoutRequest} from '../api/types';

export type LogoutFcmDeactivationProvider = () => Promise<
  Pick<LogoutRequest, 'clientInstanceId' | 'fcmToken'>
>;

export const getLogoutFcmDeactivationPayload: LogoutFcmDeactivationProvider = async () => {
  /*
   * FE-006 owns notification permission and FCM token registration. Until that
   * module exists, logout still calls the backend without FCM fields; the API
   * contract treats them as optional and deactivates token/session state by the
   * authenticated logout request.
   */
  return {};
};
