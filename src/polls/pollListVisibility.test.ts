import {describe, expect, it} from 'vitest';

import type {PollSummary} from '../api/types';
import {
  getUserPollListGroups,
  isEndedPoll,
  isPollActionable,
  isRecentlyEndedPoll,
} from './pollListVisibility';

function poll(patch: Partial<PollSummary>): PollSummary {
  return {
    id: patch.id ?? 1,
    campusId: 1,
    title: patch.title ?? '투표',
    pollType: 'CUSTOM',
    selectionType: 'SINGLE',
    isAnonymous: false,
    startsAt: '2026-06-28T09:00:00.000Z',
    endsAt: patch.endsAt ?? '2026-06-29T09:00:00.000Z',
    status: patch.status ?? 'OPEN',
    responded: patch.responded ?? false,
    manageableByMe: patch.manageableByMe ?? false,
    ...patch,
  };
}

describe('user poll list visibility', () => {
  const now = new Date('2026-06-29T09:00:00.000Z');

  it('keeps future open unanswered polls in the active section', () => {
    const activePoll = poll({
      id: 10,
      status: 'OPEN',
      responded: false,
      endsAt: '2026-06-29T10:00:00.000Z',
    });

    const groups = getUserPollListGroups([activePoll], now);

    expect(isPollActionable(activePoll, now)).toBe(true);
    expect(groups.activePolls).toEqual([activePoll]);
    expect(groups.recentlyClosedPolls).toEqual([]);
  });

  it('keeps future open responded polls in the responded section', () => {
    const respondedPoll = poll({
      id: 12,
      status: 'OPEN',
      responded: true,
      endsAt: '2026-06-29T10:00:00.000Z',
    });

    const groups = getUserPollListGroups([respondedPoll], now);

    expect(groups.activePolls).toEqual([]);
    expect(groups.respondedPolls).toEqual([respondedPoll]);
    expect(groups.recentlyClosedPolls).toEqual([]);
  });

  it('returns empty active data alongside recent closed data for the compact active empty state', () => {
    const expiredOpenPoll = poll({
      id: 15,
      status: 'OPEN',
      responded: false,
      endsAt: '2026-06-29T08:30:00.000Z',
    });

    const groups = getUserPollListGroups([expiredOpenPoll], now);

    expect(groups.activePolls).toEqual([]);
    expect(groups.respondedPolls).toEqual([]);
    expect(groups.recentlyClosedPolls).toEqual([expiredOpenPoll]);
  });

  it('shows status closed polls for 24 hours in the closed section', () => {
    const closedPoll = poll({
      id: 20,
      status: 'CLOSED',
      responded: true,
      endsAt: '2026-06-28T09:00:00.000Z',
    });

    const groups = getUserPollListGroups([closedPoll], now);

    expect(isEndedPoll(closedPoll, now)).toBe(true);
    expect(isRecentlyEndedPoll(closedPoll, now)).toBe(true);
    expect(groups.respondedPolls).toEqual([]);
    expect(groups.recentlyClosedPolls).toEqual([closedPoll]);
  });

  it('moves expired open polls into the closed section for 24 hours', () => {
    const expiredOpenPoll = poll({
      id: 25,
      status: 'OPEN',
      responded: false,
      endsAt: '2026-06-29T08:30:00.000Z',
    });

    const groups = getUserPollListGroups([expiredOpenPoll], now);

    expect(isEndedPoll(expiredOpenPoll, now)).toBe(true);
    expect(isPollActionable(expiredOpenPoll, now)).toBe(false);
    expect(groups.activePolls).toEqual([]);
    expect(groups.recentlyClosedPolls).toEqual([expiredOpenPoll]);
  });

  it('hides ended polls after the 24 hour window from the user list', () => {
    const oldClosedPoll = poll({
      id: 30,
      status: 'CLOSED',
      responded: true,
      endsAt: '2026-06-28T08:59:59.000Z',
    });

    const groups = getUserPollListGroups([oldClosedPoll], now);

    expect(isEndedPoll(oldClosedPoll, now)).toBe(true);
    expect(isRecentlyEndedPoll(oldClosedPoll, now)).toBe(false);
    expect(groups.activePolls).toEqual([]);
    expect(groups.respondedPolls).toEqual([]);
    expect(groups.recentlyClosedPolls).toEqual([]);
  });

  it('hides expired open polls after the 24 hour window from the user list', () => {
    const oldExpiredOpenPoll = poll({
      id: 35,
      status: 'OPEN',
      responded: false,
      endsAt: '2026-06-28T08:59:59.000Z',
    });

    const groups = getUserPollListGroups([oldExpiredOpenPoll], now);

    expect(isEndedPoll(oldExpiredOpenPoll, now)).toBe(true);
    expect(groups.activePolls).toEqual([]);
    expect(groups.recentlyClosedPolls).toEqual([]);
  });

  it('does not show invalid ended data as actionable', () => {
    const invalidOpenPoll = poll({
      id: 36,
      status: 'OPEN',
      responded: false,
      endsAt: 'not-a-date',
    });

    const groups = getUserPollListGroups([invalidOpenPoll], now);

    expect(isEndedPoll(invalidOpenPoll, now)).toBe(true);
    expect(isRecentlyEndedPoll(invalidOpenPoll, now)).toBe(false);
    expect(groups.activePolls).toEqual([]);
    expect(groups.recentlyClosedPolls).toEqual([]);
  });

  it('does not mutate the source list so admin screens can keep their full poll history', () => {
    const openPoll = poll({
      id: 40,
      status: 'OPEN',
      endsAt: '2026-06-29T10:00:00.000Z',
    });
    const oldClosedPoll = poll({
      id: 41,
      status: 'CLOSED',
      endsAt: '2026-06-27T09:00:00.000Z',
      responded: true,
    });
    const polls = [openPoll, oldClosedPoll];

    getUserPollListGroups(polls, now);

    expect(polls).toEqual([openPoll, oldClosedPoll]);
  });
});
