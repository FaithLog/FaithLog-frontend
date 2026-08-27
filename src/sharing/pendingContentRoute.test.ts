import {beforeEach, describe, expect, it} from 'vitest';

import {
  clearPendingContentRoute,
  consumePendingContentRoute,
  peekPendingContentRoute,
  setPendingContentRoute,
} from './pendingContentRoute';

describe('pending content deep link memory lifecycle', () => {
  beforeEach(clearPendingContentRoute);

  it('stores structured ids in memory and consumes exactly once', () => {
    const route = {campusId: 1, contentId: 2, type: 'poll'} as const;
    setPendingContentRoute(route);
    expect(peekPendingContentRoute()).toEqual(route);
    expect(consumePendingContentRoute()).toEqual(route);
    expect(consumePendingContentRoute()).toBeNull();
  });

  it('clears pending navigation on login cancellation or logout', () => {
    setPendingContentRoute({campusId: 1, contentId: 2, type: 'announcement'});
    clearPendingContentRoute();
    expect(peekPendingContentRoute()).toBeNull();
  });
});
