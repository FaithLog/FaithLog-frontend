import {apiRequest, FaithLogApiError} from '../api/client';
import {isAnnouncementMockModeEnabled} from './announcementEnvironment';
import {
  dedupeOrderedImageAssetIds,
  parseAnnouncementCategories,
  parseAnnouncementDetail,
  parseAnnouncementList,
  parseMediaAccessUrls,
  parseMediaAssetReady,
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
  MediaAssetReady,
  MediaUploadReservation,
  MediaUploadReservationRequest,
} from './announcementTypes';

type RequestOptions<T> = {
  accessToken: string;
  body?: unknown;
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST';
  responseParser: (value: unknown) => T;
};

export type AnnouncementRequestDispatcher = <T>(path: string, options: RequestOptions<T>) => Promise<T>;
type Dependencies = {isMockMode?: () => boolean; request?: AnnouncementRequestDispatcher};

export type AnnouncementApi = {
  archiveAnnouncement(token: string, campusId: number, announcementId: number): Promise<AnnouncementDetail>;
  completeMediaUpload(token: string, campusId: number, assetId: number): Promise<MediaAssetReady>;
  createAnnouncement(token: string, campusId: number, body: AnnouncementSaveRequest): Promise<AnnouncementDetail>;
  createCategory(token: string, campusId: number, body: AnnouncementCategorySaveRequest): Promise<AnnouncementCategory>;
  getDetail(token: string, campusId: number, announcementId: number): Promise<AnnouncementDetail>;
  getMediaAccessUrls(token: string, campusId: number, assetIds: number[]): Promise<MediaAccessUrl[]>;
  listAdmin(token: string, campusId: number, status: AnnouncementStatus): Promise<AnnouncementSummary[]>;
  listCategories(token: string, campusId: number, includeInactive: boolean): Promise<AnnouncementCategory[]>;
  listPublished(token: string, campusId: number, categoryId?: number): Promise<AnnouncementSummary[]>;
  reserveMediaUpload(token: string, campusId: number, body: MediaUploadReservationRequest): Promise<MediaUploadReservation>;
  updateAnnouncement(token: string, campusId: number, announcementId: number, body: AnnouncementSaveRequest): Promise<AnnouncementDetail>;
  updateCategory(token: string, campusId: number, categoryId: number, body: AnnouncementCategorySaveRequest): Promise<AnnouncementCategory>;
};

export function createAnnouncementApi(dependencies: Dependencies = {}): AnnouncementApi {
  const mock = dependencies.isMockMode?.() ?? isAnnouncementMockModeEnabled();
  if (mock) return createMockAnnouncementApi();
  const request = dependencies.request ?? (<T>(path: string, options: RequestOptions<T>) => apiRequest<T>(path, options));
  const pending = async <T>(): Promise<T> => {
    throw new FaithLogApiError({kind: 'error', code: 'API_CONTRACT_PENDING', message: '기능 준비 중입니다.'});
  };
  return {
    archiveAnnouncement: pending,
    completeMediaUpload(token, campusId, assetId) {
      return request(
        `/api/v1/admin/campuses/${positiveId(campusId)}/media-assets/${positiveId(assetId)}/complete`,
        {accessToken: token, method: 'POST', responseParser: parseMediaAssetReady},
      );
    },
    createAnnouncement: pending,
    createCategory: pending,
    getDetail: pending,
    async getMediaAccessUrls(token, campusId, assetIds) {
      const ordered = exactImageIds(assetIds);
      const result: MediaAccessUrl[] = [];
      for (let offset = 0; offset < ordered.length; offset += 100) {
        const chunk = ordered.slice(offset, offset + 100);
        const assets = await request(
          `/api/v1/campuses/${positiveId(campusId)}/media-assets/access-urls`,
          {accessToken: token, body: {assetIds: chunk}, method: 'POST', responseParser: (value) => parseMediaAccessUrls(value, chunk)},
        );
        result.push(...assets);
      }
      return result;
    },
    listAdmin: pending,
    listCategories: pending,
    listPublished: pending,
    reserveMediaUpload(token, campusId, body) {
      validateMediaRequest(body);
      return request(
        `/api/v1/admin/campuses/${positiveId(campusId)}/media-assets/upload-reservations`,
        {accessToken: token, body, method: 'POST', responseParser: parseMediaUploadReservation},
      );
    },
    updateAnnouncement: pending,
    updateCategory: pending,
  };
}

