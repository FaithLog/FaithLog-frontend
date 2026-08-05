import {FaithLogApiError} from '../api/apiError';
import type {
  AnnouncementCategory,
  AnnouncementDetail,
  AnnouncementStatus,
  AnnouncementSummary,
} from './announcementTypes';
import {dedupeOrderedDocumentAssetIds} from '../media/pdfAttachmentPolicy';
import type {
  MediaAccessUrl,
  MediaAssetCompletion,
  MediaAssetIdentity,
  MediaUploadReservation,
} from './announcementTypes';

const statuses = new Set<AnnouncementStatus>(['ARCHIVED', 'PUBLISHED', 'SCHEDULED']);
const colorPattern = /^#[0-9A-F]{6}$/i;

export function parseAnnouncementList(value: unknown): AnnouncementSummary[] {
  if (!Array.isArray(value)) invalid();
  return value.map((item) => parseAnnouncementDetail(item));
}

export function parseAnnouncementPage(
  value: unknown,
  expected: {campusId: number; page: number; size: number; status: AnnouncementStatus},
) {
  if (!isRecord(value) || !Array.isArray(value.content)) invalid();
  const page = nonNegativeInteger(value.page);
  const size = positiveId(value.size);
  const totalElements = nonNegativeInteger(value.totalElements);
  const totalPages = nonNegativeInteger(value.totalPages);
  const remainingElements = Math.max(0, totalElements - page * size);
  const expectedContentLength = Math.min(size, remainingElements);
  if (
    page !== expected.page ||
    size !== expected.size ||
    totalPages !== (totalElements === 0 ? 0 : Math.ceil(totalElements / size)) ||
    (totalPages === 0 ? page !== 0 || value.content.length !== 0 : page >= totalPages) ||
    value.content.length !== expectedContentLength
  ) invalid();
  const content = value.content.map((item) => parseAnnouncementDetail(item, {
    campusId: expected.campusId,
    status: expected.status,
  }));
  return {content, page, size, totalElements, totalPages};
}

export function parseAnnouncementDetail(
  value: unknown,
  expected: {campusId?: number; id?: number; status?: AnnouncementStatus} = {},
): AnnouncementDetail {
  if (!isRecord(value)) invalid();
  const campusId = positiveId(value.campusId);
  const id = positiveId(value.id);
  const category = parseCategory(value.category, campusId);
  const imageAssetIds = positiveIdArray(value.imageAssetIds);
  if (new Set(imageAssetIds).size !== imageAssetIds.length) invalid();
  const documentAssetIds = value.documentAssetIds === undefined
    ? []
    : positiveIdArray(value.documentAssetIds);
  if (dedupeOrderedDocumentAssetIds(documentAssetIds).length !== documentAssetIds.length) invalid();
  const attachmentCount = value.attachmentCount === undefined
    ? imageAssetIds.length + documentAssetIds.length
    : nonNegativeInteger(value.attachmentCount);
  const hasAttachments = value.hasAttachments === undefined
    ? attachmentCount > 0
    : requiredBoolean(value.hasAttachments);
  if (hasAttachments !== (attachmentCount > 0)) invalid();
  const status = value.status;
  if (typeof status !== 'string' || !statuses.has(status as AnnouncementStatus)) invalid();
  if (
    expected.campusId !== undefined && campusId !== expected.campusId ||
    expected.id !== undefined && id !== expected.id ||
    expected.status !== undefined && status !== expected.status
  ) invalid();
  return {
    body: requiredString(value.content),
    attachmentCount,
    campusId,
    category,
    documentAssetIds,
    hasAttachments,
    id,
    imageAssetIds,
    pinned: requiredBoolean(value.isPinned),
    publishAt: nullableIso(value.publishAt),
    publishedAt: nullableIso(value.publishedAt),
    status: status as AnnouncementStatus,
    title: requiredString(value.title),
  };
}

export function parseAnnouncementCategories(
  value: unknown,
  expectedCampusId?: number,
): AnnouncementCategory[] {
  if (!Array.isArray(value)) invalid();
  return value.map((item) => parseCategory(item, expectedCampusId));
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

export function parseMediaAssetCompletion(
  value: unknown,
  expected: MediaAssetIdentity,
  expectedCampusId?: number,
): MediaAssetCompletion {
  if (!isRecord(value) || value.status !== 'READY') invalid();
  const assetId = positiveId(value.assetId);
  const campusId = positiveId(value.campusId);
  const byteSize = positiveId(value.byteSize);
  const width = positiveId(value.width);
  const height = positiveId(value.height);
  const sha256 = requiredString(value.sha256);
  if (
    assetId !== expected.assetId ||
    expectedCampusId !== undefined && campusId !== expectedCampusId ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    width > 4096 ||
    height > 4096 ||
    byteSize > 2 * 5 * 1024 * 1024
  ) {
    invalid();
  }
  return {...expected, status: 'READY'};
}

export function parseMediaAccessUrls(value: unknown, expectedIds: number[]): MediaAccessUrl[] {
  if (!Array.isArray(value)) invalid();
  const expectedIndexById = new Map<number, number>();
  expectedIds.forEach((assetId, index) => {
    const parsedAssetId = positiveId(assetId);
    if (expectedIndexById.has(parsedAssetId)) invalid();
    expectedIndexById.set(parsedAssetId, index);
  });
  const assets = value.map((item) => {
    if (!isRecord(item)) invalid();
    const sha256 = requiredString(item.sha256);
    if (!/^[a-f0-9]{64}$/.test(sha256)) invalid();
    return {assetId: positiveId(item.assetId), detailUrl: requiredHttps(item.detailUrl), expiresAt: requiredIso(item.expiresAt), sha256, thumbnailUrl: requiredHttps(item.thumbnailUrl)};
  });
  if (assets.length !== expectedIds.length) invalid();
  let previousExpectedIndex = -1;
  for (const asset of assets) {
    const expectedIndex = expectedIndexById.get(asset.assetId);
    if (expectedIndex === undefined || expectedIndex <= previousExpectedIndex) invalid();
    previousExpectedIndex = expectedIndex;
  }
  return assets;
}

function parseCategory(value: unknown, expectedCampusId?: number): AnnouncementCategory {
  if (!isRecord(value)) invalid();
  const campusId = positiveId(value.campusId);
  if (expectedCampusId !== undefined && campusId !== expectedCampusId) invalid();
  const color = requiredString(value.color);
  if (!colorPattern.test(color)) invalid();
  const sortOrder = value.displayOrder;
  if (typeof sortOrder !== 'number' || !Number.isSafeInteger(sortOrder) || sortOrder < 0) invalid();
  return {
    color: color.toUpperCase(),
    id: positiveId(value.id),
    isActive: requiredBoolean(value.isActive),
    name: requiredString(value.name),
    sortOrder,
  };
}

function positiveIdArray(value: unknown) {
  if (!Array.isArray(value)) invalid();
  return value.map(positiveId);
}

function positiveId(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) invalid();
  return value;
}

function nonNegativeInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid();
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
