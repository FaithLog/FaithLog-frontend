import {describe, expect, it} from 'vitest';

import type {PollSummary} from '../api/types';
import {filterAdminPollsByType} from './adminPollTypeFilter';

const polls = [
  poll(1, 'COFFEE'),
  poll(2, 'MEAL'),
  poll(3, 'CUSTOM'),
  poll(4, 'WEDNESDAY'),
];

describe('admin poll type filtering', () => {
  it('groups coffee and meal polls into one operations filter', () => {
    expect(filterAdminPollsByType(polls, 'COFFEE_MEAL').map((item) => item.id))
      .toEqual([1, 2]);
  });

  it('keeps the all and individual filters intact', () => {
    expect(filterAdminPollsByType(polls, 'ALL')).toEqual(polls);
    expect(filterAdminPollsByType(polls, 'CUSTOM').map((item) => item.id))
      .toEqual([3]);
  });
});

function poll(id: number, pollType: string): PollSummary {
  return {
    campusId: 1,
    id,
    isAnonymous: false,
    allowUserOptionAdd: false,
    title: `투표 ${id}`,
    pollType,
    selectionType: 'SINGLE',
    startsAt: '2026-07-15T00:00:00Z',
    endsAt: '2026-07-16T00:00:00Z',
    status: 'OPEN',
    responded: false,
    manageableByMe: false,
  };
}
