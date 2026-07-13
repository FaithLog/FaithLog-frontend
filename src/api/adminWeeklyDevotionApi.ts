import {FaithLogApiError} from './apiError';
import {authenticatedTransportRequest} from './client';
import type {ChargeStatus} from './types';
import type {AuthSessionGeneration} from './tokenStorage';

export const ADMIN_WEEKLY_DEVOTION_CONTRACT_STATUS = 'pending' as const;

export type AdminWeeklyDevotionDailyCheck = {
  bibleReading: boolean;
  prayer: boolean;
  quietTime: boolean;
  recordDate: string;
};

export type AdminWeeklyDevotionPenalty = {
  amount: number;
  chargeItemId: number;
  status: ChargeStatus;
};

export type AdminWeeklyDevotionSubmittedMember = {
  bibleReadingCount: number;
  dailyChecks: AdminWeeklyDevotionDailyCheck[];
  email: string;
  name: string;
  penalty: AdminWeeklyDevotionPenalty | null;
  prayerCount: number;
  quietTimeCount: number;
  saturdayLateMinutes: number;
  submittedAt: string;
  userId: number;
};

export type AdminWeeklyDevotionMissingMember = {
  email: string;
  name: string;
  userId: number;
};

export type AdminWeeklyDevotion = {
  activeMemberCount: number;
  missingCount: number;
  missingMembers: AdminWeeklyDevotionMissingMember[];
  submittedCount: number;
  submittedMembers: AdminWeeklyDevotionSubmittedMember[];
  totalPenaltyAmount: number;
  weekEndDate: string;
  weekStartDate: string;
};

export type AdminWeeklyDevotionRequest = {
  accessToken: string;
  authGeneration: number;
  campusId: number;
  weekStartDate: string;
};

export type AdminWeeklyDevotionExport = {
  bytes: Uint8Array;
  fileName: string;
};

export type AdminWeeklyDevotionAdapter = {
  exportWeek: (
    request: AdminWeeklyDevotionRequest,
  ) => Promise<AdminWeeklyDevotionExport>;
  fetchWeek: (request: AdminWeeklyDevotionRequest) => Promise<AdminWeeklyDevotion>;
};

type TransportOptions = {
  apiBaseUrl: string;
  contractConfirmed: boolean;
  fetchImpl?: FetchImplementation;
};

type ProductionAdapterOptions = {
  fetchImpl?: FetchImplementation;
};

type FetchImplementation = (input: string, init?: RequestInit) => Promise<Response>;

type UnknownRecord = Record<string, unknown>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CHARGE_STATUSES = new Set<ChargeStatus>([
  'UNPAID',
  'PAID',
  'WAIVED',
  'CANCELED',
]);

export function parseAdminWeeklyDevotion(value: unknown): AdminWeeklyDevotion {
  try {
    const record = requireRecord(value);
    const weekStartDate = requireMonday(record.weekStartDate, 'weekStartDate');
    const weekEndDate = requireDate(record.weekEndDate, 'weekEndDate');
    const submittedMembers = requireArray(
      record.submittedMembers,
      parseSubmittedMember,
    );
    const missingMembers = requireArray(record.missingMembers, parseMissingMember);
    const submittedCount = requireNonNegativeInteger(
      record.submittedCount,
      'submittedCount',
    );
    const missingCount = requireNonNegativeInteger(record.missingCount, 'missingCount');
    const activeMemberCount = requireNonNegativeInteger(
      record.activeMemberCount,
      'activeMemberCount',
    );

    if (
      weekEndDate !== addDays(weekStartDate, 6) ||
      submittedCount !== submittedMembers.length ||
      missingCount !== missingMembers.length ||
      activeMemberCount !== submittedCount + missingCount
    ) {
      throw new Error('Inconsistent weekly devotion response');
    }

    assertUniqueMemberIds(submittedMembers, missingMembers);

    for (const member of submittedMembers) {
      const seenDates = new Set<string>();
      for (const check of member.dailyChecks) {
        if (check.recordDate < weekStartDate || check.recordDate > weekEndDate) {
          throw new Error('Daily check outside selected week');
        }
        if (seenDates.has(check.recordDate)) {
          throw new Error('Duplicate daily check');
        }
        seenDates.add(check.recordDate);
      }
    }

    return {
      activeMemberCount,
      missingCount,
      missingMembers,
      submittedCount,
      submittedMembers,
      totalPenaltyAmount: requireNonNegativeInteger(
        record.totalPenaltyAmount,
        'totalPenaltyAmount',
      ),
      weekEndDate,
      weekStartDate,
    };
  } catch {
    throw invalidServerResponse();
  }
}

