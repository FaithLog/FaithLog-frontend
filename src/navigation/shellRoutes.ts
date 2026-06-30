import type {CampusMembershipSummary, CurrentUser, UserRole} from '../api/types';

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
const GLOBAL_CAMPUS_ADMIN_ROLES = new Set<UserRole>(['ADMIN', 'MANAGER']);
export const USER_BOTTOM_NAV_ROUTES = [
  'userHome',
  'devotion',
  'polls',
  'payments',
  'profile',
] as const satisfies readonly ShellRoute[];

export type AdminModeRoute = Extract<ShellRoute, 'campusAdmin' | 'serviceAdmin'>;

export function canUseCampusAdmin(user: CurrentUser, campus: CampusMembershipSummary) {
  return GLOBAL_CAMPUS_ADMIN_ROLES.has(user.role) || CAMPUS_ADMIN_ROLES.has(campus.campusRole);
}

export function canUseServiceAdmin(user: CurrentUser) {
  return user.role === 'ADMIN';
}

export function getAdminModeRoutes(
  user: CurrentUser,
  campus: CampusMembershipSummary,
): AdminModeRoute[] {
  const routes: AdminModeRoute[] = [];

  if (canUseCampusAdmin(user, campus)) {
    routes.push('campusAdmin');
  }

  if (canUseServiceAdmin(user)) {
    routes.push('serviceAdmin');
  }

  return routes;
}

export function getAvailableRoutes(
  user: CurrentUser,
  campus: CampusMembershipSummary,
): ShellRoute[] {
  const routes: ShellRoute[] = ['userHome', 'devotion', 'payments', 'polls', 'prayers', 'profile'];
  return [...routes, ...getAdminModeRoutes(user, campus)];
}

export function getRouteLabel(route: ShellRoute) {
  switch (route) {
    case 'userHome':
      return '홈';
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
