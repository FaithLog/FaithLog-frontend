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
  it('connects the final announcement REST Docs contract in production', async () => {
    const calls: Array<{path: string; options: Record<string, unknown>}> = [];
    const request: AnnouncementRequestDispatcher = async <T>(path: string, options: {body?: unknown; method?: string; responseParser: (value: unknown) => T}) => {
      calls.push({path, options});
      if (path.includes('announcement-categories')) {
        return options.responseParser([categoryWire()]);
      }
      if (path.includes('/announcements/9')) {
        return options.responseParser(announcementWire({id: 9}));
      }
      return options.responseParser(pageWire([announcementWire()]));
    };
    const api = createAnnouncementApi({isMockMode: () => false, request});

    await expect(api.listPublished('token', 1)).resolves.toEqual([
      expect.objectContaining({body: '본문', pinned: true, title: '공지'}),
    ]);
    await expect(api.listCategories('token', 1, true)).resolves.toEqual([
      expect.objectContaining({sortOrder: 2}),
    ]);
    await expect(api.getDetail('token', 1, 9)).resolves.toMatchObject({id: 9});
    expect(calls.map((call) => call.path)).toEqual([
      '/api/v1/campuses/1/announcements?status=PUBLISHED&page=0&size=100',
      '/api/v1/campuses/1/announcement-categories',
      '/api/v1/campuses/1/announcements/9',
    ]);
  });

  it('loads every production page in order and rejects duplicated announcement identities', async () => {
    const calls: string[] = [];
    const request: AnnouncementRequestDispatcher = async <T>(path: string, options: {responseParser: (value: unknown) => T}) => {
      calls.push(path);
      const page = path.includes('page=1') ? 1 : 0;
      const content = page === 0
        ? Array.from({length: 100}, (_, index) => announcementWire({id: index + 1}))
        : [announcementWire({id: 101})];
      return options.responseParser(pageWire(content, {
        page,
        size: 100,
        totalElements: 101,
        totalPages: 2,
      }));
    };
    const api = createAnnouncementApi({isMockMode: () => false, request});

    await expect(api.listPublished('token', 1)).resolves.toEqual([
      expect.objectContaining({id: 1}),
      ...Array.from({length: 99}, (_, index) => expect.objectContaining({id: index + 2})),
      expect.objectContaining({id: 101}),
    ]);
    expect(calls).toEqual([
      '/api/v1/campuses/1/announcements?status=PUBLISHED&page=0&size=100',
      '/api/v1/campuses/1/announcements?status=PUBLISHED&page=1&size=100',
    ]);

    const duplicateRequest: AnnouncementRequestDispatcher = async <T>(path: string, options: {responseParser: (value: unknown) => T}) => {
      const page = path.includes('page=1') ? 1 : 0;
      const content = page === 0
        ? Array.from({length: 100}, (_, index) => announcementWire({id: index + 1}))
        : [announcementWire({id: 1})];
      return options.responseParser(pageWire(content, {
        page,
        size: 100,
        totalElements: 101,
        totalPages: 2,
      }));
    };
    await expect(createAnnouncementApi({isMockMode: () => false, request: duplicateRequest})
      .listPublished('token', 1)).rejects.toMatchObject({detail: {code: 'GLOBAL_VALIDATION_FAILED'}});
  });

  it.each([
    [401, 'AUTH_UNAUTHORIZED'],
    [403, 'ANNOUNCEMENT_READ_FORBIDDEN'],
    [404, 'ANNOUNCEMENT_NOT_FOUND'],
    [409, 'ANNOUNCEMENT_STATUS_CONFLICT'],
    [429, 'MEDIA_UPLOAD_RATE_LIMITED'],
  ])('preserves HTTP %s and backend code %s from the shared authenticated transport', async (status, code) => {
    const {FaithLogApiError} = await import('../api/client');
    const error = new FaithLogApiError({kind: 'error', code, message: 'safe', status});
    const request = vi.fn().mockRejectedValue(error);
    const api = createAnnouncementApi({isMockMode: () => false, request});

    await expect(api.getDetail('token', 1, 9)).rejects.toBe(error);
  });

  it('maps internal save fields to final wire fields and uses dedicated publish/archive routes', async () => {
    const calls: Array<{path: string; options: {body?: unknown; method?: string}}> = [];
    const request: AnnouncementRequestDispatcher = async <T>(path: string, options: {body?: unknown; method?: string; responseParser: (value: unknown) => T}) => {
      calls.push({path, options});
      if (path.endsWith('/archive') || path.endsWith('/deactivate')) return options.responseParser(null);
      if (path.includes('announcement-categories')) return options.responseParser(categoryWire());
      return options.responseParser(announcementWire());
    };
    const api = createAnnouncementApi({isMockMode: () => false, request});
    const save = {
      body: ' 본문 ', categoryId: 2, imageAssetIds: [31, 32], pinned: true,
      publishAt: null, publishMode: 'NOW' as const, title: ' 공지 ',
    };

    await api.createAnnouncement('token', 1, save);
    await api.updateAnnouncement('token', 1, 11, save);
    await api.publishAnnouncement('token', 1, 11);
    await api.archiveAnnouncement('token', 1, 11);
    await api.createCategory('token', 1, {color: '#3182F6', isActive: true, name: '일반', sortOrder: 2});
    await api.updateCategory('token', 1, 2, {color: '#3182F6', isActive: false, name: '일반', sortOrder: 2});
    await api.deactivateCategory('token', 1, 2);

    expect(calls).toEqual([
      expect.objectContaining({path: '/api/v1/admin/campuses/1/announcements', options: expect.objectContaining({method: 'POST', body: {categoryId: 2, title: '공지', content: '본문', isPinned: true, publishAt: null, imageAssetIds: [31, 32]}})}),
      expect.objectContaining({path: '/api/v1/admin/campuses/1/announcements/11', options: expect.objectContaining({method: 'PATCH'})}),
      expect.objectContaining({path: '/api/v1/admin/campuses/1/announcements/11/publish', options: expect.objectContaining({method: 'POST'})}),
      expect.objectContaining({path: '/api/v1/admin/campuses/1/announcements/11/archive', options: expect.objectContaining({method: 'POST'})}),
      expect.objectContaining({path: '/api/v1/admin/campuses/1/announcement-categories', options: expect.objectContaining({method: 'POST', body: {color: '#3182F6', displayOrder: 2, name: '일반'}})}),
      expect.objectContaining({path: '/api/v1/admin/campuses/1/announcement-categories/2', options: expect.objectContaining({method: 'PATCH', body: {color: '#3182F6', displayOrder: 2, name: '일반'}})}),
      expect.objectContaining({path: '/api/v1/admin/campuses/1/announcement-categories/2/deactivate', options: expect.objectContaining({method: 'POST'})}),
    ]);
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
    await api.deactivateCategory('token', 1, category.id);

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
        return options.responseParser(ids.map((assetId) => ({assetId, sha256: 'b'.repeat(64), thumbnailUrl: `https://media.example/${assetId}/t`, detailUrl: `https://media.example/${assetId}/d`, expiresAt: '2026-08-03T10:00:00Z'})));
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

  it('validates final READY completion identity without comparing derived variant metadata to the input file', async () => {
    const expected = {assetId: 9, byteSize: 10, contentType: 'image/jpeg' as const, sha256: 'a'.repeat(64)};
    const request: AnnouncementRequestDispatcher = async <T>(_path: string, options: {responseParser: (value: unknown) => T}) =>
      options.responseParser({assetId: 9, campusId: 1, status: 'READY', sha256: 'b'.repeat(64), width: 1600, height: 1200, byteSize: 12345});
    const api = createAnnouncementApi({isMockMode: () => false, request});

    await expect(api.completeMediaUpload('token', 1, expected)).resolves.toEqual({...expected, status: 'READY'});
  });

  it('fails closed when completion metadata does not match the reserved file', async () => {
    const expected = {assetId: 9, byteSize: 10, contentType: 'image/jpeg' as const, sha256: 'a'.repeat(64)};
    const request: AnnouncementRequestDispatcher = async <T>(_path: string, options: {responseParser: (value: unknown) => T}) =>
      options.responseParser({assetId: 10, campusId: 1, status: 'READY', sha256: 'b'.repeat(64), width: 1600, height: 1200, byteSize: 12345});
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

function categoryWire(overrides: Record<string, unknown> = {}) {
  return {
    id: 2, campusId: 1, name: '일반', color: '#3182F6', displayOrder: 2,
    isActive: true, createdAt: '2026-08-03T09:00:00Z', updatedAt: '2026-08-03T09:00:00Z',
    ...overrides,
  };
}

function announcementWire(overrides: Record<string, unknown> = {}) {
  return {
    id: 11, campusId: 1, category: categoryWire(), authorId: 7, title: '공지', content: '본문',
    isPinned: true, status: 'PUBLISHED', publishAt: '2026-08-03T09:00:00Z',
    publishedAt: '2026-08-03T09:00:00Z', createdAt: '2026-08-03T09:00:00Z',
    updatedAt: '2026-08-03T09:00:00Z', imageAssetIds: [31, 32], ...overrides,
  };
}

function pageWire(content: unknown[], overrides: Record<string, unknown> = {}) {
  return {content, page: 0, size: 100, totalElements: content.length, totalPages: content.length ? 1 : 0, ...overrides};
}
