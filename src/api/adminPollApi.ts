import {
  apiRequest,
  buildAdminCampusPath,
  buildCampusPath,
  buildPollListPath,
  toPositiveIntegerPathSegment,
  FaithLogApiError,
} from './client';
import type {
  AdminNotificationRequest,
  AdminNotificationResponse,
  PaymentCategory,
  PollComment,
  PollOption,
  PollResults,
} from './types';
import {
  parseAdminNotificationResponse,
  parseAdminPoll,
  parseAdminPollMissingMembers,
  parseAdminPollTemplate,
  parseAdminPollTemplates,
  parsePollComments,
  parsePollResults,
  parsePollSummaryList,
} from './runtimeValidation';

export type AdminPollType = 'CUSTOM' | 'COFFEE' | 'WEDNESDAY' | 'SATURDAY';
type AdminPollCreatePayloadPollType = 'CUSTOM' | 'COFFEE';
export type AdminPollSelectionType = 'SINGLE' | 'MULTIPLE';
export type AdminPollChargeGenerationType = 'NONE' | 'OPTION_PRICE';
export type AdminPollStatus = 'OPEN' | 'CLOSED' | string;

export type AdminPollTemplateOptionRequest = {
  content: string | null;
  menuId: number | null;
  priceAmount: number | null;
  sortOrder: number;
};

export type AdminPollTemplateRequest = {
  title: string;
  pollType: AdminPollType;
  selectionType: AdminPollSelectionType;
  chargeGenerationType: AdminPollChargeGenerationType;
  paymentCategory: PaymentCategory | null;
  paymentAccountId: number | null;
  autoCreateEnabled: boolean;
  startDayOfWeek: number;
  startTime: string;
  endDayOfWeek: number;
  endTime: string;
  options: AdminPollTemplateOptionRequest[];
};

type AdminPollTemplateRequestPayload = Omit<
  AdminPollTemplateRequest,
  'paymentAccountId' | 'paymentCategory' | 'pollType'
> & {
  paymentAccountId?: number | null;
  paymentCategory?: PaymentCategory | null;
  pollType: AdminPollCreatePayloadPollType;
};

export type AdminPollTemplate = {
  id: number;
  campusId: number;
  title: string;
  pollType: AdminPollType | string;
  selectionType: AdminPollSelectionType | string;
  chargeGenerationType: AdminPollChargeGenerationType | string;
  paymentCategory: PaymentCategory | null;
  paymentAccountId: number | null;
  autoCreateEnabled: boolean;
  startDayOfWeek: number;
  startTime: string;
  endDayOfWeek: number;
  endTime: string;
  isDefault: boolean;
  isActive: boolean;
  options: PollOption[];
};

export type AdminPollCreateRequest = {
  templateId: number | null;
  title: string;
  pollType: AdminPollType;
  selectionType: AdminPollSelectionType;
  isAnonymous: boolean;
  allowUserOptionAdd?: boolean;
  chargeGenerationType: AdminPollChargeGenerationType;
  paymentCategory: PaymentCategory | null;
  paymentAccountId: number | null;
  startsAt: string;
  endsAt: string;
  options: AdminPollTemplateOptionRequest[];
};

export type AdminPoll = {
  id: number;
  campusId: number;
  templateId: number | null;
  title: string;
  pollType: AdminPollType | string;
  selectionType: AdminPollSelectionType | string;
  isAnonymous: boolean;
  allowUserOptionAdd?: boolean;
  chargeGenerationType: AdminPollChargeGenerationType | string;
  paymentCategory: PaymentCategory | null;
  paymentAccountId: number | null;
  startsAt: string;
  endsAt: string;
  status: AdminPollStatus;
  options: PollOption[];
};

export type AdminPollMissingMember = {
  userId: number;
  name: string;
  email: string;
};

const pollTypes: AdminPollType[] = ['CUSTOM', 'COFFEE', 'WEDNESDAY', 'SATURDAY'];
const selectionTypes: AdminPollSelectionType[] = ['SINGLE', 'MULTIPLE'];
const chargeGenerationTypes: AdminPollChargeGenerationType[] = ['NONE', 'OPTION_PRICE'];
const paymentCategories: PaymentCategory[] = ['PENALTY', 'COFFEE'];

export function fetchAdminPolls(accessToken: string, campusId: unknown) {
  return apiRequest(buildPollListPath(campusId, 20), {
    accessToken,
    responseParser: parsePollSummaryList,
  });
}

