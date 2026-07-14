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

export function filterAdminMembersByDuty(
  members: AdminCampusMember[],
  filter: AdminMemberFilter,
  duties: DutyAssignment[],
) {
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
        duties
          .filter((duty) => duty.isActive && duty.dutyType === filter)
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
