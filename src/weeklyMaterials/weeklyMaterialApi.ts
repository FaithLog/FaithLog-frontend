import {apiRequest, toPositiveIntegerPathSegment} from '../api/client';
import {FaithLogApiError} from '../api/apiError';
import {normalizeWeekStartDate} from './weeklyMaterialDate';
import {
  type WeeklyMaterial,
  type WeeklyMaterialType,
  type WeeklyMaterialWeek,
  type WeeklyMaterialYearPage,
  weeklyMaterialTypes,
} from './weeklyMaterialTypes';

type WeeklyMaterialRequestOptions<T> = {
  accessToken: string;
  body?: unknown;
  expectedStatuses?: readonly number[];
  method: 'DELETE' | 'GET' | 'PUT';
  responseParser?: (value: unknown) => T;
};

export type WeeklyMaterialRequest = <T>(
  path: string,
  options: WeeklyMaterialRequestOptions<T>,
) => Promise<T>;

export type WeeklyMaterialContractStatus = 'confirmed' | 'confirmed-test' | 'pending';

export type WeeklyMaterialApi = {
  getWeek(token: string, campusId: number, weekStartDate: string): Promise<WeeklyMaterialWeek>;
  getCurrentWeek(token: string, campusId: number): Promise<WeeklyMaterialWeek>;
  listYear(
    token: string,
    campusId: number,
    year: number,
    page?: number,
    size?: number,
  ): Promise<WeeklyMaterialYearPage>;
  putMaterial(
    token: string,
    campusId: number,
    weekStartDate: string,
    materialType: WeeklyMaterialType,
    mediaAssetId: number,
  ): Promise<WeeklyMaterialWeek>;
  deleteMaterial(
    token: string,
    campusId: number,
    weekStartDate: string,
    materialType: WeeklyMaterialType,
  ): Promise<void>;
};

export function createWeeklyMaterialApi({
  contractStatus,
  request,
}: {
  contractStatus: WeeklyMaterialContractStatus;
  request: WeeklyMaterialRequest;
}): WeeklyMaterialApi {
  const assertConfirmed = () => {
    if (contractStatus === 'pending') {
      throw new FaithLogApiError({
        kind: 'error',
        code: 'API_CONTRACT_PENDING',
        message: '주간 자료 기능을 준비하고 있습니다.',
      });
    }
  };

  return {
    async getWeek(token, campusId, weekStartDate) {
      assertConfirmed();
      const expectedCampusId = positiveId(campusId);
      const expectedWeek = normalizeWeekStartDate(weekStartDate);
      return await request(buildMemberPath(expectedCampusId, expectedWeek), {
        accessToken: token,
        method: 'GET',
        responseParser: (value) => parseWeeklyMaterialWeek(value, {
          campusId: expectedCampusId,
          weekStartDate: expectedWeek,
        }),
      });
    },
    async getCurrentWeek(token, campusId) {
      assertConfirmed();
      const expectedCampusId = positiveId(campusId);
      return await request(buildMemberPath(expectedCampusId, 'current'), {
        accessToken: token,
        method: 'GET',
        responseParser: (value) => parseWeeklyMaterialWeek(value, {
          campusId: expectedCampusId,
        }),
      });
    },
    async listYear(token, campusId, year, page = 0, size = 20) {
      assertConfirmed();
      const expectedCampusId = positiveId(campusId);
      if (!Number.isSafeInteger(year) || year < 2000 || year > 9999) invalidRequest();
      if (!Number.isSafeInteger(page) || page < 0) invalidRequest();
      if (!Number.isSafeInteger(size) || size <= 0 || size > 100) invalidRequest();
      const path = `/api/v1/campuses/${expectedCampusId}/weekly-materials?year=${year}&page=${page}&size=${size}`;
      return await request(path, {
        accessToken: token,
        method: 'GET',
        responseParser: (value) => parseWeeklyMaterialYearPage(value, {
          campusId: expectedCampusId,
          page,
          size,
          year,
        }),
      });
    },
    async putMaterial(token, campusId, weekStartDate, materialType, mediaAssetId) {
      assertConfirmed();
      const expectedCampusId = positiveId(campusId);
      const expectedWeek = normalizeWeekStartDate(weekStartDate);
      const expectedType = normalizeMaterialType(materialType);
      return await request(buildAdminPath(expectedCampusId, expectedWeek, expectedType), {
        accessToken: token,
        body: {mediaAssetId: positiveId(mediaAssetId)},
        method: 'PUT',
        responseParser: (value) => parseWeeklyMaterialWeek(value, {
          campusId: expectedCampusId,
          weekStartDate: expectedWeek,
        }),
      });
    },
    async deleteMaterial(token, campusId, weekStartDate, materialType) {
      assertConfirmed();
      await request(buildAdminPath(
        positiveId(campusId),
        normalizeWeekStartDate(weekStartDate),
        normalizeMaterialType(materialType),
      ), {
        accessToken: token,
        expectedStatuses: [204],
        method: 'DELETE',
      });
    },
  };
}