export function fetchAdminPollTemplates(accessToken: string, campusId: unknown) {
  return apiRequest<AdminPollTemplate[]>(
    buildAdminCampusPath(campusId, 'poll-templates'),
    {accessToken, responseParser: parseAdminPollTemplates},
  );
}

export function fetchAdminPollTemplate(
  accessToken: string,
  campusId: unknown,
  templateId: unknown,
) {
  return apiRequest<AdminPollTemplate>(
    buildAdminCampusPath(
      campusId,
      'poll-templates',
      toPositiveIntegerPathSegment(templateId, 'templateId'),
    ),
    {accessToken, responseParser: parseAdminPollTemplate},
  );
}

export function createAdminPollTemplate(
  accessToken: string,
  campusId: unknown,
  body: AdminPollTemplateRequest,
) {
  return apiRequest<AdminPollTemplate>(buildAdminCampusPath(campusId, 'poll-templates'), {
    accessToken,
    body: toPollTemplateRequest(body),
    exposeServerErrorMessage: true,
    responseParser: parseAdminPollTemplate,
    method: 'POST',
  });
}

export function updateAdminPollTemplate(
  accessToken: string,
  campusId: unknown,
  templateId: unknown,
  body: AdminPollTemplateRequest,
) {
  return apiRequest<AdminPollTemplate>(
    buildAdminCampusPath(
      campusId,
      'poll-templates',
      toPositiveIntegerPathSegment(templateId, 'templateId'),
    ),
    {
      accessToken,
      body: toPollTemplateRequest(body),
      exposeServerErrorMessage: true,
      responseParser: parseAdminPollTemplate,
      method: 'PATCH',
    },
  );
}

export function deleteAdminPollTemplate(
  accessToken: string,
  campusId: unknown,
  templateId: unknown,
) {
  return apiRequest<AdminPollTemplate>(
    buildAdminCampusPath(
      campusId,
      'poll-templates',
      toPositiveIntegerPathSegment(templateId, 'templateId'),
    ),
    {
      accessToken,
      responseParser: parseAdminPollTemplate,
      method: 'DELETE',
    },
  );
}

export function createAdminPoll(
  accessToken: string,
  campusId: unknown,
  body: AdminPollCreateRequest,
) {
  return apiRequest<AdminPoll>(buildAdminCampusPath(campusId, 'polls'), {
    accessToken,
    body: toAdminPollCreateRequest(body),
    exposeServerErrorMessage: true,
    responseParser: parseAdminPoll,
    method: 'POST',
  });
}

export function closeAdminPoll(
  accessToken: string,
  campusId: unknown,
  pollId: unknown,
) {
  return apiRequest<AdminPoll>(
    buildAdminCampusPath(
      campusId,
      'polls',
      toPositiveIntegerPathSegment(pollId, 'pollId'),
      'close',
    ),
    {
      accessToken,
      exposeServerErrorMessage: true,
      responseParser: parseAdminPoll,
      method: 'PATCH',
    },
  );
}

export function fetchAdminPollResults(
  accessToken: string,
  campusId: unknown,
  pollId: unknown,
) {
  return apiRequest<PollResults>(
    buildCampusPath(campusId, 'polls', toPositiveIntegerPathSegment(pollId, 'pollId'), 'results'),
    {accessToken, responseParser: parsePollResults},
  );
}

export function fetchAdminPollComments(
  accessToken: string,
  campusId: unknown,
  pollId: unknown,
) {
  return apiRequest<PollComment[]>(
    buildCampusPath(campusId, 'polls', toPositiveIntegerPathSegment(pollId, 'pollId'), 'comments'),
    {accessToken, responseParser: parsePollComments},
  );
}

export function fetchAdminPollMissingMembers(
  accessToken: string,
  campusId: unknown,
  pollId: unknown,
) {
  return apiRequest<AdminPollMissingMember[]>(
    buildAdminCampusPath(
      campusId,
      'polls',
      toPositiveIntegerPathSegment(pollId, 'pollId'),
      'missing-members',
    ),
    {accessToken, responseParser: parseAdminPollMissingMembers},
  );
}

export function sendAdminPollMissingNotification(
  accessToken: string,
  campusId: unknown,
  body: AdminNotificationRequest,
) {
  return apiRequest<AdminNotificationResponse>(
    buildAdminCampusPath(campusId, 'notifications'),
    {
      accessToken,
      body: toAdminPollNotificationRequest(body),
      responseParser: parseAdminNotificationResponse,
      method: 'POST',
    },
  );
}

