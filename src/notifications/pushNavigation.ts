import type {ShellRoute} from '../navigation/shellRoutes';
import {isAnnouncementCapabilityEnabled} from '../announcements/announcementEnvironment';
import {isWeeklyMaterialCapabilityEnabled} from '../weeklyMaterials/weeklyMaterialEnvironment';
import {
  parseWeeklySharingSheetNotification,
  WEEKLY_SHARING_SHEET_EVENT,
} from '../weeklyMaterials/weeklyMaterialDeepLink';

export type PushRouteParams = Partial<{
  campusId: number;
  pollId: number;
  targetId: number;
  targetWeekStartDate: string;
  userId: number;
  weekStartDate: string;
  announcementId: number;
  categoryId: number;
}>;

export type ValidPushNavigationTarget = {
  status: 'valid';
  route: ShellRoute;
  params: PushRouteParams;
};

export type InvalidPushNavigationReason =
  | 'payloadNotObject'
  | 'paramsNotObject'
  | 'routeNotAllowed'
  | 'unknownParam'
  | 'invalidParam';

export type PushNavigationTarget =
  | ValidPushNavigationTarget
  | {status: 'invalid'; reason: InvalidPushNavigationReason};

export type PollOpenTarget = {
  campusId: number;
  pollId: number;
};

export type NotificationPollTargetResolution =
  | {status: 'accepted'; pollTarget: PollOpenTarget | null}
  | {status: 'rejected'};

export type PushNavigationCapabilities = Readonly<{
  pollOpenEnabled: boolean;
}>;

const FAIL_CLOSED_PUSH_CAPABILITIES: PushNavigationCapabilities = {
  pollOpenEnabled: false,
};

type ParamNormalizer = (value: unknown) => number | string | null;

const routeParamSchemas: Record<ShellRoute, Record<string, ParamNormalizer>> = {
  userHome: {},
  devotion: {
    weekStartDate: toValidDateString,
  },
  payments: {
    targetId: toPositiveInteger,
  },
  polls: {
    campusId: toPositiveInteger,
    pollId: toPositiveInteger,
    targetId: toPositiveInteger,
  },
  prayers: {
    targetId: toPositiveInteger,
    targetWeekStartDate: toValidDateString,
  },
  announcements: {
    announcementId: toPositiveInteger,
    campusId: toPositiveInteger,
    categoryId: toPositiveInteger,
  },
  weeklyMaterials: {
    campusId: toPositiveInteger,
    weekStartDate: toValidDateString,
  },
  profile: {},
  campusAdmin: {
    campusId: toPositiveInteger,
    targetId: toPositiveInteger,
    targetWeekStartDate: toValidDateString,
  },
  serviceAdmin: {
    campusId: toPositiveInteger,
    userId: toPositiveInteger,
  },
};

const routeAllowlist = Object.keys(routeParamSchemas) as ShellRoute[];
const ANNOUNCEMENT_EVENT_KEYS = [
  'announcementId',
  'campusId',
  'categoryId',
  'eventType',
] as const;
const announcementEventKeySet = new Set<string>(ANNOUNCEMENT_EVENT_KEYS);

export function parsePushNotificationOpenPayload(
  payload: unknown,
  capabilities: PushNavigationCapabilities = FAIL_CLOSED_PUSH_CAPABILITIES,
): PushNavigationTarget {
  if (!isRecord(payload)) {
    return {status: 'invalid', reason: 'payloadNotObject'};
  }

  if (payload.eventType === 'ANNOUNCEMENT_PUBLISHED') {
    const payloadKeys = Object.keys(payload).sort();

    if (payloadKeys.some((key) => !announcementEventKeySet.has(key))) {
      return {status: 'invalid', reason: 'unknownParam'};
    }

    if (!sameKeys(payloadKeys, ANNOUNCEMENT_EVENT_KEYS)) {
      return {status: 'invalid', reason: 'invalidParam'};
    }

    const announcementId = toPositiveSafeIntegerString(payload.announcementId);
    const campusId = toPositiveSafeIntegerString(payload.campusId);
    const categoryId = toPositiveSafeIntegerString(payload.categoryId);
    if (announcementId === null || campusId === null || categoryId === null) {
      return {status: 'invalid', reason: 'invalidParam'};
    }

    if (!isAnnouncementCapabilityEnabled()) {
      return {status: 'invalid', reason: 'routeNotAllowed'};
    }

    return {
      status: 'valid',
      route: 'announcements',
      params: {announcementId, campusId, categoryId},
    };
  }

  if (payload.eventType === WEEKLY_SHARING_SHEET_EVENT) {
    const allowedKeys = new Set(['eventType', 'campusId', 'weekStartDate']);
    const payloadKeys = Object.keys(payload);
    if (payloadKeys.some((key) => !allowedKeys.has(key))) {
      return {status: 'invalid', reason: 'unknownParam'};
    }
    const parsed = parseWeeklySharingSheetNotification(payload);
    if (!parsed) return {status: 'invalid', reason: 'invalidParam'};
    if (!isWeeklyMaterialCapabilityEnabled()) {
      return {status: 'invalid', reason: 'routeNotAllowed'};
    }
    return {
      status: 'valid',
      route: 'weeklyMaterials',
      params: {
        ...(parsed.campusId === null ? {} : {campusId: parsed.campusId}),
        weekStartDate: parsed.weekStartDate,
      },
    };
  }

  if (payload.eventType !== undefined) {
    return parseEventPayload(payload, capabilities);
  }

  const route = payload.route;

  if (!isShellRoute(route)) {
    return {status: 'invalid', reason: 'routeNotAllowed'};
  }

  if (
    (route === 'announcements' && !isAnnouncementCapabilityEnabled()) ||
    (route === 'weeklyMaterials' && !isWeeklyMaterialCapabilityEnabled())
  ) {
    return {status: 'invalid', reason: 'routeNotAllowed'};
  }

  const rawParams = payload.params ?? {};

  if (!isRecord(rawParams)) {
    return {status: 'invalid', reason: 'paramsNotObject'};
  }

  const schema = routeParamSchemas[route];
  const params: PushRouteParams = {};

  for (const key of Object.keys(rawParams)) {
    const normalize = schema[key];

    if (!normalize) {
      return {status: 'invalid', reason: 'unknownParam'};
    }

    const normalized = normalize(rawParams[key]);

    if (normalized === null) {
      return {status: 'invalid', reason: 'invalidParam'};
    }

    params[key as keyof PushRouteParams] = normalized as never;
  }

  return {status: 'valid', route, params};
}

