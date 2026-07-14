import {apiRequest, FaithLogApiError, isMockModeEnabled} from '../api/client';
import {parseAdminNotificationResponse} from '../api/runtimeValidation';
import type {AdminNotificationResponse} from '../api/types';

export const DUTY_CHARGE_REMINDER_CONTRACT_STATUS = 'pending' as 'pending' | 'confirmed';

export type DutyChargeReminderType = 'COFFEE' | 'MEAL';

type DutyChargeReminderRequestOptions<T> = {
  accessToken: string;
  expectedStatuses: readonly [202];
  method: 'POST';
  responseParser: (value: unknown) => T;
};

export type DutyChargeReminderRequestDispatcher = <T>(
  path: string,
  options: DutyChargeReminderRequestOptions<T>,
) => Promise<T>;

export type DutyChargeReminderApi = {
  send(
    accessToken: string,
    campusId: unknown,
    dutyType: DutyChargeReminderType,
  ): Promise<AdminNotificationResponse>;
};

type DutyChargeReminderApiDependencies = {
  isMockMode?: () => boolean;
  request?: DutyChargeReminderRequestDispatcher;
};

export function createDutyChargeReminderApi(
  dependencies: DutyChargeReminderApiDependencies = {},
): DutyChargeReminderApi {
  const request: DutyChargeReminderRequestDispatcher =
    dependencies.request ?? ((path, options) => apiRequest(path, options));
  const isMockMode = dependencies.isMockMode ?? isMockModeEnabled;

  return {
    async send(accessToken, campusId, dutyType) {
      const expectedCampusId = positiveId(campusId, 'campusId');
      if (!isMockMode() && DUTY_CHARGE_REMINDER_CONTRACT_STATUS !== 'confirmed') {
        throw new FaithLogApiError({
          kind: 'error',
          code: 'API_CONTRACT_PENDING',
          message: '미납 알림 기능을 준비하고 있습니다.',
        });
      }

      const resource = dutyType === 'COFFEE' ? 'coffee' : 'meal';
      return request(`/api/v1/campuses/${expectedCampusId}/${resource}/charge-reminders`, {
        accessToken,
        expectedStatuses: [202],
        method: 'POST',
        responseParser: parseAdminNotificationResponse,
      });
    },
  };
}

export const dutyChargeReminderApi = createDutyChargeReminderApi();

function positiveId(value: unknown, label: string) {
  const numeric = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new FaithLogApiError({
      kind: 'error',
      status: 400,
      message: `${label} 값이 올바르지 않습니다.`,
    });
  }
  return numeric;
}