function toPollTemplateRequest(body: AdminPollTemplateRequest): AdminPollTemplateRequestPayload {
  const chargeGenerationType = toChargeGenerationType(body.chargeGenerationType);
  const request: AdminPollTemplateRequestPayload = {
    title: toRequiredString(body.title, '템플릿 제목'),
    pollType: toPollCreatePayloadPollType(body.pollType),
    selectionType: toSelectionType(body.selectionType),
    chargeGenerationType,
    autoCreateEnabled: Boolean(body.autoCreateEnabled),
    startDayOfWeek: toDayOfWeek(body.startDayOfWeek, 'startDayOfWeek'),
    startTime: toLocalTime(body.startTime, 'startTime'),
    endDayOfWeek: toDayOfWeek(body.endDayOfWeek, 'endDayOfWeek'),
    endTime: toLocalTime(body.endTime, 'endTime'),
    options: toOptionRequests(body.options),
  };

  if (chargeGenerationType === 'OPTION_PRICE') {
    request.paymentCategory = toNullablePaymentCategory(body.paymentCategory);
    request.paymentAccountId = toNullablePositiveInteger(body.paymentAccountId, 'paymentAccountId');
  }

  return request;
}

type AdminPollCreateRequestPayload = Omit<
  AdminPollCreateRequest,
  'options' | 'paymentAccountId' | 'paymentCategory' | 'templateId'
> & {
  options: Array<{
    content?: string | null;
    menuId?: number;
    priceAmount?: number | null;
    sortOrder: number;
  }>;
  paymentAccountId?: number | null;
  paymentCategory?: PaymentCategory | null;
  pollType: AdminPollCreatePayloadPollType;
  templateId?: number;
};

function toAdminPollCreateRequest(body: AdminPollCreateRequest): AdminPollCreateRequestPayload {
  const templateId = toNullablePositiveInteger(body.templateId, 'templateId');
  const startsAt = toInstantString(body.startsAt, 'startsAt');
  const endsAt = toInstantString(body.endsAt, 'endsAt');
  const chargeGenerationType = toChargeGenerationType(body.chargeGenerationType);
  const paymentCategory = toNullablePaymentCategory(body.paymentCategory);
  const paymentAccountId = toNullablePositiveInteger(body.paymentAccountId, 'paymentAccountId');

  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '종료 시각은 시작 시각보다 이후여야 합니다.',
    });
  }

  const request: AdminPollCreateRequestPayload = {
    title: toRequiredString(body.title, '투표 제목'),
    pollType: toPollCreatePayloadPollType(body.pollType),
    selectionType: toSelectionType(body.selectionType),
    isAnonymous: Boolean(body.isAnonymous),
    allowUserOptionAdd: Boolean(body.allowUserOptionAdd),
    chargeGenerationType,
    startsAt,
    endsAt,
    options: templateId === null ? toPollCreateOptionRequests(body.options) : [],
  };

  if (templateId !== null) {
    request.templateId = templateId;
  }

  if (chargeGenerationType === 'OPTION_PRICE') {
    request.paymentCategory = paymentCategory;
    request.paymentAccountId = paymentAccountId;
  }

  return request;
}

function toAdminPollNotificationRequest(
  body: AdminNotificationRequest,
): AdminNotificationRequest {
  const targetUserIds = body.targetUserIds.map((userId) =>
    Number(toPositiveIntegerPathSegment(userId, 'targetUserIds')),
  );

  if (targetUserIds.length === 0) {
    throw new FaithLogApiError({kind: 'error', message: '미응답 알림 대상이 없습니다.'});
  }

  return {
    notificationType: 'CUSTOM',
    targetUserIds,
    targetWeekStartDate: null,
    targetId: toNullablePositiveInteger(body.targetId, 'targetId'),
    title: toRequiredString(body.title, '알림 제목'),
    body: toRequiredString(body.body, '알림 본문'),
  };
}