export function createMockAdminWeeklyDevotionAdapter(): AdminWeeklyDevotionAdapter {
  return {
    exportWeek: (request) =>
      authenticateRequest(request, async () => {
        resolveMockScenario(request.authGeneration);
        return {
          bytes: new Uint8Array([80, 75, 3, 4]),
          fileName: `faithlog-devotion-${request.campusId}-${request.weekStartDate}.xlsx`,
        };
      }),
    fetchWeek: (request) =>
      authenticateRequest(request, async () => {
        const scenario = resolveMockScenario(request.authGeneration);
        const value =
          scenario === 'empty'
            ? createEmptyMockWeek(request.weekStartDate)
            : createSuccessMockWeek(request.weekStartDate);
        return parseRequestedWeek(value, request.weekStartDate);
      }),
  };
}

export function createProductionAdminWeeklyDevotionAdapter(
  options: ProductionAdapterOptions = {},
): AdminWeeklyDevotionAdapter {
  return createProvisionalAdminWeeklyDevotionTransport({
    apiBaseUrl: 'https://contract-pending.invalid',
    contractConfirmed: false,
    ...(options.fetchImpl ? {fetchImpl: options.fetchImpl} : {}),
  });
}

export function createProvisionalAdminWeeklyDevotionTransport({
  apiBaseUrl,
  contractConfirmed,
  fetchImpl = (input, init) => fetch(input, init),
}: TransportOptions): AdminWeeklyDevotionAdapter {
  const assertConfirmed = () => {
    if (!contractConfirmed) {
      throw contractPendingError();
    }
  };

  return {
    exportWeek: async (request) => {
      assertConfirmed();
      return authenticateRequest(request, async (accessToken) => {
        const path = buildProvisionalPath(request, 'export');
        const response = await fetchImpl(`${normalizeBaseUrl(apiBaseUrl)}${path}`, {
          headers: {
            Accept: CONTENT_TYPE,
            Authorization: `Bearer ${accessToken}`,
          },
          method: 'GET',
        });
        assertResponseStatus(response, request.authGeneration);

        if (
          response.headers.get('Content-Type')?.split(';')[0]?.trim() !==
          CONTENT_TYPE
        ) {
          throw invalidServerResponse(response.status);
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length === 0) {
          throw invalidServerResponse(response.status);
        }

        return {
          bytes,
          fileName:
            getAttachmentFileName(response.headers.get('Content-Disposition')) ??
            `faithlog-devotion-${request.campusId}-${request.weekStartDate}.xlsx`,
        };
      });
    },
    fetchWeek: async (request) => {
      assertConfirmed();
      return authenticateRequest(request, async (accessToken) => {
        const path = buildProvisionalPath(request, 'members');
        const response = await fetchImpl(`${normalizeBaseUrl(apiBaseUrl)}${path}`, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          method: 'GET',
        });
        assertResponseStatus(response, request.authGeneration);
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw invalidServerResponse(response.status);
        }
        const data = unwrapPossibleEnvelope(payload);
        return parseRequestedWeek(data, request.weekStartDate);
      });
    },
  };
}

function parseSubmittedMember(value: unknown): AdminWeeklyDevotionSubmittedMember {
  const record = requireRecord(value);
  return {
    bibleReadingCount: requireWeeklyCount(
      record.bibleReadingCount,
      'bibleReadingCount',
    ),
    dailyChecks: requireArray(record.dailyChecks, parseDailyCheck, 7),
    email: requireString(record.email, 'email'),
    name: requireString(record.name, 'name'),
    penalty: record.penalty === null ? null : parsePenalty(record.penalty),
    prayerCount: requireWeeklyCount(record.prayerCount, 'prayerCount'),
    quietTimeCount: requireWeeklyCount(
      record.quietTimeCount,
      'quietTimeCount',
    ),
    saturdayLateMinutes: requireNonNegativeInteger(
      record.saturdayLateMinutes,
      'saturdayLateMinutes',
    ),
    submittedAt: requireDateTime(record.submittedAt, 'submittedAt'),
    userId: requirePositiveInteger(record.userId, 'userId'),
  };
}

function parseDailyCheck(value: unknown): AdminWeeklyDevotionDailyCheck {
  const record = requireRecord(value);
  return {
    bibleReading: requireBoolean(record.bibleReading, 'bibleReading'),
    prayer: requireBoolean(record.prayer, 'prayer'),
    quietTime: requireBoolean(record.quietTime, 'quietTime'),
    recordDate: requireDate(record.recordDate, 'recordDate'),
  };
}

