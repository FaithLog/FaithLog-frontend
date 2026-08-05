import {apiRequest, toPositiveIntegerPathSegment} from '../api/client';
import {FaithLogApiError} from '../api/apiError';
import {normalizeWeekStartDate} from './weeklyMaterialDate';
import {
  type WeeklyMaterial,
  type WeeklyMaterialType,
  type WeeklyMaterialWeek,
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

export type WeeklyMaterialContractStatus = 'confirmed-test' | 'pending';

export type WeeklyMaterialApi = {
  getWeek(token: string, campusId: number, weekStartDate: string): Promise<WeeklyMaterialWeek>;
  getCurrentWeek(token: string, campusId: number): Promise<WeeklyMaterialWeek>;
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
  contractStatus: 'pending',
  request: ((path, options) =>
    (apiRequest as unknown as WeeklyMaterialRequest)(path, options)) as WeeklyMaterialRequest,
});

export function parseWeeklyMaterialWeek(
  value: unknown,
  expected: {campusId: number; weekStartDate?: string},
): WeeklyMaterialWeek {
  const record = requireRecord(value);
  const campusId = requirePositiveInteger(record.campusId);
  const weekStartDate = normalizeServerWeek(record.weekStartDate);
  if (
    campusId !== expected.campusId ||
    (expected.weekStartDate !== undefined && weekStartDate !== expected.weekStartDate)
  ) {
    return invalidResponse();
  }
  if (!Array.isArray(record.materials) || record.materials.length > 2) {
    return invalidResponse();
  }
  const materials = record.materials.map(parseWeeklyMaterial);
  const seen = new Set<WeeklyMaterialType>();
  for (const material of materials) {
    if (seen.has(material.materialType)) return invalidResponse();
    seen.add(material.materialType);
  }
  return {campusId, weekStartDate, materials};
}

function parseWeeklyMaterial(value: unknown): WeeklyMaterial {
  const record = requireRecord(value);
  return {
    materialType: normalizeMaterialType(record.materialType),
    mediaAssetId: requirePositiveInteger(record.mediaAssetId),
    fileName: requirePdfFileName(record.fileName),
    byteSize: requirePositiveInteger(record.byteSize),
    sha256: requireSha256(record.sha256),
    updatedAt: requireDateTime(record.updatedAt),
    uploadedByName: requireDisplayName(record.uploadedByName),
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

function requireDisplayName(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 100) {
    return invalidResponse();
  }
  return value.trim();
}

function invalidResponse(): never {
  throw new FaithLogApiError({
    kind: 'error',
    code: 'INVALID_SERVER_RESPONSE',
    message: '주간 자료 응답을 확인할 수 없습니다.',
  });
}