function toOptionRequests(
  options: AdminPollTemplateOptionRequest[],
): AdminPollTemplateOptionRequest[] {
  if (!Array.isArray(options) || options.length === 0) {
    throw new FaithLogApiError({kind: 'error', message: '선택지를 1개 이상 입력해 주세요.'});
  }

  return options.map((option, index) => {
    const content = typeof option.content === 'string' ? option.content.trim() : null;
    const menuId = toNullablePositiveInteger(option.menuId, `options[${index}].menuId`);
    const priceAmount =
      option.priceAmount === null || option.priceAmount === undefined
        ? null
        : toNonNegativeInteger(option.priceAmount, `options[${index}].priceAmount`);

    if (!content && menuId === null) {
      throw new FaithLogApiError({
        kind: 'error',
        message: '선택지는 직접 내용 또는 커피 메뉴 ID가 필요합니다.',
      });
    }

    return {
      content: content || null,
      menuId,
      priceAmount,
      sortOrder: toPositiveInteger(option.sortOrder || index + 1, `options[${index}].sortOrder`),
    };
  });
}

function toPollCreateOptionRequests(options: AdminPollTemplateOptionRequest[]) {
  return toOptionRequests(options).map((option) => {
    if (option.menuId !== null) {
      return {
        content: null,
        menuId: option.menuId,
        priceAmount: null,
        sortOrder: option.sortOrder,
      };
    }

    return {
      content: option.content,
      priceAmount: option.priceAmount ?? 0,
      sortOrder: option.sortOrder,
    };
  });
}

function toRequiredString(value: unknown, label: string) {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (!trimmed) {
    throw new FaithLogApiError({kind: 'error', message: `${label}을(를) 입력해 주세요.`});
  }

  return trimmed.slice(0, 120);
}

function toPollType(value: unknown): AdminPollType {
  if (pollTypes.includes(value as AdminPollType)) {
    return value as AdminPollType;
  }

  throw new FaithLogApiError({kind: 'error', message: '투표 타입이 올바르지 않습니다.'});
}

function toPollCreatePayloadPollType(value: unknown): AdminPollCreatePayloadPollType {
  const pollType = toPollType(value);

  return pollType === 'COFFEE' ? 'COFFEE' : 'CUSTOM';
}

function toSelectionType(value: unknown): AdminPollSelectionType {
  if (selectionTypes.includes(value as AdminPollSelectionType)) {
    return value as AdminPollSelectionType;
  }

  throw new FaithLogApiError({kind: 'error', message: '선택 방식이 올바르지 않습니다.'});
}

function toChargeGenerationType(value: unknown): AdminPollChargeGenerationType {
  if (chargeGenerationTypes.includes(value as AdminPollChargeGenerationType)) {
    return value as AdminPollChargeGenerationType;
  }

  throw new FaithLogApiError({kind: 'error', message: '청구 생성 방식이 올바르지 않습니다.'});
}

function toNullablePaymentCategory(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (paymentCategories.includes(value as PaymentCategory)) {
    return value as PaymentCategory;
  }

  throw new FaithLogApiError({kind: 'error', message: '청구 카테고리가 올바르지 않습니다.'});
}

function toNullablePositiveInteger(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return Number(toPositiveIntegerPathSegment(value, label));
}

function toPositiveInteger(value: unknown, label: string) {
  return Number(toPositiveIntegerPathSegment(value, label));
}

function toNonNegativeInteger(value: unknown, label: string) {
  const numericValue =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

  if (
    typeof numericValue !== 'number' ||
    !Number.isInteger(numericValue) ||
    numericValue < 0 ||
    !Number.isSafeInteger(numericValue)
  ) {
    throw new FaithLogApiError({kind: 'error', message: `${label} 값이 올바르지 않습니다.`});
  }

  return numericValue;
}

function toDayOfWeek(value: unknown, label: string) {
  const day = toPositiveInteger(value, label);

  if (day > 7) {
    throw new FaithLogApiError({kind: 'error', message: `${label}는 1-7 사이여야 합니다.`});
  }

  return day;
}

function toLocalTime(value: unknown, label: string) {
  const time = toRequiredString(value, label);

  if (!/^\d{2}:\d{2}:\d{2}$/.test(time)) {
    throw new FaithLogApiError({kind: 'error', message: `${label}는 HH:mm:ss 형식이어야 합니다.`});
  }

  return time;
}

function toInstantString(value: unknown, label: string) {
  const instant = toRequiredString(value, label);
  const time = Date.parse(instant);

  if (Number.isNaN(time)) {
    throw new FaithLogApiError({kind: 'error', message: `${label} 시각이 올바르지 않습니다.`});
  }

  return new Date(time).toISOString();
}
