import {apiRequest, toPositiveIntegerPathSegment} from '../api/client';
import {FaithLogApiError} from '../api/apiError';
import type {
  MediaAccessUrl,
  MediaAssetCompletion,
  MediaUploadReservation,
  MediaUploadReservationRequest,
} from './mediaTypes';

type MediaRequestOptions<T> = {
  accessToken: string;
  body?: unknown;
  expectedStatuses?: readonly number[];
  method: 'POST';
  responseParser: (value: unknown) => T;
};

type MediaRequest = <T>(path: string, options: MediaRequestOptions<T>) => Promise<T>;

export type MediaApi = {
  reserve(
    accessToken: string,
    campusId: number,
    body: MediaUploadReservationRequest,
  ): Promise<MediaUploadReservation>;
  complete(accessToken: string, campusId: number, assetId: number): Promise<MediaAssetCompletion>;
  getAccessUrls(
    accessToken: string,
    campusId: number,
    assetIds: number[],
  ): Promise<MediaAccessUrl[]>;
};

export function createMediaApi({request}: {request: MediaRequest}): MediaApi {
  return {
    reserve(accessToken, campusId, body) {
      const normalizedBody = parseReservationRequest(body);
      return request(buildAdminMediaPath(campusId, 'upload-reservations'), {
        accessToken,
        body: normalizedBody,
        method: 'POST',
        responseParser: parseMediaUploadReservation,
      });
    },
    complete(accessToken, campusId, assetId) {
      return request(
        buildAdminMediaPath(campusId, toId(assetId, 'assetId'), 'complete'),
        {
          accessToken,
          method: 'POST',
          responseParser: (value) => parseMediaAssetCompletion(value, assetId),
        },
      );
    },
    async getAccessUrls(accessToken, campusId, assetIds) {
      const chunks = chunkMediaAssetIds(assetIds);
      const results: MediaAccessUrl[] = [];
      for (const chunk of chunks) {
        const response = await request(
          buildCampusMediaPath(campusId, 'access-urls'),
          {
            accessToken,
            body: {assetIds: chunk},
            method: 'POST',
            responseParser: (value) => parseMediaAccessUrls(value, chunk),
          },
        );
        results.push(...response);
      }
      return results;
    },
  };
}

export function createProductionMediaApi() {
  return createMediaApi({request: apiRequest as MediaRequest});
}

export const mediaApi = createProductionMediaApi();

export function chunkMediaAssetIds(assetIds: number[]) {
  const uniqueIds: number[] = [];
  const seen = new Set<number>();
  for (const assetId of assetIds) {
    const normalized = Number(toPositiveIntegerPathSegment(assetId, 'assetId'));
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueIds.push(normalized);
    }
  }
  const chunks: number[][] = [];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    chunks.push(uniqueIds.slice(index, index + 100));
  }
  return chunks;
}

function parseReservationRequest(value: MediaUploadReservationRequest) {
  if (
    (value.contentType !== 'image/jpeg' && value.contentType !== 'image/png') ||
    !Number.isSafeInteger(value.byteSize) || value.byteSize <= 0 ||
    !/^[a-f0-9]{64}$/i.test(value.sha256)
  ) {
    throw new FaithLogApiError({kind: 'error', message: '업로드할 이미지 정보가 올바르지 않습니다.'});
  }
  return value;
}

function parseMediaUploadReservation(value: unknown): MediaUploadReservation {
  const record = requireRecord(value);
  const requiredHeadersRecord = requireRecord(record.requiredHeaders);
  const requiredHeaders: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(requiredHeadersRecord)) {
    if (typeof headerValue !== 'string' || key.trim() === '') return invalidResponse();
    requiredHeaders[key] = headerValue;
  }
  return {
    assetId: requirePositiveId(record.assetId),
    uploadUrl: requireHttpsUrl(record.uploadUrl),
    requiredHeaders,
    expiresAt: requireDateTime(record.expiresAt),
  };
}

function parseMediaAssetCompletion(
  value: unknown,
  expectedAssetId: number,
): MediaAssetCompletion {
  const record = requireRecord(value);
  const assetId = requirePositiveId(record.assetId);
  if (assetId !== expectedAssetId) return invalidResponse();
  if (record.status === 'PROCESSING') {
    return {
      assetId,
      status: 'PROCESSING',
      ...(record.retryAfterMs === undefined
        ? {}
        : {retryAfterMs: requireNonNegativeInteger(record.retryAfterMs)}),
    };
  }
  if (record.status !== 'READY') return invalidResponse();
  const sha256 = typeof record.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(record.sha256)
    ? record.sha256
    : invalidResponse();
  return {
    assetId,
    status: 'READY',
    sha256,
    byteSize: requirePositiveId(record.byteSize),
    width: requirePositiveId(record.width),
    height: requirePositiveId(record.height),
  };
}

function parseMediaAccessUrls(value: unknown, requestedIds: number[]) {
  const record = requireRecord(value);
  if (!Array.isArray(record.assets) || record.assets.length !== requestedIds.length) {
    return invalidResponse();
  }
  return record.assets.map((asset, index): MediaAccessUrl => {
    const item = requireRecord(asset);
    const assetId = requirePositiveId(item.assetId);
    if (assetId !== requestedIds[index]) return invalidResponse();
    return {
      assetId,
      thumbnailUrl: requireHttpsUrl(item.thumbnailUrl),
      detailUrl: requireHttpsUrl(item.detailUrl),
      expiresAt: requireDateTime(item.expiresAt),
    };
  });
}

function buildAdminMediaPath(campusId: number, ...segments: string[]) {
  return `/api/v1/admin/campuses/${toId(campusId, 'campusId')}/media-assets/${segments.join('/')}`;
}

function buildCampusMediaPath(campusId: number, ...segments: string[]) {
  return `/api/v1/campuses/${toId(campusId, 'campusId')}/media-assets/${segments.join('/')}`;
}

function toId(value: number, name: string) {
  return toPositiveIntegerPathSegment(value, name);
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidResponse();
  return value as Record<string, unknown>;
}

function requirePositiveId(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return invalidResponse();
  return value;
}

function requireNonNegativeInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalidResponse();
  return value;
}

function requireHttpsUrl(value: unknown) {
  if (typeof value !== 'string') return invalidResponse();
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return invalidResponse();
    return value;
  } catch {
    return invalidResponse();
  }
}

function requireDateTime(value: unknown) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return invalidResponse();
  return value;
}

function invalidResponse(): never {
  throw new FaithLogApiError({kind: 'error', code: 'INVALID_SERVER_RESPONSE', message: '서버 응답 형식이 올바르지 않습니다.'});
}
