import {describe, expect, it} from 'vitest';

import type {AdminCampusMember, DutyAssignment} from '../api/types';
import {
  adminMemberDutyFilters,
  filterAdminMembersByDuty,
} from './adminMemberDutyFilter';

const members: AdminCampusMember[] = [
  member(1, '커피와 밥 담당'),
  member(2, '밥 담당'),
  member(3, '일반 멤버'),
];

const duties: DutyAssignment[] = [
  duty(11, 1, 'COFFEE', true),
  duty(12, 1, 'MEAL', true),
  duty(13, 2, 'MEAL', true),
  duty(14, 3, 'COFFEE', false),
];

describe('admin member duty filters', () => {
  it('places coffee and meal beside the existing role filters with short mobile labels', () => {
    expect(adminMemberDutyFilters).toEqual([
      {id: 'ALL', label: '전체'},
      {id: 'ADMINS', label: '리더'},
      {id: 'MEMBERS', label: '멤버'},
      {id: 'COFFEE', label: '커피'},
      {id: 'MEAL', label: '밥'},
    ]);
  });

  it('filters active coffee and meal duties independently from campus role', () => {
    expect(filterAdminMembersByDuty(members, 'COFFEE', duties).map((item) => item.userId))
      .toEqual([1]);
    expect(filterAdminMembersByDuty(members, 'MEAL', duties).map((item) => item.userId))
      .toEqual([1, 2]);
  });

  it('allows one member to appear in both duty filters and ignores inactive assignments', () => {
    expect(filterAdminMembersByDuty(members, 'COFFEE', duties)).toContainEqual(
      expect.objectContaining({userId: 1}),
    );
    expect(filterAdminMembersByDuty(members, 'MEAL', duties)).toContainEqual(
      expect.objectContaining({userId: 1}),
    );
    expect(filterAdminMembersByDuty(members, 'COFFEE', duties)).not.toContainEqual(
      expect.objectContaining({userId: 3}),
    );
  });
});

function member(userId: number, name: string): AdminCampusMember {
  return {
    membershipId: 100 + userId,
    campusId: 1,
    userId,
    name,
    email: `member${userId}@example.test`,
    campusRole: 'MEMBER',
    status: 'ACTIVE',
  };
}

function duty(
  assignmentId: number,
  userId: number,
  dutyType: 'COFFEE' | 'MEAL',
  isActive: boolean,
): DutyAssignment {
  return {
    assignmentId,
    campusId: 1,
    userId,
    name: `담당자 ${userId}`,
    email: `member${userId}@example.test`,
    dutyType,
    isActive,
    assignedAt: '2026-07-14T00:00:00.000Z',
  };
}
