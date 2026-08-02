export function isAuthenticatedPasswordResetCompletionCurrent(
  requestGeneration: number,
  requestUserId: number,
  currentGeneration: number,
  currentUserId: number,
) {
  return requestGeneration === currentGeneration && requestUserId === currentUserId;
}
