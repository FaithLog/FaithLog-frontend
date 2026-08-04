import {describe, expect, it} from 'vitest';

import {
  beginPublishedPollNoticeEdit,
  commitPublishedPollNoticeEditCampus,
  createPublishedPollNoticeEditCoordinator,
  invalidatePublishedPollNoticeEdit,
  isPublishedPollNoticeEditCurrent,
} from './publishedPollNoticeEditCoordinator';

describe('published poll notice edit coordinator', () => {
  it('accepts only the latest request for the same campus and auth generation', () => {
    const coordinator = createPublishedPollNoticeEditCoordinator(1);
    const first = beginPublishedPollNoticeEdit(coordinator, {
      campusId: 1,
      pollId: 701,
      sessionGeneration: 3,
    });
    const second = beginPublishedPollNoticeEdit(coordinator, {
      campusId: 1,
      pollId: 702,
      sessionGeneration: 3,
    });

    expect(isPublishedPollNoticeEditCurrent(coordinator, first, 3)).toBe(false);
    expect(isPublishedPollNoticeEditCurrent(coordinator, second, 3)).toBe(true);
    expect(isPublishedPollNoticeEditCurrent(coordinator, second, 4)).toBe(false);
  });

  it('invalidates a pending detail when navigation or campus identity changes', () => {
    const coordinator = createPublishedPollNoticeEditCoordinator(1);
    const navigated = beginPublishedPollNoticeEdit(coordinator, {
      campusId: 1,
      pollId: 701,
      sessionGeneration: 3,
    });
    invalidatePublishedPollNoticeEdit(coordinator);
    expect(isPublishedPollNoticeEditCurrent(coordinator, navigated, 3)).toBe(false);

    const campusChanged = beginPublishedPollNoticeEdit(coordinator, {
      campusId: 1,
      pollId: 702,
      sessionGeneration: 3,
    });
    expect(commitPublishedPollNoticeEditCampus(coordinator, 2)).toBe(true);
    expect(isPublishedPollNoticeEditCurrent(coordinator, campusChanged, 3)).toBe(false);
  });
});
