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

  it('accepts final READY completion for the expected asset and campus', () => {
    const expected = mediaIdentity();

    expect(parseMediaAssetCompletion(mediaCompletion(), expected, 1)).toEqual({
      ...expected,
      status: 'READY',
    });

    for (const mismatched of [
      mediaCompletion({assetId: 10}),
      mediaCompletion({campusId: 2}),
      mediaCompletion({status: 'PROCESSING'}),
      mediaCompletion({sha256: 'not-a-digest'}),
    ]) {
      expect(() => parseMediaAssetCompletion(mismatched, expected, 1)).toThrowError(
        expect.objectContaining({detail: expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'})}),
      );
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 10.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an unsafe completion byte size: %s',
    (byteSize) => {
      const expected = mediaIdentity();
      expect(() => parseMediaAssetCompletion(mediaCompletion({byteSize}), expected, 1)).toThrow();
    },
  );

  it('accepts exact ordered media access URLs while rejecting missing, unknown, or reordered assets', () => {
    expect(parseMediaAccessUrls([
      mediaAccess(21), mediaAccess(22), mediaAccess(23),
    ], [21, 22, 23])).toEqual([mediaAccess(21), mediaAccess(22), mediaAccess(23)]);

    expect(() => parseMediaAccessUrls([
      mediaAccess(21), mediaAccess(23),
    ], [21, 22, 23])).toThrow();

    expect(() => parseMediaAccessUrls([
      mediaAccess(23), mediaAccess(21),
    ], [21, 22, 23])).toThrow();
    expect(() => parseMediaAccessUrls([
      mediaAccess(21), mediaAccess(24),
    ], [21, 22, 23])).toThrow();
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
    sha256: 'b'.repeat(64),
    thumbnailUrl: `https://media.example/${assetId}/thumbnail.jpg`,
  };
}

function mediaCompletion(overrides: Record<string, unknown> = {}) {
  return {
    assetId: 9,
    campusId: 1,
    status: 'READY',
    sha256: 'b'.repeat(64),
    width: 1600,
    height: 1200,
    byteSize: 12345,
    ...overrides,
  };
}

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    campusId: 1,
    category: {id: 2, campusId: 1, name: '예배', color: '#3182F6', isActive: true, displayOrder: 1},
    title: '주일 예배 안내',
    content: '예배 시간을 확인해 주세요.',
    status: 'PUBLISHED',
    isPinned: true,
    publishAt: '2026-08-03T09:00:00Z',
    publishedAt: '2026-08-03T09:00:00Z',
    imageAssetIds: [21, 22],
    ...overrides,
  };
}
