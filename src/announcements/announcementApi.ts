import {apiRequest, FaithLogApiError} from '../api/client';
import {isAnnouncementMockModeEnabled} from './announcementEnvironment';
import {ANNOUNCEMENT_IMAGE_MAX_BYTE_SIZE} from './announcementMedia';
import {
  dedupeOrderedImageAssetIds,
  parseAnnouncementCategories,
  parseAnnouncementDetail,
  parseAnnouncementPage,
  parseMediaAccessUrls,
  parseMediaAssetCompletion,
  parseMediaUploadReservation,
} from './announcementDomain';
import type {
  AnnouncementCategory,
  AnnouncementCategorySaveRequest,
  AnnouncementDetail,
  AnnouncementSaveRequest,
  AnnouncementStatus,
  AnnouncementSummary,
  MediaAccessUrl,
  MediaAssetCompletion,
  MediaAssetIdentity,
  MediaUploadReservation,
  MediaUploadReservationRequest,
} from './announcementTypes';

type RequestOptions<T> = {
  accessToken: string;
  body?: unknown;
  expectedStatuses?: readonly number[];
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST';
  responseParser: (value: unknown) => T;
};

export type AnnouncementRequestDispatcher = <T>(path: string, options: RequestOptions<T>) => Promise<T>;
type Dependencies = {isMockMode?: () => boolean; request?: AnnouncementRequestDispatcher};

export type AnnouncementApi = {
  archiveAnnouncement(token: string, campusId: number, announcementId: number): Promise<void>;
  completeMediaUpload(token: string, campusId: number, expected: MediaAssetIdentity): Promise<MediaAssetCompletion>;
  createAnnouncement(token: string, campusId: number, body: AnnouncementSaveRequest): Promise<AnnouncementDetail>;
  createCategory(token: string, campusId: number, body: AnnouncementCategorySaveRequest): Promise<AnnouncementCategory>;
  deactivateCategory(token: string, campusId: number, categoryId: number): Promise<void>;
  getDetail(token: string, campusId: number, announcementId: number): Promise<AnnouncementDetail>;
  getMediaAccessUrls(token: string, campusId: number, assetIds: number[]): Promise<MediaAccessUrl[]>;
  listAdmin(token: string, campusId: number, status: AnnouncementStatus): Promise<AnnouncementSummary[]>;
  listCategories(token: string, campusId: number, includeInactive: boolean): Promise<AnnouncementCategory[]>;
  listPublished(token: string, campusId: number, categoryId?: number): Promise<AnnouncementSummary[]>;
  publishAnnouncement(token: string, campusId: number, announcementId: number): Promise<AnnouncementDetail>;
  reserveMediaUpload(token: string, campusId: number, body: MediaUploadReservationRequest): Promise<MediaUploadReservation>;
  updateAnnouncement(token: string, campusId: number, announcementId: number, body: AnnouncementSaveRequest): Promise<AnnouncementDetail>;
  updateCategory(token: string, campusId: number, categoryId: number, body: AnnouncementCategorySaveRequest): Promise<AnnouncementCategory>;
};