export const weeklyMaterialApi = createWeeklyMaterialApi({
  contractStatus: 'confirmed',
  request: ((path, options) =>
    (apiRequest as unknown as WeeklyMaterialRequest)(path, options)) as WeeklyMaterialRequest,
});

export function parseWeeklyMaterialWeek(
  value: unknown,
  expected: {campusId: number; weekStartDate?: string},
): WeeklyMaterialWeek {
  const record = requireRecord(value);
  const weekStartDate = normalizeServerWeek(record.weekStartDate);
  if (expected.weekStartDate !== undefined && weekStartDate !== expected.weekStartDate) {
    return invalidResponse();
  }
  const materials: WeeklyMaterial[] = [];
  const shepherdGuide = parseNullableWeeklyMaterial(record.shepherdGuide, 'SHEPHERD_GUIDE');
  const sundaySharingSheet = parseNullableWeeklyMaterial(
    record.sundaySharingSheet,
    'SUNDAY_SHARING_SHEET',
  );
  const saturdayLeaderSharingSheet = parseNullableWeeklyMaterial(
    record.saturdayLeaderSharingSheet,
    'SATURDAY_LEADER_SHARING_SHEET',
  );
  if (shepherdGuide) materials.push(shepherdGuide);
  if (sundaySharingSheet) materials.push(sundaySharingSheet);
  if (saturdayLeaderSharingSheet) materials.push(saturdayLeaderSharingSheet);
  return {campusId: expected.campusId, weekStartDate, materials};
}

export function parseWeeklyMaterialYearPage(
  value: unknown,
  expected: {campusId: number; page: number; size: number; year: number},
): WeeklyMaterialYearPage {
  const record = requireRecord(value);
  if (!Array.isArray(record.content)) return invalidResponse();
  const page = requireNonNegativeInteger(record.page);
  const size = requirePositiveInteger(record.size);
  const totalElements = requireNonNegativeInteger(record.totalElements);
  const totalPages = requireNonNegativeInteger(record.totalPages);
  if (page !== expected.page || size !== expected.size) return invalidResponse();
  if (totalPages !== (totalElements === 0 ? 0 : Math.ceil(totalElements / size))) {
    return invalidResponse();
  }
  const content = record.content.map((item) => parseWeeklyMaterialWeek(item, {
    campusId: expected.campusId,
  }));
  if (content.some((week) => Number(week.weekStartDate.slice(0, 4)) !== expected.year)) {
    return invalidResponse();
  }
  return {content, page, size, totalElements, totalPages};
}

function parseNullableWeeklyMaterial(
  value: unknown,
  expectedType: WeeklyMaterialType,
): WeeklyMaterial | null {
  if (value === null) return null;
  const record = requireRecord(value);
  const materialType = normalizeMaterialType(record.materialType);
  if (materialType !== expectedType) return invalidResponse();
  return {
    materialType,
    mediaAssetId: requirePositiveInteger(record.assetId),
    fileName: requirePdfFileName(record.originalFileName),
    byteSize: requirePositiveInteger(record.byteSize),
    sha256: requireSha256(record.sha256),
    updatedAt: requireDateTime(record.updatedAt),
  };
}

function buildMemberPath(campusId: number, week: string) {
  return `/api/v1/campuses/${campusId}/weekly-materials/${week}`;
}

function buildAdminPath(campusId: number, week: string, materialType: WeeklyMaterialType) {
  return `/api/v1/admin/campuses/${campusId}/weekly-materials/${week}/${materialType}`;
}

function positiveId(value: number) {
  return Number(toPositiveIntegerPathSegment(value, 'id'));
}

function normalizeMaterialType(value: unknown): WeeklyMaterialType {
  if (weeklyMaterialTypes.some((candidate) => candidate === value)) {
    return value as WeeklyMaterialType;
  }
  return invalidResponse();
}

function normalizeServerWeek(value: unknown) {
  if (typeof value !== 'string') return invalidResponse();
  try {
    return normalizeWeekStartDate(value);
  } catch {
    return invalidResponse();
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidResponse();
  return value as Record<string, unknown>;
}

function requirePositiveInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return invalidResponse();
  }
  return value;
}

function requireNonNegativeInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return invalidResponse();
  }
  return value;
}

function requirePdfFileName(value: unknown) {
  if (typeof value !== 'string') return invalidResponse();
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (normalized === '' || normalized.length > 255 || !/\.pdf$/i.test(normalized)) {
    return invalidResponse();
  }
  return normalized;
}

function requireSha256(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return invalidResponse();
  return value;
}

function requireDateTime(value: unknown) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return invalidResponse();
  return value;
}

function invalidRequest(): never {
  throw new FaithLogApiError({
    kind: 'error',
    code: 'GLOBAL_VALIDATION_FAILED',
    message: '주간 자료 조회 조건을 확인해 주세요.',
  });
}

function invalidResponse(): never {
  throw new FaithLogApiError({
    kind: 'error',
    code: 'INVALID_SERVER_RESPONSE',
    message: '주간 자료 응답을 확인할 수 없습니다.',
  });
}
