import type {CampusMembershipSummary, CurrentUser} from '../api/types';

export type ShellRoute =
  | 'userHome'
  | 'devotion'
  | 'payments'
  | 'polls'
  | 'prayers'
  | 'profile'
  | 'campusAdmin'
  | 'serviceAdmin';

const CAMPUS_ADMIN_ROLES = new Set(['MINISTER', 'ELDER', 'CAMPUS_LEADER']);

export function getAvailableRoutes(
  user: CurrentUser,
  campus: CampusMembershipSummary,
): ShellRoute[] {
  const routes: ShellRoute[] = ['userHome', 'devotion', 'payments', 'polls', 'prayers', 'profile'];

  if (user.role === 'ADMIN' || CAMPUS_ADMIN_ROLES.has(campus.campusRole)) {
    routes.push('campusAdmin');
  }

  if (user.role === 'ADMIN') {
    routes.push('serviceAdmin');
  }

  return routes;
}

export function getRouteLabel(route: ShellRoute) {
  switch (route) {
    case 'userHome':
      return '내 홈';
    case 'devotion':
      return '경건';
    case 'payments':
      return '납부';
    case 'polls':
      return '투표';
    case 'prayers':
      return '기도';
    case 'profile':
      return '내정보';
    case 'campusAdmin':
      return '관리자';
    case 'serviceAdmin':
      return 'Service ADMIN';
    default:
      return assertNever(route);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled route: ${String(value)}`);
}