function parsePenalty(value: unknown): AdminWeeklyDevotionPenalty {
  const record = requireRecord(value);
  const status = record.status;
  if (typeof status !== 'string' || !CHARGE_STATUSES.has(status as ChargeStatus)) {
    throw new Error('Invalid penalty status');
  }

  return {
    amount: requireNonNegativeInteger(record.amount, 'amount'),
    chargeItemId: requirePositiveInteger(record.chargeItemId, 'chargeItemId'),
    status: status as ChargeStatus,
  };
}

function parseMissingMember(value: unknown): AdminWeeklyDevotionMissingMember {
  const record = requireRecord(value);
  return {
    email: requireString(record.email, 'email'),
    name: requireString(record.name, 'name'),
    userId: requirePositiveInteger(record.userId, 'userId'),
  };
}

function authenticateRequest<T>(
  request: AdminWeeklyDevotionRequest,
  execute: (effectiveAccessToken: string) => Promise<T>,
) {
  return authenticatedTransportRequest({
    accessToken: request.accessToken,
    authSessionGeneration: request.authGeneration as AuthSessionGeneration,
    execute,
  });
}

function parseRequestedWeek(value: unknown, requestedWeekStartDate: string) {
  const data = parseAdminWeeklyDevotion(value);
  if (data.weekStartDate !== requestedWeekStartDate) {
    throw invalidServerResponse();
  }
  return data;
}

function assertUniqueMemberIds(
  submittedMembers: AdminWeeklyDevotionSubmittedMember[],
  missingMembers: AdminWeeklyDevotionMissingMember[],
) {
  const submittedIds = new Set<number>();
  for (const member of submittedMembers) {
    if (submittedIds.has(member.userId)) {
      throw new Error('Duplicate submitted member');
    }
    submittedIds.add(member.userId);
  }

  const missingIds = new Set<number>();
  for (const member of missingMembers) {
    if (missingIds.has(member.userId) || submittedIds.has(member.userId)) {
      throw new Error('Duplicate or overlapping missing member');
    }
    missingIds.add(member.userId);
  }
}

function createSuccessMockWeek(weekStartDate: string): AdminWeeklyDevotion {
  return {
    activeMemberCount: 3,
    missingCount: 1,
    missingMembers: [
      {email: 'missing@example.test', name: '김미제출', userId: 3},
    ],
    submittedCount: 2,
    submittedMembers: [
      {
        bibleReadingCount: 4,
        dailyChecks: createDailyChecks(weekStartDate, 5, 4, 6),
        email: 'submitted@example.test',
        name: '홍제출',
        penalty: {amount: 2500, chargeItemId: 10, status: 'UNPAID'},
        prayerCount: 6,
        quietTimeCount: 5,
        saturdayLateMinutes: 15,
        submittedAt: `${addDays(weekStartDate, 6)}T10:00:00+09:00`,
        userId: 1,
      },
      {
        bibleReadingCount: 7,
        dailyChecks: createDailyChecks(weekStartDate, 7, 7, 7),
        email: 'paid@example.test',
        name: '박납부',
        penalty: {amount: 0, chargeItemId: 11, status: 'PAID'},
        prayerCount: 7,
        quietTimeCount: 7,
        saturdayLateMinutes: 0,
        submittedAt: `${addDays(weekStartDate, 6)}T09:00:00+09:00`,
        userId: 2,
      },
    ],
    totalPenaltyAmount: 2500,
    weekEndDate: addDays(weekStartDate, 6),
    weekStartDate,
  };
}

function createEmptyMockWeek(weekStartDate: string): AdminWeeklyDevotion {
  return {
    activeMemberCount: 0,
    missingCount: 0,
    missingMembers: [],
    submittedCount: 0,
    submittedMembers: [],
    totalPenaltyAmount: 0,
    weekEndDate: addDays(weekStartDate, 6),
    weekStartDate,
  };
}

function createDailyChecks(
  weekStartDate: string,
  quietTimeCount: number,
  bibleReadingCount: number,
  prayerCount: number,
) {
  return Array.from({length: 7}, (_, index) => ({
    bibleReading: index < bibleReadingCount,
    prayer: index < prayerCount,
    quietTime: index < quietTimeCount,
    recordDate: addDays(weekStartDate, index),
  }));
}

