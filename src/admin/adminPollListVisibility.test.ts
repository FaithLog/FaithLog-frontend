import {describe, expect, it} from 'vitest';

import type {PollSummary} from '../api/types';
import {getAdminPollsForStatusTab} from './adminPollListVisibility';

function poll(patch: Partial<PollSummary>): PollSummary {
  return {
    id: patch.id ?? 1,
    campusId: 1,
    title: patch.title ?? '투표',
    pollType: patch.pollType ?? 'CUSTOM',
    selectionType: 'SINGLE',
    isAnonymous: false,
    startsAt: patch.startsAt ?? '2026-06-28T09:00:00.000Z',
    endsAt: patch.endsAt ?? '2026-06-29T09:00:00.000Z',
    status: patch.status ?? 'OPEN',
    responded: patch.responded ?? false,
    ...patch,
  };
}

describe('admin poll list visibility', () => {
  const now = new Date('2026-06-29T09:00:00.000Z');

  it('keeps future open and scheduled polls in the ongoing tab', () => {
    const openPoll = poll({id: 1, status: 'OPEN', endsAt: '2026-06-29T11:00:00.000Z'});
    const scheduledPoll = poll({id: 2, status: 'SCHEDULED', endsAt: '2026-06-29T10:00:00.000Z'});

    const polls = getAdminPollsForStatusTab([openPoll, scheduledPoll], 'ongoing', now);

    expect(polls).toEqual([scheduledPoll, openPoll]);
  });

  it('shows status closed and expired open polls in the closed tab without the user 24 hour limit', () => {
    const oldClosedPoll = poll({id: 3, status: 'CLOSED', endsAt: '2026-06-20T09:00:00.000Z'});
    const oldExpiredOpenPoll = poll({id: 4, status: 'OPEN', endsAt: '2026-06-21T09:00:00.000Z'});

    const polls = getAdminPollsForStatusTab([oldClosedPoll, oldExpiredOpenPoll], 'closed', now);

    expect(polls).toEqual([oldExpiredOpenPoll, oldClosedPoll]);
  });

  it('limits closed polls to the 10 most recent by deadline', () => {
    const polls = Array.from({length: 12}, (_, index) =>
      poll({
        id: index + 1,
        status: 'CLOSED',
        endsAt: `2026-06-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
      }),
    );

    const result = getAdminPollsForStatusTab(polls, 'closed', now);

    expect(result).toHaveLength(10);
    expect(result.map((item) => item.id)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });

  it('keeps the focused ongoing poll visible even when it is outside the first 10 deadlines', () => {
    const polls = Array.from({length: 12}, (_, index) =>
      poll({
        id: index + 1,
        status: 'OPEN',
        endsAt: `2026-06-29T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
      }),
    );

    const result = getAdminPollsForStatusTab(polls, 'ongoing', now, 12);

    expect(result).toHaveLength(10);
    expect(result[0].id).toBe(12);
    expect(result.some((item) => item.id === 11)).toBe(false);
  });
});
