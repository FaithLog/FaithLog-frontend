import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {CurrentUser} from './types';
import {
  beginCurrentUserMutation,
  beginCurrentUserRead,
  clearCurrentUserCache,
  commitCurrentUserRead,
  readCurrentUserCache,
  reconcileCurrentUserRead,
  settleCurrentUserMutation,
  subscribeCurrentUserCache,
} from './currentUserCache';

const user: CurrentUser = {
  id: 7,
  name: '기존 이름',
  email: 'user@example.test',
  role: 'USER',
  isActive: true,
  lastLoginAt: null,
  campusMemberships: [],
};

describe('current user cache', () => {
  beforeEach(clearCurrentUserCache);

  it('synchronizes the full PATCH UserMe for the matching generation and consumer', () => {
    commitCurrentUserRead(beginCurrentUserRead(3), user);
    const mutation = beginCurrentUserMutation(3);
    settleCurrentUserMutation(mutation, {...user, name: '새 이름'});
    expect(readCurrentUserCache(3, 7)).toEqual({...user, name: '새 이름'});
  });

  it('does not expose cached identity across auth generations or users', () => {
    commitCurrentUserRead(beginCurrentUserRead(3), user);
    expect(readCurrentUserCache(4, 7)).toBeUndefined();
    expect(readCurrentUserCache(3, 8)).toBeUndefined();
  });

  it('does not let a GET started before PATCH overwrite the mutation response', () => {
    const staleGet = beginCurrentUserRead(3);
    const patch = beginCurrentUserMutation(3);
    settleCurrentUserMutation(patch, {...user, name: 'PATCH 이름'});

    expect(commitCurrentUserRead(staleGet, user)).toBe(false);
    expect(readCurrentUserCache(3, 7)?.name).toBe('PATCH 이름');
  });

  it('returns the PATCH UserMe when a stale GET completes after the mutation', () => {
    const staleGet = beginCurrentUserRead(3);
    const updated = {...user, name: 'PATCH 이름'};
    settleCurrentUserMutation(beginCurrentUserMutation(3), updated);

    expect(reconcileCurrentUserRead(staleGet, user)).toBe(updated);
  });

  it('publishes the full current UserMe to the root consumer on mutation success', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCurrentUserCache(listener);
    const updated = {...user, name: '새 이름', role: 'ADMIN' as const};

    settleCurrentUserMutation(beginCurrentUserMutation(3), updated);

    expect(listener).toHaveBeenCalledWith({generation: 3, user: updated});
    unsubscribe();
  });
});
