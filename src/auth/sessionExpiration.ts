import {clearTokens, getAuthSessionGeneration, type AuthSessionGeneration} from '../api/tokenStorage';

export type SessionExpirationEvent = {
  expiredGeneration: AuthSessionGeneration;
  clearedGeneration: AuthSessionGeneration;
};

const listeners = new Set<(event: SessionExpirationEvent) => void>();

export function subscribeSessionExpiration(listener: (event: SessionExpirationEvent) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function expireAuthSession(generation: AuthSessionGeneration) {
  const clearing = clearTokens(generation);
  const clearedGeneration = getAuthSessionGeneration();
  if (clearedGeneration === generation + 1) {
    const event = {expiredGeneration: generation, clearedGeneration};
    listeners.forEach((listener) => listener(event));
  }
  return clearing;
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
