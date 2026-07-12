import {
  getAuthSessionGeneration,
  getStoredAuthSession,
  isAuthSessionRequestAllowed,
  StaleAuthSessionReadError,
  type AuthSessionGeneration,
} from '../api/tokenStorage';

export type AccessTokenResolution = {
  generation: AuthSessionGeneration;
  accessToken: string | null;
};

export async function readCurrentAccessToken(): Promise<AccessTokenResolution> {
  const generation = getAuthSessionGeneration();
  const session = await getStoredAuthSession(generation);
  if (!isAuthSessionRequestAllowed(generation) || session.generation !== generation) {
    throw new StaleAuthSessionReadError(generation);
  }
  return {generation, accessToken: session.accessToken};
}

export function isAccessTokenResolutionCurrent(resolution: AccessTokenResolution) {
  return isAuthSessionRequestAllowed(resolution.generation);
}

export async function resolveCurrentAccessToken(
  onMissing: (generation: AuthSessionGeneration) => void | Promise<void>,
) {
  const resolution = await readCurrentAccessToken();
  if (!isAccessTokenResolutionCurrent(resolution)) {
    throw new StaleAuthSessionReadError(resolution.generation);
  }
  if (!resolution.accessToken) {
    await onMissing(resolution.generation);
    return null;
  }
  return resolution.accessToken;
}
