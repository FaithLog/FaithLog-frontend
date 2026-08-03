import {describe, expect, it} from 'vitest';

import {
  dedupeOrderedImageAssetIds,
  getAnnouncementCategoryName,
  parseAnnouncementDetail,
  parseAnnouncementList,
  parseMediaAccessUrls,
  parseMediaAssetCompletion,
} from './announcementDomain';

describe('announcement domain contract', () => {
  it('parses published, scheduled, and archived announcements with named categories', () => {
    const list = parseAnnouncementList([
      fixture({id: 1, status: 'PUBLISHED'}),
      fixture({id: 2, status: 'SCHEDULED'}),
      fixture({id: 3, status: 'ARCHIVED'}),
    ]);

    expect(list.map((item) => item.status)).toEqual(['PUBLISHED', 'SCHEDULED', 'ARCHIVED']);
    expect(getAnnouncementCategoryName(list[0]!)).toBe('예배');
  });

  it('keeps image order while removing duplicate asset ids', () => {
    expect(dedupeOrderedImageAssetIds([8, 3, 8, 5])).toEqual([8, 3, 5]);
  });

  it('fails closed on malformed category colors and duplicate image ids from the server', () => {
    expect(() => parseAnnouncementDetail(fixture({category: {...fixture().category, color: 'red'}}))).toThrow();
    expect(() => parseAnnouncementDetail(fixture({imageAssetIds: [1, 1]}))).toThrow();
  });

  it('models PROCESSING separately and accepts completion only for the expected upload lineage', () => {
    const expected = mediaIdentity();

    expect(parseMediaAssetCompletion({...expected, status: 'PROCESSING'}, expected)).toEqual({
      ...expected,
      status: 'PROCESSING',
    });
    expect(parseMediaAssetCompletion({...expected, status: 'READY'}, expected)).toEqual({
      ...expected,
      status: 'READY',
    });

    for (const mismatched of [
      {...expected, assetId: 10, status: 'READY'},
      {...expected, byteSize: expected.byteSize + 1, status: 'READY'},
      {...expected, contentType: 'image/png', status: 'READY'},
      {...expected, sha256: 'b'.repeat(64), status: 'READY'},
    ]) {
      expect(() => parseMediaAssetCompletion(mismatched, expected)).toThrowError(
        expect.objectContaining({detail: expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'})}),
      );
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 10.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an unsafe completion byte size: %s',
    (byteSize) => {
      const expected = mediaIdentity();
      expect(() => parseMediaAssetCompletion({...expected, byteSize, status: 'READY'}, expected)).toThrow();
    },
  );

  it('accepts an ordered subset of media access URLs while rejecting unknown or reordered assets', () => {
    expect(parseMediaAccessUrls({
      assets: [mediaAccess(21), mediaAccess(23)],
    }, [21, 22, 23])).toEqual([mediaAccess(21), mediaAccess(23)]);

    expect(() => parseMediaAccessUrls({
      assets: [mediaAccess(23), mediaAccess(21)],
    }, [21, 22, 23])).toThrow();
    expect(() => parseMediaAccessUrls({
      assets: [mediaAccess(21), mediaAccess(24)],
    }, [21, 22, 23])).toThrow();
  });
});

function mediaIdentity() {
  return {
    assetId: 9,
    byteSize: 10,
    contentType: 'image/jpeg' as const,
    sha256: 'a'.repeat(64),
  };
}

function mediaAccess(assetId: number) {
  return {
    assetId,
    detailUrl: `https://media.example/${assetId}/detail.jpg`,
    expiresAt: '2026-08-03T10:00:00Z',
    thumbnailUrl: `https://media.example/${assetId}/thumbnail.jpg`,
  };
}

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    campusId: 1,
    category: {id: 2, name: '예배', color: '#3182F6', isActive: true, sortOrder: 1},
    title: '주일 예배 안내',
    body: '예배 시간을 확인해 주세요.',
    status: 'PUBLISHED',
    pinned: true,
    publishAt: '2026-08-03T09:00:00Z',
    publishedAt: '2026-08-03T09:00:00Z',
    imageAssetIds: [21, 22],
    ...overrides,
  };
}