export function createAnnouncementApi(dependencies: Dependencies = {}): AnnouncementApi {
  const mock = dependencies.isMockMode?.() ?? isAnnouncementMockModeEnabled();
  if (mock) return createMockAnnouncementApi();
  const request = dependencies.request ?? (<T>(path: string, options: RequestOptions<T>) => apiRequest<T>(path, options));
  const listAnnouncements = async (
    token: string,
    campusId: number,
    status: AnnouncementStatus,
  ) => {
    const normalizedCampusId = positiveId(campusId);
    const items: AnnouncementSummary[] = [];
    let page = 0;
    let totalPages = 1;
    while (page < totalPages) {
      const response = await request(
        `/api/v1/campuses/${normalizedCampusId}/announcements?status=${status}&page=${page}&size=100`,
        {
          accessToken: token,
          expectedStatuses: [200],
          responseParser: (value) => parseAnnouncementPage(value, {
            campusId: normalizedCampusId,
            page,
            size: 100,
            status,
          }),
        },
      );
      const knownIds = new Set(items.map((item) => item.id));
      if (response.content.some((item) => knownIds.has(item.id))) {
        invalid('공지 목록 응답을 확인할 수 없습니다.');
      }
      items.push(...response.content);
      totalPages = response.totalPages;
      page += 1;
    }
    return items;
  };
  return {
    async archiveAnnouncement(token, campusId, announcementId) {
      return request(
        `/api/v1/admin/campuses/${positiveId(campusId)}/announcements/${positiveId(announcementId)}/archive`,
        {accessToken: token, expectedStatuses: [204], method: 'POST', responseParser: parseNull},
      );
    },
    async completeMediaUpload(token, campusId, expected) {
      validateMediaIdentity(expected);
      return request(
        `/api/v1/admin/campuses/${positiveId(campusId)}/media-assets/${expected.assetId}/complete`,
        {
          accessToken: token,
          method: 'POST',
          expectedStatuses: [200],
          responseParser: (value) => parseMediaAssetCompletion(value, expected, positiveId(campusId)),
        },
      );
    },
    async createAnnouncement(token, campusId, body) {
      const normalizedCampusId = positiveId(campusId);
      return request(`/api/v1/admin/campuses/${normalizedCampusId}/announcements`, {
        accessToken: token,
        body: announcementSaveWire(body),
        expectedStatuses: [201],
        method: 'POST',
        responseParser: (value) => parseAnnouncementDetail(value, {campusId: normalizedCampusId}),
      });
    },
    async createCategory(token, campusId, body) {
      const normalizedCampusId = positiveId(campusId);
      if (body.isActive !== true) invalid('새 카테고리는 활성 상태여야 합니다.');
      return request(`/api/v1/admin/campuses/${normalizedCampusId}/announcement-categories`, {
        accessToken: token,
        body: categorySaveWire(body),
        expectedStatuses: [201],
        method: 'POST',
        responseParser: (value) => parseAnnouncementCategories([value], normalizedCampusId)[0]!,
      });
    },
    async deactivateCategory(token, campusId, categoryId) {
      return request(
        `/api/v1/admin/campuses/${positiveId(campusId)}/announcement-categories/${positiveId(categoryId)}/deactivate`,
        {accessToken: token, expectedStatuses: [204], method: 'POST', responseParser: parseNull},
      );
    },
    async getDetail(token, campusId, announcementId) {
      const normalizedCampusId = positiveId(campusId);
      const normalizedAnnouncementId = positiveId(announcementId);
      return request(`/api/v1/campuses/${normalizedCampusId}/announcements/${normalizedAnnouncementId}`, {
        accessToken: token,
        expectedStatuses: [200],
        responseParser: (value) => parseAnnouncementDetail(value, {
          campusId: normalizedCampusId,
          id: normalizedAnnouncementId,
        }),
      });
    },
    async getMediaAccessUrls(token, campusId, assetIds) {
      const ordered = exactImageIds(assetIds);
      const result: MediaAccessUrl[] = [];
      for (let offset = 0; offset < ordered.length; offset += 100) {
        const chunk = ordered.slice(offset, offset + 100);
        const assets = await request(
          `/api/v1/campuses/${positiveId(campusId)}/media-assets/access-urls`,
          {accessToken: token, body: {assetIds: chunk}, expectedStatuses: [200], method: 'POST', responseParser: (value) => parseMediaAccessUrls(value, chunk)},
        );
        result.push(...assets);
      }
      return result;
    },
    async listAdmin(token, campusId, status) {
      return listAnnouncements(token, campusId, status);
    },
    async listCategories(token, campusId, includeInactive) {
      const normalizedCampusId = positiveId(campusId);
      const categories = await request(
        `/api/v1/campuses/${normalizedCampusId}/announcement-categories`,
        {
          accessToken: token,
          expectedStatuses: [200],
          responseParser: (value) => parseAnnouncementCategories(value, normalizedCampusId),
        },
      );
      return includeInactive ? categories : categories.filter((item) => item.isActive);
    },
    async listPublished(token, campusId, categoryId) {
      const items = await listAnnouncements(token, campusId, 'PUBLISHED');
      if (categoryId === undefined) return items;
      const normalizedCategoryId = positiveId(categoryId);
      return items.filter((item) => item.category.id === normalizedCategoryId);
    },
    async publishAnnouncement(token, campusId, announcementId) {
      const normalizedCampusId = positiveId(campusId);
      const normalizedAnnouncementId = positiveId(announcementId);
      return request(
        `/api/v1/admin/campuses/${normalizedCampusId}/announcements/${normalizedAnnouncementId}/publish`,
        {
          accessToken: token,
          expectedStatuses: [200],
          method: 'POST',
          responseParser: (value) => parseAnnouncementDetail(value, {
            campusId: normalizedCampusId,
            id: normalizedAnnouncementId,
            status: 'PUBLISHED',
          }),
        },
      );
    },
    async reserveMediaUpload(token, campusId, body) {
      validateMediaRequest(body);
      return request(
        `/api/v1/admin/campuses/${positiveId(campusId)}/media-assets/upload-reservations`,
        {accessToken: token, body, expectedStatuses: [201], method: 'POST', responseParser: parseMediaUploadReservation},
      );
    },
    async updateAnnouncement(token, campusId, announcementId, body) {
      const normalizedCampusId = positiveId(campusId);
      const normalizedAnnouncementId = positiveId(announcementId);
      return request(`/api/v1/admin/campuses/${normalizedCampusId}/announcements/${normalizedAnnouncementId}`, {
        accessToken: token,
        body: announcementSaveWire(body),
        expectedStatuses: [200],
        method: 'PATCH',
        responseParser: (value) => parseAnnouncementDetail(value, {
          campusId: normalizedCampusId,
          id: normalizedAnnouncementId,
        }),
      });
    },
    async updateCategory(token, campusId, categoryId, body) {
      const normalizedCampusId = positiveId(campusId);
      const normalizedCategoryId = positiveId(categoryId);
      return request(
        `/api/v1/admin/campuses/${normalizedCampusId}/announcement-categories/${normalizedCategoryId}`,
        {
          accessToken: token,
          body: categorySaveWire(body),
          expectedStatuses: [200],
          method: 'PATCH',
          responseParser: (value) => {
            const category = parseAnnouncementCategories([value], normalizedCampusId)[0]!;
            if (category.id !== normalizedCategoryId) invalid('카테고리 응답을 확인할 수 없습니다.');
            return category;
          },
        },
      );
    },
  };
}

