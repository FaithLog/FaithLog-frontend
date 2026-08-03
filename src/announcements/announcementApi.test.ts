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
});
