import {describe, expect, it, vi} from 'vitest';

import type {
  AdminCampusMember,
  AdminDashboardSummary,
  DutyAssignment,
} from '../api/types';
import {coordinateAdminMealDutyRefresh} from './adminMealDutyRefresh';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const summary = {
  campus: {campusId: 1, campusName: '테스트 캠퍼스', region: 'SEOUL'},
  members: {activeCount: 1, inactiveCount: 0, adminCount: 0},
  devotion: {
    weekStartDate: '2026-07-13',
    submittedCount: 0,
    missingCount: 1,
    submitRate: 0,
  },
  charges: {unpaidAmount: 0, unpaidMemberCount: 0, byCategory: []},
  polls: {openCount: 0, recentlyClosedCount: 0, missingResponseCount: 0, recentlyClosedDays: 7},
} satisfies AdminDashboardSummary;

const members: AdminCampusMember[] = [
  {
    membershipId: 11,
    campusId: 1,
    userId: 101,
    name: '담당자',
    email: 'meal@example.test',
    campusRole: 'MEMBER',
    status: 'ACTIVE',
  },
];

const validDuty: DutyAssignment = {
  assignmentId: 21,
  campusId: 1,
  userId: 101,
  name: '담당자',
  email: 'meal@example.test',
  dutyType: 'MEAL',
  isActive: true,
  assignedAt: '2026-07-14T00:00:00.000Z',
};

describe('admin MEAL duty refresh production boundary', () => {
  it.each([
    ['assign', {...validDuty, campusId: 2}],
    ['revoke', {...validDuty, userId: 999}],
  ] as const)(
    'keeps the existing state when a deferred %s refresh returns an invalid duty identity',
    async (_operation, invalidDuty) => {
      const deferred = createDeferred<{
        duties: DutyAssignment[];
        members: AdminCampusMember[];
        summary: AdminDashboardSummary;
      }>();
      const apply = vi.fn();

      const resultPromise = coordinateAdminMealDutyRefresh({
        apply,
        campusId: 1,
        isCurrent: () => true,
        request: () => deferred.promise,
      });

      expect(apply).not.toHaveBeenCalled();
      deferred.resolve({summary, members, duties: [invalidDuty]});

      await expect(resultPromise).resolves.toMatchObject({status: 'failed'});
      expect(apply).not.toHaveBeenCalled();
    },
  );

  it('applies only validated duties after the deferred request settles', async () => {
    const deferred = createDeferred<{
      duties: DutyAssignment[];
      members: AdminCampusMember[];
      summary: AdminDashboardSummary;
    }>();
    const apply = vi.fn();
    const resultPromise = coordinateAdminMealDutyRefresh({
      apply,
      campusId: 1,
      isCurrent: () => true,
      request: () => deferred.promise,
    });

    deferred.resolve({summary, members, duties: [validDuty]});

    await expect(resultPromise).resolves.toEqual({status: 'applied'});
    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith({
      status: 'success',
      summary,
      members,
      duties: [validDuty],
    });
  });

  it('drops a valid deferred response when the operation becomes stale', async () => {
    const deferred = createDeferred<{
      duties: DutyAssignment[];
      members: AdminCampusMember[];
      summary: AdminDashboardSummary;
    }>();
    const apply = vi.fn();
    let current = true;
    const resultPromise = coordinateAdminMealDutyRefresh({
      apply,
      campusId: 1,
      isCurrent: () => current,
      request: () => deferred.promise,
    });

    current = false;
    deferred.resolve({summary, members, duties: [validDuty]});

    await expect(resultPromise).resolves.toEqual({status: 'stale'});
    expect(apply).not.toHaveBeenCalled();
  });
});

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return {promise, resolve};
}