function createMockAnnouncementApi(): AnnouncementApi {
  const store = createMockStore();
  return {
    async listPublished(_token, campusId, categoryId) {
      return store.announcements.filter((item) => item.campusId === campusId && item.status === 'PUBLISHED' && (categoryId === undefined || item.category.id === categoryId)).map(parseMockAnnouncement);
    },
    async listAdmin(_token, campusId, status) {
      return store.announcements.filter((item) => item.campusId === campusId && item.status === status).map(parseMockAnnouncement);
    },
    async getDetail(_token, campusId, id) {
      const item = store.announcements.find((candidate) => candidate.campusId === campusId && candidate.id === id);
      if (!item) notFound();
      return parseMockAnnouncement(item);
    },
    async createAnnouncement(_token, campusId, body) {
      const category = getCategory(store.categories, campusId, body.categoryId);
      const now = new Date().toISOString();
      const detail: AnnouncementDetail = {
        body: required(body.body), campusId, category, id: store.nextAnnouncementId++,
        imageAssetIds: exactImageIds(body.imageAssetIds), pinned: body.pinned,
        publishAt: body.publishMode === 'SCHEDULED' ? required(body.publishAt) : now,
        publishedAt: body.publishMode === 'NOW' ? now : null,
        status: body.publishMode === 'NOW' ? 'PUBLISHED' : 'SCHEDULED', title: required(body.title),
      };
      store.announcements.unshift(detail);
      return parseMockAnnouncement(detail);
    },
    async updateAnnouncement(_token, campusId, id, body) {
      const index = store.announcements.findIndex((item) => item.campusId === campusId && item.id === id);
      if (index < 0) notFound();
      const previous = store.announcements[index];
      if (!previous) notFound();
      const now = new Date().toISOString();
      const next: AnnouncementDetail = {...previous, body: required(body.body), category: getCategory(store.categories, campusId, body.categoryId, previous.category.id === body.categoryId), imageAssetIds: exactImageIds(body.imageAssetIds), pinned: body.pinned, publishAt: body.publishMode === 'NOW' ? now : required(body.publishAt), publishedAt: body.publishMode === 'NOW' ? (previous.publishedAt ?? now) : null, status: body.publishMode === 'NOW' ? 'PUBLISHED' : 'SCHEDULED', title: required(body.title)};
      store.announcements[index] = next;
      return parseMockAnnouncement(next);
    },
    async archiveAnnouncement(_token, campusId, id) {
      const item = store.announcements.find((candidate) => candidate.campusId === campusId && candidate.id === id);
      if (!item) notFound();
      item.status = 'ARCHIVED';
      return;
    },
    async publishAnnouncement(_token, campusId, id) {
      const item = store.announcements.find((candidate) => candidate.campusId === campusId && candidate.id === id);
      if (!item) notFound();
      if (item.status !== 'SCHEDULED') {
        throw new FaithLogApiError({kind: 'conflict', code: 'ANNOUNCEMENT_STATUS_CONFLICT', message: '현재 상태에서는 공지를 게시할 수 없습니다.', status: 409});
      }
      const now = new Date().toISOString();
      item.status = 'PUBLISHED';
      item.publishAt = now;
      item.publishedAt = now;
      return parseMockAnnouncement(item);
    },
    async listCategories(_token, campusId, includeInactive) {
      return store.categories.filter((item) => item.campusId === campusId && (includeInactive || item.isActive)).map(parseMockCategory);
    },
    async createCategory(_token, campusId, body) {
      const category = sanitizeCategory(store.nextCategoryId++, campusId, body);
      assertUniqueCategory(store.categories, category);
      store.categories.push(category);
      return parseMockCategory(category);
    },
    async updateCategory(_token, campusId, id, body) {
      const index = store.categories.findIndex((item) => item.campusId === campusId && item.id === id);
      if (index < 0) notFound();
      const previous = store.categories[index]!;
      const next = sanitizeCategory(id, campusId, {...body, isActive: previous.isActive});
      assertUniqueCategory(store.categories.filter((item) => item.id !== id), next);
      store.categories[index] = next;
      store.announcements.forEach((announcement) => {
        if (announcement.campusId === campusId && announcement.category.id === id) {
          announcement.category = next;
        }
      });
      return parseMockCategory(next);
    },
    async deactivateCategory(_token, campusId, id) {
      const index = store.categories.findIndex((item) => item.campusId === campusId && item.id === id);
      if (index < 0) notFound();
      const previous = store.categories[index]!;
      const next = {...previous, isActive: false};
      store.categories[index] = next;
      store.announcements.forEach((announcement) => {
        if (announcement.campusId === campusId && announcement.category.id === id) announcement.category = next;
      });
    },
    async reserveMediaUpload(_token, campusId, body) {
      validateMediaRequest(body);
      const assetId = nextMockAssetId();
      store.assets.set(assetId, {...body, campusId, ready: false});
      return {assetId, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), requiredHeaders: {'Content-Type': body.contentType}, uploadUrl: `https://mock-upload.invalid/${assetId}`};
    },
    async completeMediaUpload(_token, campusId, expected) {
      validateMediaIdentity(expected);
      const asset = store.assets.get(expected.assetId);
      if (!asset || asset.campusId !== campusId) notFound();
      if (
        asset.byteSize !== expected.byteSize ||
        asset.contentType !== expected.contentType ||
        asset.sha256.toLowerCase() !== expected.sha256.toLowerCase()
      ) {
        throw new FaithLogApiError({
          kind: 'conflict',
          code: 'MEDIA_ASSET_LINEAGE_CONFLICT',
          message: '예약한 이미지 정보와 완료 요청이 일치하지 않습니다.',
          status: 409,
        });
      }
      asset.ready = true;
      return {
        assetId: expected.assetId,
        byteSize: asset.byteSize,
        contentType: asset.contentType,
        sha256: asset.sha256,
        status: 'READY',
      };
    },
    async getMediaAccessUrls(_token, campusId, assetIds) {
      const ordered = exactImageIds(assetIds);
      const result: MediaAccessUrl[] = [];
      for (let offset = 0; offset < ordered.length; offset += 100) {
        for (const assetId of ordered.slice(offset, offset + 100)) {
          const known = store.assets.get(assetId);
          if (known && known.campusId !== campusId) notFound();
          result.push({assetId, detailUrl: `https://mock-media.invalid/${assetId}/detail.jpg`, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), sha256: known?.sha256.toLowerCase() ?? 'a'.repeat(64), thumbnailUrl: `https://mock-media.invalid/${assetId}/thumbnail.jpg`});
        }
      }
      return result;
    },
  };
}

