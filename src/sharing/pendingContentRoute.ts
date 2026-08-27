import type {ContentDeepLinkTarget} from './contentSharing';

let pendingRoute: ContentDeepLinkTarget | null = null;

export function setPendingContentRoute(route: ContentDeepLinkTarget) {
  pendingRoute = {...route};
}

export function peekPendingContentRoute() {
  return pendingRoute ? {...pendingRoute} : null;
}

export function consumePendingContentRoute() {
  const route = peekPendingContentRoute();
  pendingRoute = null;
  return route;
}

export function clearPendingContentRoute() {
  pendingRoute = null;
}
