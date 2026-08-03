import {describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => {
  class TestFaithLogApiError extends Error {
    readonly detail: {kind: string; code?: string; message: string; status?: number};
    constructor(detail: {kind: string; code?: string; message: string; status?: number}) {
      super(detail.message);
      this.detail = detail;
    }
  }
  return {
    apiRequest: vi.fn(),
    FaithLogApiError: TestFaithLogApiError,
    isMockModeEnabled: vi.fn(() => false),
  };
});

import {createAnnouncementApi, type AnnouncementRequestDispatcher} from './announcementApi';

describe('announcement API boundary', () => {
  it('fails closed before production dispatch while REST Docs are pending', async () => {
    const request = vi.fn();
    const api = createAnnouncementApi({isMockMode: () => false, request});

    await expect(api.listPublished('token', 1)).rejects.toMatchObject({
      detail: {code: 'API_CONTRACT_PENDING'},
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('uses the mock adapter for complete CRUD and preserves ordered image ids', async () => {
    const api = createAnnouncementApi({isMockMode: () => true});
    const categories = await api.listCategories('token', 1, true);
    const created = await api.createAnnouncement('token', 1, {
      body: '본문',
      categoryId: categories[0]!.id,
      imageAssetIds: [7, 5],
      pinned: false,
      publishAt: null,
      publishMode: 'NOW',
      title: '새 공지',
    });

    expect(created.imageAssetIds).toEqual([7, 5]);
    expect((await api.listAdmin('token', 1, 'PUBLISHED')).some((item) => item.id === created.id)).toBe(true);
  });

  it('propagates category edits to historical announcements and permits only their current inactive category', async () => {
    const api = createAnnouncementApi({isMockMode: () => true});
    const category = (await api.listCategories('token', 1, false))[0]!;
    const created = await api.createAnnouncement('token', 1, {
      body: '본문',
      categoryId: category.id,
      imageAssetIds: [],
      pinned: false,
      publishAt: null,
      publishMode: 'NOW',
      title: '과거 공지',
    });

    await api.updateCategory('token', 1, category.id, {
      color: '#EF4444',
      isActive: false,
      name: '지난 예배',
      sortOrder: category.sortOrder,
    });

    const historical = await api.getDetail('token', 1, created.id);
    expect(historical.category).toMatchObject({color: '#EF4444', isActive: false, name: '지난 예배'});
    await expect(api.updateAnnouncement('token', 1, created.id, {
      body: '수정 본문',
      categoryId: category.id,
      imageAssetIds: [],
      pinned: false,
      publishAt: null,
      publishMode: 'NOW',
      title: '과거 공지 수정',
    })).resolves.toMatchObject({category: {id: category.id, isActive: false}});
    await expect(api.createAnnouncement('token', 1, {
      body: '신규 본문',
      categoryId: category.id,
      imageAssetIds: [],
      pinned: false,
      publishAt: null,
      publishMode: 'NOW',
      title: '신규 공지',
    })).rejects.toMatchObject({detail: {status: 404}});
  });

  it('chunks access-url requests at one hundred asset ids and preserves order', async () => {
    const api = createAnnouncementApi({isMockMode: () => true});
    const ids = Array.from({length: 205}, (_, index) => index + 1);
    const assets = await api.getMediaAccessUrls('token', 1, ids);
    expect(assets.map((asset) => asset.assetId)).toEqual(ids);
  });

  it('connects only the final media contract in production and chunks access urls', async () => {
    const calls: Array<{path: string; body: unknown}> = [];
    const request: AnnouncementRequestDispatcher = async <T>(path: string, options: {body?: unknown; responseParser: (value: unknown) => T}) => {
      calls.push({path, body: options.body});
      const ids = (options.body as {assetIds?: number[]} | undefined)?.assetIds;
      if (ids) {
        return options.responseParser({assets: ids.map((assetId) => ({assetId, thumbnailUrl: `https://media.example/${assetId}/t`, detailUrl: `https://media.example/${assetId}/d`, expiresAt: '2026-08-03T10:00:00Z'}))});
      }
      return options.responseParser({assetId: 9, uploadUrl: 'https://upload.example/9', requiredHeaders: {'Content-Type': 'image/jpeg'}, expiresAt: '2026-08-03T10:00:00Z'});
    };
    const api = createAnnouncementApi({isMockMode: () => false, request});
    await api.reserveMediaUpload('token', 1, {byteSize: 10, contentType: 'image/jpeg', sha256: 'a'.repeat(64)});
    await api.getMediaAccessUrls('token', 1, Array.from({length: 101}, (_, index) => index + 1));
    expect(calls.map((call) => call.path)).toEqual([
      '/api/v1/admin/campuses/1/media-assets/upload-reservations',
      '/api/v1/campuses/1/media-assets/access-urls',
      '/api/v1/campuses/1/media-assets/access-urls',
    ]);
    expect((calls[1]!.body as {assetIds: number[]}).assetIds).toHaveLength(100);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an unsafe reservation byte size before dispatch: %s',
    async (byteSize) => {
      const request = vi.fn();
      const api = createAnnouncementApi({isMockMode: () => false, request});

      await expect(api.reserveMediaUpload('token', 1, {
        byteSize,
        contentType: 'image/jpeg',
        sha256: 'a'.repeat(64),
      })).rejects.toMatchObject({detail: {code: 'GLOBAL_VALIDATION_FAILED', status: 400}});
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('rejects a runtime content-type outside the upload allowlist before dispatch', async () => {
    const request = vi.fn();
    const api = createAnnouncementApi({isMockMode: () => false, request});

    await expect(api.reserveMediaUpload('token', 1, {
      byteSize: 10,
      contentType: 'image/gif',
      sha256: 'a'.repeat(64),
    } as never)).rejects.toMatchObject({detail: {code: 'GLOBAL_VALIDATION_FAILED', status: 400}});
    expect(request).not.toHaveBeenCalled();
  });

  it('passes expected upload identity to completion parsing and accepts PROCESSING', async () => {
    const expected = {assetId: 9, byteSize: 10, contentType: 'image/jpeg' as const, sha256: 'a'.repeat(64)};
    const request: AnnouncementRequestDispatcher = async <T>(_path: string, options: {responseParser: (value: unknown) => T}) =>
      options.responseParser({...expected, status: 'PROCESSING'});
    const api = createAnnouncementApi({isMockMode: () => false, request});

    await expect(api.completeMediaUpload('token', 1, expected)).resolves.toEqual({...expected, status: 'PROCESSING'});
  });

  it('fails closed when completion metadata does not match the reserved file', async () => {
    const expected = {assetId: 9, byteSize: 10, contentType: 'image/jpeg' as const, sha256: 'a'.repeat(64)};
    const request: AnnouncementRequestDispatcher = async <T>(_path: string, options: {responseParser: (value: unknown) => T}) =>
      options.responseParser({...expected, assetId: 10, status: 'READY'});
    const api = createAnnouncementApi({isMockMode: () => false, request});

    await expect(api.completeMediaUpload('token', 1, expected)).rejects.toMatchObject({
      detail: {code: 'INVALID_SERVER_RESPONSE'},
    });
  });

  it('keeps mock asset ids monotonic across API instances', async () => {
    const request = {byteSize: 10, contentType: 'image/jpeg' as const, sha256: 'a'.repeat(64)};
    const first = await createAnnouncementApi({isMockMode: () => true}).reserveMediaUpload('token', 1, request);
    const second = await createAnnouncementApi({isMockMode: () => true}).reserveMediaUpload('token', 1, request);

    expect(second.assetId).toBeGreaterThan(first.assetId);
  });

  it('reports a mock completion lineage mismatch as a conflict', async () => {
    const api = createAnnouncementApi({isMockMode: () => true});
    const file = {byteSize: 10, contentType: 'image/jpeg' as const, sha256: 'a'.repeat(64)};
    const reservation = await api.reserveMediaUpload('token', 1, file);

    await expect(api.completeMediaUpload('token', 1, {...file, assetId: reservation.assetId, sha256: 'b'.repeat(64)})).rejects.toMatchObject({
      detail: {kind: 'conflict', code: 'MEDIA_ASSET_LINEAGE_CONFLICT', status: 409},
    });
  });
});
