import {describe, expect, it} from 'vitest';

import {
  dedupeOrderedImageAssetIds,
  getAnnouncementCategoryName,
  parseAnnouncementDetail,
  parseAnnouncementList,
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
});

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
