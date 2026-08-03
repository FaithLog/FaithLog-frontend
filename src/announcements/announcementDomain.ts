import {FaithLogApiError} from '../api/apiError';
import type {
  AnnouncementCategory,
  AnnouncementDetail,
  AnnouncementStatus,
  AnnouncementSummary,
} from './announcementTypes';
import type {
  MediaAccessUrl,
  MediaAssetCompletion,
  MediaAssetIdentity,
  MediaAssetReady,
  MediaUploadContentType,
  MediaUploadReservation,
} from './announcementTypes';

const statuses = new Set<AnnouncementStatus>(['ARCHIVED', 'PUBLISHED', 'SCHEDULED']);
const colorPattern = /^#[0-9A-F]{6}$/i;

export function parseAnnouncementList(value: unknown): AnnouncementSummary[] {
  if (!Array.isArray(value)) invalid();
  return value.map(parseAnnouncementDetail);
}

export function parseAnnouncementDetail(value: unknown): AnnouncementDetail {
  if (!isRecord(value)) invalid();
  const category = parseCategory(value.category);
  const imageAssetIds = positiveIdArray(value.imageAssetIds);
  if (new Set(imageAssetIds).size !== imageAssetIds.length) invalid();
  const status = value.status;
  if (typeof status !== 'string' || !statuses.has(status as AnnouncementStatus)) invalid();
  return {
    body: requiredString(value.body),
    campusId: positiveId(value.campusId),
    category,
    id: positiveId(value.id),
    imageAssetIds,
    pinned: requiredBoolean(value.pinned),
    publishAt: nullableIso(value.publishAt),
    publishedAt: nullableIso(value.publishedAt),
    status: status as AnnouncementStatus,
    title: requiredString(value.title),
  };
}

export function parseAnnouncementCategories(value: unknown): AnnouncementCategory[] {
  if (!Array.isArray(value)) invalid();
  return value.map(parseCategory);
}

export function getAnnouncementCategoryName(value: Pick<AnnouncementSummary, 'category'>) {
  return value.category.name;
}

export function dedupeOrderedImageAssetIds(ids: readonly number[]) {
  const seen = new Set<number>();
  return ids.filter((id) => {
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function parseMediaUploadReservation(value: unknown): MediaUploadReservation {
  if (!isRecord(value) || !isRecord(value.requiredHeaders)) invalid();
  const requiredHeaders: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value.requiredHeaders)) {
    if (!key.trim() || typeof headerValue !== 'string' || !headerValue.trim()) invalid();
    requiredHeaders[key] = headerValue;
  }
  return {
    assetId: positiveId(value.assetId),
    expiresAt: requiredIso(value.expiresAt),
    requiredHeaders,
    uploadUrl: requiredHttps(value.uploadUrl),
  };
}

export function parseMediaAssetReady(value: unknown): MediaAssetReady {
  const completion = parseMediaAssetCompletionValue(value);
  if (completion.status !== 'READY') invalid();
  return completion;
}

export function parseMediaAssetCompletion(
  value: unknown,
  expected: MediaAssetIdentity,
): MediaAssetCompletion {
  const completion = parseMediaAssetCompletionValue(value);
  if (
    completion.assetId !== expected.assetId ||
    completion.byteSize !== expected.byteSize ||
    completion.contentType !== expected.contentType ||
    completion.sha256.toLowerCase() !== expected.sha256.toLowerCase()
  ) {
    invalid();
  }
  return completion;
}

export function parseMediaAccessUrls(value: unknown, expectedIds: number[]): MediaAccessUrl[] {
  if (!isRecord(value) || !Array.isArray(value.assets)) invalid();
  const expectedIndexById = new Map<number, number>();
  expectedIds.forEach((assetId, index) => {
    const parsedAssetId = positiveId(assetId);
    if (expectedIndexById.has(parsedAssetId)) invalid();
    expectedIndexById.set(parsedAssetId, index);
  });
  const assets = value.assets.map((item) => {
    if (!isRecord(item)) invalid();
    return {assetId: positiveId(item.assetId), detailUrl: requiredHttps(item.detailUrl), expiresAt: requiredIso(item.expiresAt), thumbnailUrl: requiredHttps(item.thumbnailUrl)};
  });
  let previousExpectedIndex = -1;
  for (const asset of assets) {
    const expectedIndex = expectedIndexById.get(asset.assetId);
    if (expectedIndex === undefined || expectedIndex <= previousExpectedIndex) invalid();
    previousExpectedIndex = expectedIndex;
  }
  return assets;
}

function parseCategory(value: unknown): AnnouncementCategory {
  if (!isRecord(value)) invalid();
  const color = requiredString(value.color);
  if (!colorPattern.test(color)) invalid();
  const sortOrder = value.sortOrder;
  if (typeof sortOrder !== 'number' || !Number.isSafeInteger(sortOrder) || sortOrder < 0) invalid();
  return {
    color: color.toUpperCase(),
    id: positiveId(value.id),
    isActive: requiredBoolean(value.isActive),
    name: requiredString(value.name),
    sortOrder,
  };
}

function parseMediaAssetCompletionValue(value: unknown): MediaAssetCompletion {
  if (!isRecord(value) || (value.status !== 'PROCESSING' && value.status !== 'READY')) invalid();
  const contentType = mediaUploadContentType(value.contentType);
  const byteSize = value.byteSize;
  if (typeof byteSize !== 'number' || !Number.isSafeInteger(byteSize) || byteSize <= 0) invalid();
  const sha256 = requiredString(value.sha256);
  if (!/^[a-f0-9]{64}$/i.test(sha256)) invalid();
  return {
    assetId: positiveId(value.assetId),
    byteSize,
    contentType,
    sha256,
    status: value.status,
  };
}

function mediaUploadContentType(value: unknown): MediaUploadContentType {
  if (value !== 'image/jpeg' && value !== 'image/png') invalid();
  return value;
}

function positiveIdArray(value: unknown) {
  if (!Array.isArray(value)) invalid();
  return value.map(positiveId);
}

function positiveId(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) invalid();
  return value;
}

function requiredBoolean(value: unknown) {
  if (typeof value !== 'boolean') invalid();
  return value;
}

function requiredString(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) invalid();
  return value;
}

function nullableIso(value: unknown) {
  if (value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) invalid();
  return value;
}

function requiredIso(value: unknown) {
  const parsed = nullableIso(value);
  if (parsed === null) invalid();
  return parsed;
}

function requiredHttps(value: unknown) {
  const stringValue = requiredString(value);
  try {
    const url = new URL(stringValue);
    if (url.protocol !== 'https:' || url.username || url.password) invalid();
    return url.toString();
  } catch {
    invalid();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalid(): never {
  throw new FaithLogApiError({
    kind: 'error',
    code: 'INVALID_SERVER_RESPONSE',
    message: '서버 응답을 확인할 수 없습니다.',
  });
}
