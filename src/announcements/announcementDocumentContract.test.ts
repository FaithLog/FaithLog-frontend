import {describe, expect, it} from 'vitest';

import {parseAnnouncementDetail} from './announcementDomain';

const base = {
  campusId: 1,
  category: {campusId: 1, color: '#3182F6', displayOrder: 1, id: 2, isActive: true, name: '예배'},
  content: '본문',
  id: 3,
  imageAssetIds: [10],
  isPinned: false,
  publishAt: null,
  publishedAt: '2026-08-04T00:00:00Z',
  status: 'PUBLISHED',
  title: '공지',
};

describe('announcement PDF contract', () => {
  it('preserves ordered document ids separately from image ids', () => {
    const parsed = parseAnnouncementDetail({
      ...base,
      attachmentCount: 3,
      documentAssetIds: [31, 32],
      hasAttachments: true,
    });

    expect(parsed.imageAssetIds).toEqual([10]);
    expect(parsed.documentAssetIds).toEqual([31, 32]);
    expect(parsed).toMatchObject({attachmentCount: 3, hasAttachments: true});
  });

  it('uses safe legacy defaults while the backend document contract is unavailable', () => {
    expect(parseAnnouncementDetail(base)).toMatchObject({
      attachmentCount: 1,
      documentAssetIds: [],
      hasAttachments: true,
    });
  });

  it('rejects duplicate document ids and inconsistent attachment metadata', () => {
    expect(() => parseAnnouncementDetail({...base, documentAssetIds: [31, 31]})).toThrow();
    expect(() => parseAnnouncementDetail({...base, attachmentCount: 0, hasAttachments: true})).toThrow();
  });
});
