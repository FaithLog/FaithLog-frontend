import {describe, expect, it} from 'vitest';

import type {CampusMembershipSummary, CurrentUser} from '../api/types';
import {getAvailableRoutes, getDefaultAuthenticatedRoute} from './shellRoutes';

const memberCampus: CampusMembershipSummary = {
  campusId: 10,
  campusName: '분당 1캠',
  campusRole: 'MEMBER',
  membershipId: 100,
  region: '분당',
  status: 'ACTIVE',
};

const campusLeaderCampus: CampusMembershipSummary = {
  ...memberCampus,
  campusRole: 'CAMPUS_LEADER',
};

const baseUser: CurrentUser = {
  campusMemberships: [memberCampus],
  email: 'user@example.test',
  id: 1,
  isActive: true,
  lastLoginAt: null,
  name: '테스트 사용자',
  role: 'USER',
};

describe('shell route role model', () => {
  it('keeps normal user pages as the default authenticated route', () => {
    expect(getDefaultAuthenticatedRoute()).toBe('userHome');
  });

  it('allows global admins to use normal user pages and admin entry points', () => {
    const routes = getAvailableRoutes({...baseUser, role: 'ADMIN'}, memberCampus);

    expect(routes.slice(0, 6)).toEqual([
      'userHome',
      'devotion',
      'payments',
      'polls',
      'prayers',
      'profile',
    ]);
    expect(routes).toContain('campusAdmin');
    expect(routes).toContain('serviceAdmin');
  });

  it('does not expose admin-only entry points to normal members', () => {
    expect(getAvailableRoutes(baseUser, memberCampus)).toEqual([
      'userHome',
      'devotion',
      'payments',
      'polls',
      'prayers',
      'profile',
    ]);
  });

  it('exposes campus admin only for campus admin roles without service admin', () => {
    const routes = getAvailableRoutes(baseUser, campusLeaderCampus);

    expect(routes).toContain('campusAdmin');
    expect(routes).not.toContain('serviceAdmin');
  });
});