function createMockAnnouncementApi(): AnnouncementApi {
  const store = createMockStore();
  return {
    async listPublished(_token, campusId, categoryId) {
      return parseAnnouncementList(store.announcements.filter((item) => item.campusId === campusId && item.status === 'PUBLISHED' && (categoryId === undefined || item.category.id === categoryId)));
    },
    async listAdmin(_token, campusId, status) {
      return parseAnnouncementList(store.announcements.filter((item) => item.campusId === campusId && item.status === status));
    },
    async getDetail(_token, campusId, id) {
      const item = store.announcements.find((candidate) => candidate.campusId === campusId && candidate.id === id);
      if (!item) notFound();
      return parseAnnouncementDetail(item);
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
      return parseAnnouncementDetail(detail);
    },
    async updateAnnouncement(_token, campusId, id, body) {
      const index = store.announcements.findIndex((item) => item.campusId === campusId && item.id === id);
      if (index < 0) notFound();
      const previous = store.announcements[index];
      if (!previous) notFound();
      const now = new Date().toISOString();
      const next: AnnouncementDetail = {...previous, body: required(body.body), category: getCategory(store.categories, campusId, body.categoryId), imageAssetIds: exactImageIds(body.imageAssetIds), pinned: body.pinned, publishAt: body.publishMode === 'NOW' ? now : required(body.publishAt), publishedAt: body.publishMode === 'NOW' ? (previous.publishedAt ?? now) : null, status: body.publishMode === 'NOW' ? 'PUBLISHED' : 'SCHEDULED', title: required(body.title)};
      store.announcements[index] = next;
      return parseAnnouncementDetail(next);
    },
    async archiveAnnouncement(_token, campusId, id) {
      const item = store.announcements.find((candidate) => candidate.campusId === campusId && candidate.id === id);
      if (!item) notFound();
      item.status = 'ARCHIVED';
      return parseAnnouncementDetail(item);
    },
    async listCategories(_token, campusId, includeInactive) {
      return parseAnnouncementCategories(store.categories.filter((item) => item.campusId === campusId && (includeInactive || item.isActive)));
    },
    async createCategory(_token, campusId, body) {
      const category = sanitizeCategory(store.nextCategoryId++, campusId, body);
      assertUniqueCategory(store.categories, category);
      store.categories.push(category);
      return parseAnnouncementCategories([category])[0]!;
    },
    async updateCategory(_token, campusId, id, body) {
      const index = store.categories.findIndex((item) => item.campusId === campusId && item.id === id);
      if (index < 0) notFound();
      const next = sanitizeCategory(id, campusId, body);
      assertUniqueCategory(store.categories.filter((item) => item.id !== id), next);
      store.categories[index] = next;
      return parseAnnouncementCategories([next])[0]!;
    },
    async reserveMediaUpload(_token, campusId, body) {
      validateMediaRequest(body);
      const assetId = store.nextAssetId++;
      store.assets.set(assetId, {...body, campusId, ready: false});
      return {assetId, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), requiredHeaders: {'Content-Type': body.contentType}, uploadUrl: `https://mock-upload.invalid/${assetId}`};
    },
    async completeMediaUpload(_token, campusId, assetId) {
      const asset = store.assets.get(assetId);
      if (!asset || asset.campusId !== campusId) notFound();
      asset.ready = true;
      return {assetId, byteSize: asset.byteSize, contentType: asset.contentType, sha256: asset.sha256, status: 'READY'};
    },
    async getMediaAccessUrls(_token, campusId, assetIds) {
      const ordered = exactImageIds(assetIds);
      const result: MediaAccessUrl[] = [];
      for (let offset = 0; offset < ordered.length; offset += 100) {
        for (const assetId of ordered.slice(offset, offset + 100)) {
          const known = store.assets.get(assetId);
          if (known && known.campusId !== campusId) notFound();
          result.push({assetId, detailUrl: `https://mock-media.invalid/${assetId}/detail.jpg`, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), thumbnailUrl: `https://mock-media.invalid/${assetId}/thumbnail.jpg`});
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
  nextAssetId: number;
  nextCategoryId: number;
};
function createMockStore(): MockStore {
  const category: StoredCategory = {campusId: 1, color: '#3182F6', id: 1, isActive: true, name: '예배', sortOrder: 1};
  return {
    announcements: [{body: '이번 주 예배 안내를 확인해 주세요.', campusId: 1, category, id: 1, imageAssetIds: [], pinned: true, publishAt: '2026-08-03T09:00:00Z', publishedAt: '2026-08-03T09:00:00Z', status: 'PUBLISHED' as const, title: '주일 예배 안내'}],
    assets: new Map<number, MediaUploadReservationRequest & {campusId: number; ready: boolean}>(),
    categories: [category], nextAnnouncementId: 100, nextAssetId: 1000, nextCategoryId: 10,
  };
}

function exactImageIds(ids: number[]) {
  const next = dedupeOrderedImageAssetIds(ids);
  if (next.length !== ids.length) invalid('이미지 순서를 확인해 주세요.');
  return next;
}
function required(value: string | null) { if (typeof value !== 'string' || !value.trim()) invalid('입력값을 확인해 주세요.'); return value.trim(); }
function getCategory(categories: StoredCategory[], campusId: number, id: number) { const value = categories.find((item) => item.campusId === campusId && item.id === id && item.isActive); if (!value) notFound(); return value; }
function sanitizeCategory(id: number, campusId: number, body: AnnouncementCategorySaveRequest): StoredCategory { return {campusId, color: body.color.toUpperCase(), id, isActive: body.isActive, name: required(body.name), sortOrder: body.sortOrder}; }
function assertUniqueCategory(categories: StoredCategory[], value: StoredCategory) { if (categories.some((item) => item.campusId === value.campusId && item.name.toLowerCase() === value.name.toLowerCase())) throw new FaithLogApiError({kind: 'conflict', code: 'ANNOUNCEMENT_CATEGORY_DUPLICATE', message: '같은 이름의 카테고리가 있습니다.', status: 409}); }
function validateMediaRequest(body: MediaUploadReservationRequest) { if (body.byteSize <= 0 || body.byteSize > 5 * 1024 * 1024 || !/^[a-f0-9]{64}$/i.test(body.sha256)) invalid('이미지 정보를 확인해 주세요.'); }
function positiveId(value: number) { if (!Number.isSafeInteger(value) || value <= 0) invalid('식별자를 확인해 주세요.'); return value; }
function notFound(): never { throw new FaithLogApiError({kind: 'error', code: 'ANNOUNCEMENT_NOT_FOUND', message: '공지를 찾을 수 없습니다.', status: 404}); }
function invalid(message: string): never { throw new FaithLogApiError({kind: 'error', code: 'GLOBAL_VALIDATION_FAILED', message, status: 400}); }

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
  getDetail: (...args) => getDefaultApi().getDetail(...args),
  getMediaAccessUrls: (...args) => getDefaultApi().getMediaAccessUrls(...args),
  listAdmin: (...args) => getDefaultApi().listAdmin(...args),
  listCategories: (...args) => getDefaultApi().listCategories(...args),
  listPublished: (...args) => getDefaultApi().listPublished(...args),
  reserveMediaUpload: (...args) => getDefaultApi().reserveMediaUpload(...args),
  updateAnnouncement: (...args) => getDefaultApi().updateAnnouncement(...args),
  updateCategory: (...args) => getDefaultApi().updateCategory(...args),
};
