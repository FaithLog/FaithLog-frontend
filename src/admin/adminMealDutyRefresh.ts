import type {
  AdminCampusMember,
  AdminDashboardSummary,
  DutyAssignment,
} from '../api/types';
import {assertAdminDutyAssignmentsForCampus} from './adminMemberDutyFilter';

export type AdminMealDutyRefreshState =
  | {status: 'empty'; summary: AdminDashboardSummary}
  | {
      status: 'success';
      duties: DutyAssignment[];
      members: AdminCampusMember[];
      summary: AdminDashboardSummary;
    };

type AdminMealDutyRefreshPayload = {
  duties: DutyAssignment[];
  members: AdminCampusMember[];
  summary: AdminDashboardSummary;
};

export type AdminMealDutyRefreshResult =
  | {status: 'applied'}
  | {status: 'failed'; error: unknown}
  | {status: 'stale'};

export async function coordinateAdminMealDutyRefresh({
  apply,
  campusId,
  isCurrent,
  request,
}: {
  apply: (state: AdminMealDutyRefreshState) => void;
  campusId: number;
  isCurrent: () => boolean;
  request: () => Promise<AdminMealDutyRefreshPayload>;
}): Promise<AdminMealDutyRefreshResult> {
  try {
    const {duties, members, summary} = await request();
    if (!isCurrent()) return {status: 'stale'};

    const validatedDuties = assertAdminDutyAssignmentsForCampus(duties, members, campusId);
    if (!isCurrent()) return {status: 'stale'};

    apply(
      members.length === 0
        ? {status: 'empty', summary}
        : {status: 'success', summary, members, duties: validatedDuties},
    );
    return {status: 'applied'};
  } catch (error) {
    return {status: 'failed', error};
  }
}
