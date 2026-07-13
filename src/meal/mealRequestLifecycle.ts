import type {ApiError} from '../api/types';
import {
  getAuthSessionGeneration,
  isAuthSessionRequestAllowed,
  StaleAuthSessionReadError,
  type AuthSessionGeneration,
} from '../api/tokenStorage';
import {
  expireMissingAuthSession,
  readCurrentAccessToken,
} from '../auth/accessTokenResolver';
import {shouldHandleRequestError} from '../auth/requestErrorLineage';

type MealRequestSeed = {
  channel: string;
  epoch: number;
  operationId: number;
  scope: string;
};

export type MealRequestIdentity = MealRequestSeed & {
  generation: AuthSessionGeneration;
};

export type MealRequestAccess = {
  accessToken: string;
  identity: MealRequestIdentity;
};

export type MealRequestAccessResult =
  | {status: 'ready'; request: MealRequestAccess}
  | {status: 'cancelled'; identity: MealRequestIdentity}
  | {status: 'error'; error: unknown; identity: MealRequestIdentity};

export type MealRequestTracker = ReturnType<typeof createMealRequestTracker>;

export function createMealRequestTracker(initialScope: string) {
  let scope = initialScope;
  let epoch = 0;
  let mounted = true;
  const operationIds = new Map<string, number>();

  const isOperationCurrent = (identity: MealRequestSeed) =>
    mounted &&
    identity.scope === scope &&
    identity.epoch === epoch &&
    operationIds.get(identity.channel) === identity.operationId;

  return {
    begin(channel: string): MealRequestSeed {
      const operationId = (operationIds.get(channel) ?? 0) + 1;
      operationIds.set(channel, operationId);
      return {channel, epoch, operationId, scope};
    },
    isOperationCurrent,
    isSuccessCurrent(identity: MealRequestIdentity, currentGeneration = getAuthSessionGeneration()) {
      return (
        isOperationCurrent(identity) &&
        identity.generation === currentGeneration &&
        isAuthSessionRequestAllowed(identity.generation)
      );
    },
    shouldApplyError(
      identity: MealRequestIdentity,
      error: ApiError,
      currentGeneration = getAuthSessionGeneration(),
    ) {
      return (
        isOperationCurrent(identity) &&
        shouldHandleRequestError(error, identity.generation, currentGeneration)
      );
    },
    syncScope(nextScope: string) {
      if (scope === nextScope) return;
      scope = nextScope;
      epoch += 1;
      operationIds.clear();
    },
    mount() {
      mounted = true;
    },
    unmount() {
      mounted = false;
      epoch += 1;
      operationIds.clear();
    },
  };
}

export function attachMealRequestGeneration(
  seed: MealRequestSeed,
  generation: AuthSessionGeneration,
): MealRequestIdentity {
  return {...seed, generation};
}

export async function resolveMealRequestAccess(
  tracker: MealRequestTracker,
  channel: string,
  onMissingSession: (message: string) => void,
): Promise<MealRequestAccessResult> {
  const generation = getAuthSessionGeneration();
  const identity = attachMealRequestGeneration(tracker.begin(channel), generation);

  try {
    const resolution = await readCurrentAccessToken();
    if (
      resolution.generation !== generation ||
      !tracker.isSuccessCurrent(identity)
    ) {
      return {status: 'cancelled', identity};
    }

    if (!resolution.accessToken) {
      expireMissingAuthSession(generation);
      if (tracker.isSuccessCurrent(identity)) {
        onMissingSession('로그인이 만료되었습니다. 다시 로그인해 주세요.');
      }
      return {status: 'cancelled', identity};
    }

    return {
      status: 'ready',
      request: {accessToken: resolution.accessToken, identity},
    };
  } catch (error) {
    if (error instanceof StaleAuthSessionReadError || !tracker.isSuccessCurrent(identity)) {
      return {status: 'cancelled', identity};
    }
    return {status: 'error', error, identity};
  }
}
