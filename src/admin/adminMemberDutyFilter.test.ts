import {describe, expect, it} from 'vitest';

import type {AdminCampusMember, DutyAssignment} from '../api/types';
import {
  adminMemberDutyFilters,
  assertAdminDutyAssignmentsForCampus,
  filterAdminMembersByDuty,
  isActiveDutyForRequest,
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
    expect(filterAdminMembersByDuty(members, 'COFFEE', duties, 1).map((item) => item.userId))
      .toEqual([1]);
    expect(filterAdminMembersByDuty(members, 'MEAL', duties, 1).map((item) => item.userId))
      .toEqual([1, 2]);
  });

  it('allows one member to appear in both duty filters and ignores inactive assignments', () => {
    expect(filterAdminMembersByDuty(members, 'COFFEE', duties, 1)).toContainEqual(
      expect.objectContaining({userId: 1}),
    );
    expect(filterAdminMembersByDuty(members, 'MEAL', duties, 1)).toContainEqual(
      expect.objectContaining({userId: 1}),
    );
    expect(filterAdminMembersByDuty(members, 'COFFEE', duties, 1)).not.toContainEqual(
      expect.objectContaining({userId: 3}),
    );
  });

  it('fails closed for wrong-campus, unknown-member, type, and duplicate identities', () => {
    expect(() => assertAdminDutyAssignmentsForCampus([
      {...duties[0]!, campusId: 2},
    ], members, 1)).toThrow('Invalid duty assignment identity');
    expect(() => assertAdminDutyAssignmentsForCampus([
      {...duties[0]!, userId: 99},
    ], members, 1)).toThrow('Invalid duty assignment identity');
    expect(() => assertAdminDutyAssignmentsForCampus([
      {...duties[0]!, dutyType: 'UNKNOWN' as never},
    ], members, 1)).toThrow('Invalid duty assignment identity');
    expect(() => assertAdminDutyAssignmentsForCampus([
      duties[0]!, {...duties[0]!, assignmentId: 99},
    ], members, 1)).toThrow('Duplicate duty assignment identity');
  });

  it('requires exact campus, user, type and active state for profile access', () => {
    const coffee = duties[0]!;
    expect(isActiveDutyForRequest(coffee, {campusId: 1, dutyType: 'COFFEE', userId: 1}))
      .toBe(true);
    expect(isActiveDutyForRequest({...coffee, campusId: 2}, {campusId: 1, dutyType: 'COFFEE', userId: 1}))
      .toBe(false);
    expect(isActiveDutyForRequest(coffee, {campusId: 1, dutyType: 'MEAL', userId: 1}))
      .toBe(false);
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
