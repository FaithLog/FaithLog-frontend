import type {
  CampusMembershipSummary,
  CampusRole,
  CurrentUser,
  CurrentUserCampusMembershipSummary,
  FcmDeviceType,
  FcmTokenRegisterResponse,
  LoginResponse,
  SignupResponse,
  TokenPair,
  UserRole,
} from './types';

const INVALID_RESPONSE_MESSAGE = 'Invalid API response.';
const MAX_MEMBERSHIPS = 1_000;

type UnknownRecord = Record<string, unknown>;

const USER_ROLES = new Set<UserRole>(['USER', 'MANAGER', 'ADMIN']);
const CAMPUS_ROLES = new Set<CampusRole>([
  'MEMBER',
  'CAMPUS_LEADER',
  'ELDER',
  'MINISTER',
]);
const FCM_DEVICE_TYPES = new Set<FcmDeviceType>(['ANDROID', 'IOS', 'WEB']);
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function invalidResponse(): never {
  throw new Error(INVALID_RESPONSE_MESSAGE);
}

function parseSafely<T>(parse: () => T): T {
  try {
    return parse();
  } catch {
    return invalidResponse();
  }
}

function requireRecord(value: unknown): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidResponse();
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalidResponse();
  }

  return value as UnknownRecord;
}

function requireString(value: unknown, maxLength: number): string {
  if (
    typeof value !== 'string' ||
    value.length > maxLength ||
    value.trim().length === 0
  ) {
    return invalidResponse();
  }

  return value;
}

function requirePositiveId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return invalidResponse();
  }

  return value;
}

function requireExpiry(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    return invalidResponse();
  }

  return value;
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    return invalidResponse();
  }

  return value;
}

function requireEnum<T extends string>(
  value: unknown,
  allowedValues: ReadonlySet<T>,
): T {
  if (typeof value !== 'string' || !allowedValues.has(value as T)) {
    return invalidResponse();
  }

  return value as T;
}

function requireIsoDateTime(value: unknown): string {
  const date = requireString(value, 64);
  if (!ISO_DATE_TIME_PATTERN.test(date) || !Number.isFinite(Date.parse(date))) {
    return invalidResponse();
  }

  return date;
}

function requireNullableIsoDateTime(value: unknown): string | null {
  return value === null ? null : requireIsoDateTime(value);
}

function parseTokenPairValue(value: unknown): TokenPair {
  const record = requireRecord(value);
  return {
    accessToken: requireString(record.accessToken, 32_768),
    refreshToken: requireString(record.refreshToken, 32_768),
    accessTokenExpiresIn: requireExpiry(record.accessTokenExpiresIn),
    refreshTokenExpiresIn: requireExpiry(record.refreshTokenExpiresIn),
    tokenType: requireString(record.tokenType, 64),
  };
}

function parseCampusMembershipSummaryValue(
  value: unknown,
): CampusMembershipSummary {
  const record = requireRecord(value);
  return {
    membershipId: requirePositiveId(record.membershipId),
    campusId: requirePositiveId(record.campusId),
    campusName: requireString(record.campusName, 200),
    region: requireString(record.region, 200),
    campusRole: requireEnum(record.campusRole, CAMPUS_ROLES),
    status: requireString(record.status, 64),
  };
}

function parseCampusMembershipSummariesValue(
  value: unknown,
): CampusMembershipSummary[] {
  if (!Array.isArray(value) || value.length > MAX_MEMBERSHIPS) {
    return invalidResponse();
  }

  return value.map(parseCampusMembershipSummaryValue);
}

function parseCurrentUserCampusMembershipSummaryValue(
  value: unknown,
): CurrentUserCampusMembershipSummary {
  const record = requireRecord(value);
  return {
    ...(record.membershipId === undefined
      ? {}
      : {membershipId: requirePositiveId(record.membershipId)}),
    campusId: requirePositiveId(record.campusId),
    campusName: requireString(record.campusName, 200),
    region: requireString(record.region, 200),
    campusRole: requireEnum(record.campusRole, CAMPUS_ROLES),
    status: requireString(record.status, 64),
  };
}

function parseCurrentUserCampusMembershipSummariesValue(
  value: unknown,
): CurrentUserCampusMembershipSummary[] {
  if (!Array.isArray(value) || value.length > MAX_MEMBERSHIPS) {
    return invalidResponse();
  }

  return value.map(parseCurrentUserCampusMembershipSummaryValue);
}

function parseCurrentUserValue(value: unknown): CurrentUser {
  const record = requireRecord(value);
  return {
    id: requirePositiveId(record.id),
    name: requireString(record.name, 200),
    email: requireString(record.email, 320),
    role: requireEnum(record.role, USER_ROLES),
    isActive: requireBoolean(record.isActive),
    lastLoginAt: requireNullableIsoDateTime(record.lastLoginAt),
    campusMemberships: parseCurrentUserCampusMembershipSummariesValue(
      record.campusMemberships,
    ),
  };
}

function parseLoginResponseValue(value: unknown): LoginResponse {
  const record = requireRecord(value);
  return {
    ...parseTokenPairValue(record),
    user: parseCurrentUserValue(record.user),
  };
}

function parseFcmTokenRegisterResponseValue(
  value: unknown,
): FcmTokenRegisterResponse {
  const record = requireRecord(value);
  return {
    tokenId: requirePositiveId(record.tokenId),
    deviceType: requireEnum(record.deviceType, FCM_DEVICE_TYPES),
    clientInstanceId: requireString(record.clientInstanceId, 512),
    appVersion: requireString(record.appVersion, 128),
    isActive: requireBoolean(record.isActive),
    lastSeenAt: requireIsoDateTime(record.lastSeenAt),
    lastRefreshedAt: requireIsoDateTime(record.lastRefreshedAt),
  };
}

function parseSignupResponseValue(value: unknown): SignupResponse {
  const record = requireRecord(value);
  return {
    id: requirePositiveId(record.id),
    name: requireString(record.name, 200),
    email: requireString(record.email, 320),
    role: requireEnum(record.role, USER_ROLES),
    isActive: requireBoolean(record.isActive),
  };
}

export function parseTokenPair(value: unknown): TokenPair {
  return parseSafely(() => parseTokenPairValue(value));
}

export function parseLoginResponse(value: unknown): LoginResponse {
  return parseSafely(() => parseLoginResponseValue(value));
}

export function parseCurrentUser(value: unknown): CurrentUser {
  return parseSafely(() => parseCurrentUserValue(value));
}

export function parseCampusMembershipSummary(
  value: unknown,
): CampusMembershipSummary {
  return parseSafely(() => parseCampusMembershipSummaryValue(value));
}

export function parseCampusMembershipSummaries(
  value: unknown,
): CampusMembershipSummary[] {
  return parseSafely(() => parseCampusMembershipSummariesValue(value));
}

export function parseFcmTokenRegisterResponse(
  value: unknown,
): FcmTokenRegisterResponse {
  return parseSafely(() => parseFcmTokenRegisterResponseValue(value));
}

export function parseSignupResponse(value: unknown): SignupResponse {
  return parseSafely(() => parseSignupResponseValue(value));
}
