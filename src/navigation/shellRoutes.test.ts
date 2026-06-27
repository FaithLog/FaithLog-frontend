import {describe, expect, it} from 'vitest';

import type {CampusMembershipSummary, CurrentUser} from '../api/types';

import {
  getAdminModeRoutes,
  getAvailableRoutes,
  getRouteLabel,
  USER_BOTTOM_NAV_ROUTES,
} from './shellRoutes';

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

describe('admin mode routes', () => {
  it('hides admin entry points from regular users without a campus admin role', () => {
    expect(getAdminModeRoutes(createUser('USER'), createCampus('MEMBER'))).toEqual([]);
    expect(getAvailableRoutes(createUser('USER'), createCampus('MEMBER'))).not.toContain(
      'campusAdmin',
    );
  });

  it.each(['CAMPUS_LEADER', 'ELDER', 'MINISTER'] as const)(
    'allows %s campus members to enter campus admin mode',
    (campusRole) => {
      expect(getAdminModeRoutes(createUser('USER'), createCampus(campusRole))).toEqual([
        'campusAdmin',
      ]);
    },
  );

  it('allows global managers to enter campus admin mode', () => {
    expect(getAdminModeRoutes(createUser('MANAGER'), createCampus('MEMBER'))).toEqual([
      'campusAdmin',
    ]);
  });

  it('allows global admins to choose campus admin or service admin mode', () => {
    expect(getAdminModeRoutes(createUser('ADMIN'), createCampus('MEMBER'))).toEqual([
      'campusAdmin',
      'serviceAdmin',
    ]);
  });
});

function createUser(role: CurrentUser['role']): CurrentUser {
  return {
    campusMemberships: [],
    email: `${role.toLowerCase()}@faithlog.test`,
    id: 1,
    isActive: true,
    lastLoginAt: null,
    name: role,
    role,
  };
}

function createCampus(campusRole: CampusMembershipSummary['campusRole']): CampusMembershipSummary {
  return {
    campusId: 10,
    campusName: '서울 캠퍼스',
    campusRole,
    membershipId: 100,
    region: '서울',
    status: 'ACTIVE',
  };
}