function resolveMockScenario(authGeneration: number) {
  const scenario =
    process.env.EXPO_PUBLIC_ADMIN_WEEKLY_DEVOTION_MOCK_SCENARIO?.trim().toLowerCase() ||
    'success';

  if (scenario === 'success' || scenario === 'empty') {
    return scenario;
  }
  if (scenario === '401') {
    throw new FaithLogApiError({
      authSessionGeneration: authGeneration,
      kind: 'sessionExpired',
      code: 'AUTH_SESSION_EXPIRED',
      message: '세션이 만료되었습니다.',
      status: 401,
    });
  }
  if (scenario === '403') {
    throw new FaithLogApiError({
      authSessionGeneration: authGeneration,
      kind: 'permissionDenied',
      code: 'AUTH_FORBIDDEN',
      message: '주차별 현황을 볼 권한이 없습니다.',
      status: 403,
    });
  }
  if (scenario === 'offline') {
    throw new FaithLogApiError({
      kind: 'offline',
      code: 'MOCK_OFFLINE',
      message: '네트워크 연결을 확인해 주세요.',
    });
  }
  throw new FaithLogApiError({
    kind: 'error',
    code: 'MOCK_ADMIN_WEEKLY_ERROR',
    message: '주차별 현황 mock 오류입니다.',
    status: 500,
  });
}

function buildProvisionalPath(
  request: AdminWeeklyDevotionRequest,
  suffix: 'export' | 'members',
) {
  const campusId = requirePositiveInteger(request.campusId, 'campusId');
  const weekStartDate = requireMonday(request.weekStartDate, 'weekStartDate');
  return `/api/v1/admin/campuses/${campusId}/devotions/weeks/${weekStartDate}/${suffix}`;
}

function assertResponseStatus(response: Response, authGeneration: number) {
  if (response.status === 401) {
    throw new FaithLogApiError({
      authSessionGeneration: authGeneration,
      kind: 'sessionExpired',
      code: 'AUTH_SESSION_EXPIRED',
      message: '세션이 만료되었습니다.',
      status: 401,
    });
  }
  if (response.status === 403) {
    throw new FaithLogApiError({
      authSessionGeneration: authGeneration,
      kind: 'permissionDenied',
      code: 'AUTH_FORBIDDEN',
      message: '주차별 현황을 볼 권한이 없습니다.',
      status: 403,
    });
  }
  if (!response.ok) {
    throw new FaithLogApiError({
      authSessionGeneration: authGeneration,
      kind: 'error',
      code: 'ADMIN_WEEKLY_DEVOTION_REQUEST_FAILED',
      message: '주차별 경건 현황을 불러오지 못했습니다.',
      status: response.status,
    });
  }
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new FaithLogApiError({
      kind: 'error',
      code: 'CONFIGURATION',
      message: 'API 서버 설정이 올바르지 않습니다.',
    });
  }
  return url.toString().replace(/\/+$/, '');
}

function unwrapPossibleEnvelope(value: unknown) {
  if (!isRecord(value)) {
    return value;
  }
  return value.success === true && 'data' in value ? value.data : value;
}

function getAttachmentFileName(value: string | null) {
  if (!value) {
    return null;
  }
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return sanitizeFileName(decodeURIComponent(encoded));
    } catch {
      return null;
    }
  }
  const plain = value.match(/filename="?([^";]+)"?/i)?.[1];
  return plain ? sanitizeFileName(plain.trim()) : null;
}

function sanitizeFileName(value: string) {
  const fileName = value.split(/[\\/]/).pop()?.trim();
  return fileName && /^[a-zA-Z0-9._-]+\.xlsx$/i.test(fileName) ? fileName : null;
}

function contractPendingError() {
  return new FaithLogApiError({
    kind: 'error',
    code: 'API_CONTRACT_PENDING',
    message: '백엔드 REST Docs 계약 확정 후 연결할 예정입니다.',
  });
}

function invalidServerResponse(status?: number) {
  return new FaithLogApiError({
    kind: 'error',
    code: 'INVALID_SERVER_RESPONSE',
    message: '서버 응답 형식이 올바르지 않습니다.',
    ...(status === undefined ? {} : {status}),
  });
}

function requireRecord(value: unknown): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error('Expected record');
  }
  return value;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireArray<T>(
  value: unknown,
  parse: (item: unknown) => T,
  maximumLength = 1000,
): T[] {
  if (!Array.isArray(value) || value.length > maximumLength) {
    throw new Error('Expected array');
  }
  return value.map(parse);
}

function requireWeeklyCount(value: unknown, label: string) {
  const count = requireNonNegativeInteger(value, label);
  if (count > 7) {
    throw new Error(`Invalid ${label}`);
  }
  return count;
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 320) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string) {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function requireDate(value: unknown, label: string) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || formatUtcDate(date) !== value) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function requireMonday(value: unknown, label: string) {
  const dateValue = requireDate(value, label);
  if (new Date(`${dateValue}T00:00:00Z`).getUTCDay() !== 1) {
    throw new Error(`Invalid ${label}`);
  }
  return dateValue;
}

function requireDateTime(value: unknown, label: string) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
