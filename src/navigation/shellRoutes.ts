import type {CampusMembershipSummary, CurrentUser} from '../api/types';
import {isAnnouncementCapabilityEnabled} from '../announcements/announcementEnvironment';
import {isWeeklyMaterialCapabilityEnabled} from '../weeklyMaterials/weeklyMaterialEnvironment';

export type ShellRoute =
  | 'userHome'
  | 'devotion'
  | 'payments'
  | 'polls'
  | 'prayers'
  | 'announcements'
  | 'weeklyMaterials'
  | 'profile'
  | 'campusAdmin'
  | 'serviceAdmin';

const CAMPUS_ADMIN_ROLES = new Set(['MINISTER', 'ELDER', 'CAMPUS_LEADER']);
export const USER_BOTTOM_NAV_ROUTES = [
  'userHome',
  'devotion',
  'polls',
  'payments',
  'profile',
] as const satisfies readonly ShellRoute[];
export type UserBottomNavRoute = (typeof USER_BOTTOM_NAV_ROUTES)[number];

export function isUserBottomNavVisibleRoute(route: ShellRoute) {
  return USER_BOTTOM_NAV_ROUTES.some((availableRoute) => availableRoute === route) ||
    route === 'prayers' ||
    route === 'announcements' ||
    route === 'weeklyMaterials';
}

export function getUserBottomNavActiveRoute(route: ShellRoute): UserBottomNavRoute {
  if (route === 'prayers' || route === 'announcements' || route === 'weeklyMaterials') return 'userHome';
  return USER_BOTTOM_NAV_ROUTES.find((availableRoute) => availableRoute === route) ?? 'userHome';
}

export type AdminModeRoute = Extract<ShellRoute, 'campusAdmin' | 'serviceAdmin'>;

export function canUseCampusAdmin(user: CurrentUser, campus: CampusMembershipSummary) {
  return user.role === 'ADMIN' || (
    campus.status === 'ACTIVE' && CAMPUS_ADMIN_ROLES.has(campus.campusRole)
  );
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
  const routes: ShellRoute[] = [
    'userHome',
    'devotion',
    'payments',
    'polls',
    'prayers',
    'profile',
  ];

  if (isAnnouncementCapabilityEnabled()) {
    routes.push('announcements');
  }
  if (isWeeklyMaterialCapabilityEnabled()) {
    routes.push('weeklyMaterials');
  }

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
    case 'announcements':
      return '공지';
    case 'weeklyMaterials':
      return '주간 자료';
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
