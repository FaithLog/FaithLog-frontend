import {describe, expect, it} from 'vitest';

import {getAuthenticatedAnalyticsScreen, getPublicAnalyticsScreen} from './analyticsScreenState';

describe('logical app screen Analytics mapping', () => {
  it('maps public auth and campus onboarding without input-derived names', () => {
    expect(getPublicAnalyticsScreen('signedOut', null)).toBe('login');
    expect(getPublicAnalyticsScreen('signedOut', 'signup')).toBe('sign_up');
    expect(getPublicAnalyticsScreen('noCampus', 'inviteCode')).toBe('campus_join');
    expect(getPublicAnalyticsScreen('loading', null)).toBeNull();
  });

  it('maps fixed shell routes and leaves poll list/detail to PollScreen', () => {
    expect(getAuthenticatedAnalyticsScreen({entryTarget: null, profileView: 'main', route: 'userHome'})).toBe('home');
    expect(getAuthenticatedAnalyticsScreen({entryTarget: null, profileView: 'main', route: 'devotion'})).toBe('devotion');
    expect(getAuthenticatedAnalyticsScreen({entryTarget: null, profileView: 'main', route: 'payments'})).toBe('billing');
    expect(getAuthenticatedAnalyticsScreen({entryTarget: null, profileView: 'main', route: 'polls'})).toBeNull();
    expect(getAuthenticatedAnalyticsScreen({entryTarget: null, profileView: 'notifications', route: 'profile'})).toBe('notifications');
    expect(getAuthenticatedAnalyticsScreen({entryTarget: null, profileView: 'coffee', route: 'profile'})).toBeNull();
    expect(getAuthenticatedAnalyticsScreen({entryTarget: null, profileView: 'meal', route: 'profile'})).toBeNull();
    expect(getAuthenticatedAnalyticsScreen({entryTarget: null, profileView: 'main', route: 'campusAdmin'})).toBe('admin_dashboard');
    expect(getAuthenticatedAnalyticsScreen({entryTarget: 'campusDetail', profileView: 'main', route: 'userHome'})).toBe('campus_join');
  });
});
