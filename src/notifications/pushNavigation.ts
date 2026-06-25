import type {ShellRoute} from '../navigation/shellRoutes';

export type PushRouteParams = Partial<{
  campusId: number;
  pollId: number;
  targetId: number;
  targetWeekStartDate: string;
  userId: number;
  weekStartDate: string;
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
    pollId: toPositiveInteger,
    targetId: toPositiveInteger,
  },
  prayers: {
    targetId: toPositiveInteger,
    targetWeekStartDate: toValidDateString,
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

export function parsePushNotificationOpenPayload(payload: unknown): PushNavigationTarget {
  if (!isRecord(payload)) {
    return {status: 'invalid', reason: 'payloadNotObject'};
  }

  const route = payload.route;

  if (!isShellRoute(route)) {
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

function assertNever(value: never): never {
  throw new Error(`Unhandled push navigation reason: ${String(value)}`);
}
