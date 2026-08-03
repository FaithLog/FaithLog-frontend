import {describe, expect, it} from 'vitest';

import {
  initialAnnouncementCacheSession,
  transitionAnnouncementCacheSession,
} from './announcementCacheSession';

describe('announcement cache auth-session cleanup policy', () => {
  it('defers cleanup during cold bootstrap and retains cache on successful authentication', () => {
    const loading = transitionAnnouncementCacheSession(initialAnnouncementCacheSession, {
      authStatus: 'loading',
      capabilityEnabled: true,
      userId: null,
    });
    const authenticated = transitionAnnouncementCacheSession(loading.state, {
      authStatus: 'authenticated',
      capabilityEnabled: true,
      userId: 42,
    });

    expect(loading.action).toEqual({type: 'none'});
    expect(authenticated.action).toEqual({type: 'none'});
    expect(authenticated.state.userId).toBe(42);
  });

  it('clears all discoverable caches once when cold bootstrap resolves signed out', () => {
    const loading = transitionAnnouncementCacheSession(initialAnnouncementCacheSession, {
      authStatus: 'loading',
      capabilityEnabled: true,
      userId: null,
    });
    const signedOut = transitionAnnouncementCacheSession(loading.state, {
      authStatus: 'signedOut',
      capabilityEnabled: true,
      userId: null,
    });
    const repeated = transitionAnnouncementCacheSession(signedOut.state, {
      authStatus: 'signedOut',
      capabilityEnabled: true,
      userId: null,
    });

    expect(signedOut.action).toEqual({type: 'clearAll'});
    expect(repeated.action).toEqual({type: 'none'});
  });

  it('clears a previous account across every campus on logout or account switch', () => {
    const authenticated = transitionAnnouncementCacheSession(initialAnnouncementCacheSession, {
      authStatus: 'authenticated',
      capabilityEnabled: true,
      userId: 42,
    });
    const switched = transitionAnnouncementCacheSession(authenticated.state, {
      authStatus: 'authenticated',
      capabilityEnabled: true,
      userId: 99,
    });
    const signedOut = transitionAnnouncementCacheSession(switched.state, {
      authStatus: 'sessionExpired',
      capabilityEnabled: true,
      userId: null,
    });

    expect(switched.action).toEqual({type: 'clearUser', userId: 42});
    expect(signedOut.action).toEqual({type: 'clearUser', userId: 99});
  });

  it('clears all caches once when the capability is disabled', () => {
    const disabled = transitionAnnouncementCacheSession(initialAnnouncementCacheSession, {
      authStatus: 'loading',
      capabilityEnabled: false,
      userId: null,
    });
    const repeated = transitionAnnouncementCacheSession(disabled.state, {
      authStatus: 'signedOut',
      capabilityEnabled: false,
      userId: null,
    });

    expect(disabled.action).toEqual({type: 'clearAll'});
    expect(repeated.action).toEqual({type: 'none'});
  });
});