type StoredCategory = AnnouncementCategory & {campusId: number};
type MockStore = {
  announcements: AnnouncementDetail[];
  assets: Map<number, MediaUploadReservationRequest & {campusId: number; ready: boolean}>;
  categories: StoredCategory[];
  nextAnnouncementId: number;
  nextCategoryId: number;
};
function createMockStore(): MockStore {
  const category: StoredCategory = {campusId: 1, color: '#3182F6', id: 1, isActive: true, name: '예배', sortOrder: 1};
  return {
    announcements: [{body: '이번 주 예배 안내를 확인해 주세요.', campusId: 1, category, id: 1, imageAssetIds: [], pinned: true, publishAt: '2026-08-03T09:00:00Z', publishedAt: '2026-08-03T09:00:00Z', status: 'PUBLISHED' as const, title: '주일 예배 안내'}],
    assets: new Map<number, MediaUploadReservationRequest & {campusId: number; ready: boolean}>(),
    categories: [category], nextAnnouncementId: 100, nextCategoryId: 10,
  };
}

function exactImageIds(ids: number[]) {
  const next = dedupeOrderedImageAssetIds(ids);
  if (next.length !== ids.length) invalid('이미지 순서를 확인해 주세요.');
  return next;
}
function announcementSaveWire(body: AnnouncementSaveRequest) {
  if (body.publishMode !== 'NOW' && body.publishMode !== 'SCHEDULED') {
    invalid('게시 방식을 확인해 주세요.');
  }
  if (typeof body.pinned !== 'boolean') invalid('고정 여부를 확인해 주세요.');
  const publishAt = body.publishMode === 'NOW' ? null : required(body.publishAt);
  return {
    categoryId: positiveId(body.categoryId),
    title: required(body.title),
    content: required(body.body),
    isPinned: body.pinned,
    publishAt,
    imageAssetIds: exactImageIds(body.imageAssetIds),
  };
}
function categorySaveWire(body: AnnouncementCategorySaveRequest) {
  if (!Number.isSafeInteger(body.sortOrder) || body.sortOrder < 0) invalid('카테고리 순서를 확인해 주세요.');
  if (!/^#[0-9A-Fa-f]{6}$/.test(body.color)) invalid('카테고리 색상을 확인해 주세요.');
  return {color: body.color.toUpperCase(), displayOrder: body.sortOrder, name: required(body.name)};
}
function parseMockAnnouncement(item: AnnouncementDetail) {
  return parseAnnouncementDetail({
    id: item.id,
    campusId: item.campusId,
    category: categoryWire(item.category, item.campusId),
    title: item.title,
    content: item.body,
    isPinned: item.pinned,
    status: item.status,
    publishAt: item.publishAt,
    publishedAt: item.publishedAt,
    imageAssetIds: item.imageAssetIds,
  }, {campusId: item.campusId, id: item.id, status: item.status});
}
function parseMockCategory(item: StoredCategory) {
  return parseAnnouncementCategories([categoryWire(item, item.campusId)], item.campusId)[0]!;
}
function categoryWire(item: AnnouncementCategory, campusId: number) {
  return {
    id: item.id,
    campusId,
    name: item.name,
    color: item.color,
    displayOrder: item.sortOrder,
    isActive: item.isActive,
  };
}
function parseNull(value: unknown) {
  if (value !== null) invalid('빈 응답을 확인할 수 없습니다.');
}
function required(value: string | null) { if (typeof value !== 'string' || !value.trim()) invalid('입력값을 확인해 주세요.'); return value.trim(); }
function getCategory(categories: StoredCategory[], campusId: number, id: number, allowInactive = false) { const value = categories.find((item) => item.campusId === campusId && item.id === id && (item.isActive || allowInactive)); if (!value) notFound(); return value; }
function sanitizeCategory(id: number, campusId: number, body: AnnouncementCategorySaveRequest): StoredCategory { return {campusId, color: body.color.toUpperCase(), id, isActive: body.isActive, name: required(body.name), sortOrder: body.sortOrder}; }
function assertUniqueCategory(categories: StoredCategory[], value: StoredCategory) { if (categories.some((item) => item.campusId === value.campusId && item.name.toLowerCase() === value.name.toLowerCase())) throw new FaithLogApiError({kind: 'conflict', code: 'ANNOUNCEMENT_CATEGORY_DUPLICATE', message: '같은 이름의 카테고리가 있습니다.', status: 409}); }
function validateMediaRequest(body: MediaUploadReservationRequest) {
  if (
    !Number.isSafeInteger(body.byteSize) ||
    body.byteSize <= 0 ||
    body.byteSize > ANNOUNCEMENT_IMAGE_MAX_BYTE_SIZE ||
    (body.contentType !== 'image/jpeg' && body.contentType !== 'image/png') ||
    !/^[a-f0-9]{64}$/i.test(body.sha256)
  ) {
    invalid('이미지 정보를 확인해 주세요.');
  }
}
function validateMediaIdentity(value: MediaAssetIdentity) {
  positiveId(value.assetId);
  validateMediaRequest(value);
}
function positiveId(value: number) { if (!Number.isSafeInteger(value) || value <= 0) invalid('식별자를 확인해 주세요.'); return value; }
function notFound(): never { throw new FaithLogApiError({kind: 'error', code: 'ANNOUNCEMENT_NOT_FOUND', message: '공지를 찾을 수 없습니다.', status: 404}); }
function invalid(message: string): never { throw new FaithLogApiError({kind: 'error', code: 'GLOBAL_VALIDATION_FAILED', message, status: 400}); }

let mockAssetIdSequence = 1000;
function nextMockAssetId() {
  if (!Number.isSafeInteger(mockAssetIdSequence) || mockAssetIdSequence <= 0) {
    invalid('이미지 식별자를 생성할 수 없습니다.');
  }
  return mockAssetIdSequence++;
}

let defaultApi: AnnouncementApi | null = null;
function getDefaultApi() {
  defaultApi ??= createAnnouncementApi();
  return defaultApi;
}
export const announcementApi: AnnouncementApi = {
  archiveAnnouncement: (...args) => getDefaultApi().archiveAnnouncement(...args),
  completeMediaUpload: (...args) => getDefaultApi().completeMediaUpload(...args),
  createAnnouncement: (...args) => getDefaultApi().createAnnouncement(...args),
  createCategory: (...args) => getDefaultApi().createCategory(...args),
  deactivateCategory: (...args) => getDefaultApi().deactivateCategory(...args),
  getDetail: (...args) => getDefaultApi().getDetail(...args),
  getMediaAccessUrls: (...args) => getDefaultApi().getMediaAccessUrls(...args),
  listAdmin: (...args) => getDefaultApi().listAdmin(...args),
  listCategories: (...args) => getDefaultApi().listCategories(...args),
  listPublished: (...args) => getDefaultApi().listPublished(...args),
  publishAnnouncement: (...args) => getDefaultApi().publishAnnouncement(...args),
  reserveMediaUpload: (...args) => getDefaultApi().reserveMediaUpload(...args),
  updateAnnouncement: (...args) => getDefaultApi().updateAnnouncement(...args),
  updateCategory: (...args) => getDefaultApi().updateCategory(...args),
};
