import {apiRequest, FaithLogApiError, isMockModeEnabled} from '../api/client';
import {parseAdminNotificationResponse} from '../api/runtimeValidation';
import type {AdminNotificationResponse} from '../api/types';

export const DUTY_CHARGE_REMINDER_CONTRACT_STATUS = 'confirmed' as const;

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
  // Kept injectable for existing mock harness compatibility; the canonical
  // REST Docs contract is now identical in mock and production modes.
  void (dependencies.isMockMode ?? isMockModeEnabled);

  return {
    async send(accessToken, campusId, dutyType) {
      const expectedCampusId = positiveId(campusId, 'campusId');
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
