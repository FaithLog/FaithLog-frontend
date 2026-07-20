import type {AnalyticsScreenName} from './analyticsContract';
import type {ShellRoute} from '../navigation/shellRoutes';

type AuthStatus =
  | 'authenticated'
  | 'configurationError'
  | 'error'
  | 'loading'
  | 'noCampus'
  | 'offline'
  | 'conflict'
  | 'permissionDenied'
  | 'sessionExpired'
  | 'signedOut';
type EntryTarget = 'login' | 'signup' | 'inviteCode' | 'campusCreate' | 'campusSelect' | 'campusDetail' | null;
type ProfileView = 'accountDeletion' | 'coffee' | 'main' | 'meal' | 'notifications';

export function getPublicAnalyticsScreen(
  authStatus: AuthStatus,
  entryTarget: EntryTarget,
): AnalyticsScreenName | null {
  if (authStatus === 'noCampus') return 'campus_join';
  if (authStatus === 'signedOut' || authStatus === 'sessionExpired' || authStatus === 'configurationError') {
    return entryTarget === 'signup' ? 'sign_up' : 'login';
  }
  return null;
}

export function getAuthenticatedAnalyticsScreen({
  entryTarget,
  profileView,
  route,
}: {
  entryTarget: EntryTarget;
  profileView: ProfileView;
  route: ShellRoute;
}): AnalyticsScreenName | null {
  if (entryTarget === 'inviteCode' || entryTarget === 'campusCreate' || entryTarget === 'campusSelect' || entryTarget === 'campusDetail') {
    return 'campus_join';
  }

  switch (route) {
    case 'userHome': return 'home';
    case 'devotion': return 'devotion';
    case 'payments': return 'billing';
    case 'polls': return null;
    case 'prayers': return 'prayer';
    case 'profile':
      if (profileView === 'notifications') return 'notifications';
      if (profileView === 'coffee' || profileView === 'meal') return null;
      return 'settings';
    case 'campusAdmin':
    case 'serviceAdmin': return 'admin_dashboard';
    default: return null;
  }
}
