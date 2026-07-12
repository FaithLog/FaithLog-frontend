import type {ApiError} from '../api/types';

export function shouldHandleRequestError(
  error: ApiError,
  requestGeneration: number,
  currentGeneration: number,
) {
  if (currentGeneration === requestGeneration) return true;
  return error.kind === 'sessionExpired' &&
    error.code !== 'AUTH_SESSION_CHANGED' &&
    error.authSessionGeneration === requestGeneration;
}