export function getPollOpenTarget(
  target: ValidPushNavigationTarget,
  currentCampusId: number,
  capabilities: PushNavigationCapabilities = FAIL_CLOSED_PUSH_CAPABILITIES,
): PollOpenTarget | null {
  if (
    !capabilities.pollOpenEnabled ||
    target.route !== 'polls' ||
    target.params.campusId !== currentCampusId ||
    typeof target.params.pollId !== 'number'
  ) {
    return null;
  }

  return {
    campusId: currentCampusId,
    pollId: target.params.pollId,
  };
}

export function resolveNotificationPollTarget(
  target: ValidPushNavigationTarget,
  currentCampusId: number,
  capabilities: PushNavigationCapabilities = FAIL_CLOSED_PUSH_CAPABILITIES,
): NotificationPollTargetResolution {
  if (target.route !== 'polls') {
    return {status: 'accepted', pollTarget: null};
  }

  if (
    !capabilities.pollOpenEnabled &&
    target.params.campusId !== undefined &&
    target.params.pollId !== undefined
  ) {
    return {status: 'rejected'};
  }

  const pollTarget = getPollOpenTarget(target, currentCampusId, capabilities);
  return target.params.campusId !== undefined && pollTarget === null
    ? {status: 'rejected'}
    : {status: 'accepted', pollTarget};
}

function parseEventPayload(
  payload: Record<string, unknown>,
  capabilities: PushNavigationCapabilities,
): PushNavigationTarget {
  if (payload.eventType !== 'POLL_OPEN') {
    return {status: 'invalid', reason: 'routeNotAllowed'};
  }
  if (!capabilities.pollOpenEnabled) {
    return {status: 'invalid', reason: 'routeNotAllowed'};
  }
  const allowedKeys = new Set(['eventType', 'campusId', 'pollId']);
  const payloadKeys = Object.keys(payload);
  if (payloadKeys.some((key) => !allowedKeys.has(key))) {
    return {status: 'invalid', reason: 'unknownParam'};
  }
  if (payloadKeys.length !== allowedKeys.size) {
    return {status: 'invalid', reason: 'invalidParam'};
  }
  const campusId = toCanonicalPositiveIntegerString(payload.campusId);
  const pollId = toCanonicalPositiveIntegerString(payload.pollId);
  if (campusId === null || pollId === null) {
    return {status: 'invalid', reason: 'invalidParam'};
  }
  return {status: 'valid', route: 'polls', params: {campusId, pollId}};
}

function toCanonicalPositiveIntegerString(value: unknown) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) ? numericValue : null;
}

export function getPushNavigationInvalidMessage(reason: InvalidPushNavigationReason) {
  switch (reason) {
    case 'payloadNotObject':
      return '알림 이동 정보 형식이 올바르지 않습니다.';
    case 'paramsNotObject':
      return '알림 이동 상세 정보 형식이 올바르지 않습니다.';
    case 'routeNotAllowed':
      return '허용되지 않은 알림 이동 경로입니다.';
    case 'unknownParam':
      return '알림 이동 정보에 허용되지 않은 항목이 있습니다.';
    case 'invalidParam':
      return '알림 이동 상세 값이 올바르지 않습니다.';
    default:
      return assertNever(reason);
  }
}

function isShellRoute(value: unknown): value is ShellRoute {
  return typeof value === 'string' && routeAllowlist.includes(value as ShellRoute);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toPositiveInteger(value: unknown) {
  const numericValue =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

  if (
    typeof numericValue !== 'number' ||
    !Number.isInteger(numericValue) ||
    numericValue <= 0 ||
    !Number.isSafeInteger(numericValue)
  ) {
    return null;
  }

  return numericValue;
}

function toPositiveSafeIntegerString(value: unknown) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isSafeInteger(numericValue)) {
    return null;
  }

  return numericValue;
}

function toValidDateString(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime()) || formatLocalDate(date) !== value) {
    return null;
  }

  return value;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function sameKeys(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled push navigation reason: ${String(value)}`);
}
