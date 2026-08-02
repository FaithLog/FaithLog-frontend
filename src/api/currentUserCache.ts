import type {CurrentUser} from './types';

export type CurrentUserCacheEntry = {
  generation: number;
  user: CurrentUser;
};

export type CurrentUserReadLineage = {
  generation: number;
  mutationRevision: number;
  startedDuringMutation: boolean;
};

export type CurrentUserMutationLineage = {
  generation: number;
  mutationRevision: number;
};

type CurrentUserCacheListener = (entry: CurrentUserCacheEntry) => void;

let currentUserEntry: CurrentUserCacheEntry | null = null;
let mutationRevision = 0;
const activeMutationRevisions = new Set<number>();
const listeners = new Set<CurrentUserCacheListener>();

export function beginCurrentUserRead(generation: number): CurrentUserReadLineage {
  return {
    generation,
    mutationRevision,
    startedDuringMutation: activeMutationRevisions.size > 0,
  };
}

export function commitCurrentUserRead(
  lineage: CurrentUserReadLineage,
  user: CurrentUser,
) {
  if (
    lineage.mutationRevision !== mutationRevision ||
    lineage.startedDuringMutation ||
    activeMutationRevisions.size > 0
  ) {
    return false;
  }

  commitCurrentUser(lineage.generation, user);
  return true;
}

export function reconcileCurrentUserRead(
  lineage: CurrentUserReadLineage,
  user: CurrentUser,
) {
  if (commitCurrentUserRead(lineage, user)) return user;
  return readCurrentUserCache(lineage.generation, user.id) ?? user;
}

export function beginCurrentUserMutation(
  generation: number,
): CurrentUserMutationLineage {
  mutationRevision += 1;
  activeMutationRevisions.add(mutationRevision);
  return {generation, mutationRevision};
}

export function settleCurrentUserMutation(
  lineage: CurrentUserMutationLineage,
  user?: CurrentUser,
) {
  activeMutationRevisions.delete(lineage.mutationRevision);
  if (!user || lineage.mutationRevision !== mutationRevision) return false;

  commitCurrentUser(lineage.generation, user);
  return true;
}

export function readCurrentUserCache(generation: number, userId: number) {
  if (
    currentUserEntry?.generation !== generation ||
    currentUserEntry.user.id !== userId
  ) {
    return undefined;
  }

  return currentUserEntry.user;
}

export function subscribeCurrentUserCache(listener: CurrentUserCacheListener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function clearCurrentUserCache() {
  currentUserEntry = null;
  mutationRevision += 1;
  activeMutationRevisions.clear();
}

function commitCurrentUser(generation: number, user: CurrentUser) {
  currentUserEntry = {generation, user};
  listeners.forEach((listener) => listener(currentUserEntry as CurrentUserCacheEntry));
}
