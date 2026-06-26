import {describe, expect, it} from 'vitest';

import {getRouteLabel, USER_BOTTOM_NAV_ROUTES} from './shellRoutes';

describe('USER_BOTTOM_NAV_ROUTES', () => {
  it('keeps the Figma user shell bottom nav to five fixed tabs', () => {
    expect(USER_BOTTOM_NAV_ROUTES).toEqual([
      'userHome',
      'devotion',
      'polls',
      'payments',
      'profile',
    ]);
    expect(USER_BOTTOM_NAV_ROUTES).toHaveLength(5);
    expect(USER_BOTTOM_NAV_ROUTES).not.toContain('prayers');
    expect(USER_BOTTOM_NAV_ROUTES).not.toContain('campusAdmin');
    expect(USER_BOTTOM_NAV_ROUTES).not.toContain('serviceAdmin');
  });

  it('uses the Figma bottom nav labels', () => {
    expect(USER_BOTTOM_NAV_ROUTES.map((route) => getRouteLabel(route))).toEqual([
      '홈',
      '경건',
      '투표',
      '납부',
      '내정보',
    ]);
  });
});
