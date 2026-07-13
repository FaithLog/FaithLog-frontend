import type {ApiError} from '../api/types';

export function shouldHandleRequestError(
  error: ApiError,
  requestGeneration: number,
  currentGeneration: number,
) {
  if (error.code === 'AUTH_SESSION_CHANGED') return false;
  if (currentGeneration === requestGeneration) return true;
  return error.kind === 'sessionExpired' &&
    error.authSessionGeneration === requestGeneration &&
    currentGeneration === requestGeneration + 1;
}
