import type {ShellRoute} from './shellRoutes';

export type ShellScrollOwner = 'route' | 'shell';

export function getShellScrollOwner(
  route: ShellRoute,
  authenticatedEntryTargetActive: boolean,
): ShellScrollOwner {
  return (route === 'polls' || route === 'announcements') && !authenticatedEntryTargetActive
    ? 'route'
    : 'shell';
}
