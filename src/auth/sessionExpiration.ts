import {getAuthSessionGeneration, startAuthSessionClear, type AuthSessionGeneration} from '../api/tokenStorage';
import {requireLocalSessionCleanupRestart, trackLocalSessionCleanup} from './localCleanupBarrier';
import {discardRefreshTokensForGeneration, hasIssuedRefreshTokens} from './refreshLogoutHandoff';
import {beginFcmTransitionCleanup} from './fcmTransitionCleanup';
import {clearCurrentUserCache} from '../api/currentUserCache';

export type SessionExpirationEvent = {
  expiredGeneration: AuthSessionGeneration;
  clearedGeneration: AuthSessionGeneration;
};

const listeners = new Set<(event: SessionExpirationEvent) => void>();

export function subscribeSessionExpiration(listener: (event: SessionExpirationEvent) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function expireAuthSession(generation: AuthSessionGeneration) {
  beginFcmTransitionCleanup(generation);
  const transition = startAuthSessionClear(generation);
  if (transition.cleared) clearCurrentUserCache();
  if (transition.cleared && hasIssuedRefreshTokens(generation)) {
    requireLocalSessionCleanupRestart();
    discardRefreshTokensForGeneration(generation);
  }
  const clearedGeneration = transition.currentGeneration;
  if (transition.cleared && clearedGeneration === generation + 1) {
    const event = {expiredGeneration: generation, clearedGeneration};
    listeners.forEach((listener) => listener(event));
  }
  return trackLocalSessionCleanup(transition.completion.then(() =>
    transition.cleared && getAuthSessionGeneration() === clearedGeneration));
}

export function isExpirationEventCurrent(
  event: SessionExpirationEvent,
  currentGeneration: number,
) {
  return currentGeneration === event.clearedGeneration &&
    event.clearedGeneration === event.expiredGeneration + 1;
}

export function createSessionExpirationHandler(
  getCurrentGeneration: () => number,
  onExpire: () => void,
) {
  return (event: SessionExpirationEvent) => {
    if (isExpirationEventCurrent(event, getCurrentGeneration())) onExpire();
  };
}
