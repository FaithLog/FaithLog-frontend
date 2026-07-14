import type {AdminCampusMember, DutyAssignment} from '../api/types';

export type AdminMemberFilter = 'ALL' | 'ADMINS' | 'MEMBERS' | 'COFFEE' | 'MEAL';

export const adminMemberDutyFilters: Array<{
  id: AdminMemberFilter;
  label: string;
}> = [
  {id: 'ALL', label: '전체'},
  {id: 'ADMINS', label: '리더'},
  {id: 'MEMBERS', label: '멤버'},
  {id: 'COFFEE', label: '커피'},
  {id: 'MEAL', label: '밥'},
];

const adminRoles = new Set(['MINISTER', 'ELDER', 'CAMPUS_LEADER']);

type DutyRequestIdentity = {
  campusId: number;
  dutyType: 'COFFEE' | 'MEAL';
  userId: number;
};

type DutyIdentity = Pick<
  DutyAssignment,
  'campusId' | 'dutyType' | 'isActive' | 'userId'
>;

export function isActiveDutyForRequest(
  duty: DutyIdentity,
  request: DutyRequestIdentity,
) {
  return duty.isActive &&
    duty.campusId === request.campusId &&
    duty.userId === request.userId &&
    duty.dutyType === request.dutyType;
}

export function assertAdminDutyAssignmentsForCampus(
  duties: DutyAssignment[],
  members: AdminCampusMember[],
  campusId: number,
) {
  const memberUserIds = new Set(
    members
      .filter((member) => member.campusId === campusId)
      .map((member) => member.userId),
  );
  const identities = new Set<string>();

  for (const duty of duties) {
    if (
      duty.campusId !== campusId ||
      !memberUserIds.has(duty.userId) ||
      (duty.dutyType !== 'COFFEE' && duty.dutyType !== 'MEAL')
    ) {
      throw new Error('Invalid duty assignment identity');
    }
    const identity = `${duty.campusId}:${duty.userId}:${duty.dutyType}`;
    if (identities.has(identity)) {
      throw new Error('Duplicate duty assignment identity');
    }
    identities.add(identity);
  }

  return duties;
}

export function filterAdminMembersByDuty(
  members: AdminCampusMember[],
  filter: AdminMemberFilter,
  duties: DutyAssignment[],
  campusId: number,
) {
  const validatedDuties = assertAdminDutyAssignmentsForCampus(duties, members, campusId);
  switch (filter) {
    case 'ALL':
      return members;
    case 'ADMINS':
      return members.filter((member) => adminRoles.has(member.campusRole));
    case 'MEMBERS':
      return members.filter((member) => member.campusRole === 'MEMBER');
    case 'COFFEE':
    case 'MEAL': {
      const activeDutyUserIds = new Set(
        validatedDuties
          .filter((duty) => isActiveDutyForRequest(duty, {
            campusId,
            dutyType: filter,
            userId: duty.userId,
          }))
          .map((duty) => duty.userId),
      );
      return members.filter((member) => activeDutyUserIds.has(member.userId));
    }
    default:
      return assertNever(filter);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected admin member filter: ${String(value)}`);
}
