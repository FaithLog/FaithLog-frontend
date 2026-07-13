export type MealMutationGate = {
  identityKey: string | null;
  inFlight: boolean;
  operationId: number;
};

export type MealMutationResult<T> =
  | {status: 'duplicate'}
  | {status: 'failed'; error: unknown}
  | {status: 'success'; value: T}
  | {status: 'successWithRefreshWarning'; refreshError: unknown; value: T};

export function createMealMutationGate(): MealMutationGate {
  return {identityKey: null, inFlight: false, operationId: 0};
}

export function isMealMutationInFlight(gate: MealMutationGate) {
  return gate.inFlight;
}

export function beginMealMutation(gate: MealMutationGate, identityKey = 'default') {
  if (gate.inFlight && gate.identityKey === identityKey) return null;
  gate.inFlight = true;
  gate.identityKey = identityKey;
  gate.operationId += 1;
  return gate.operationId;
}

export function finishMealMutation(gate: MealMutationGate, operationId: number) {
  if (gate.operationId !== operationId) return false;
  gate.inFlight = false;
  gate.identityKey = null;
  return true;
}

export function finishMealMutationForScope<T>({
  currentScope,
  gate,
  mounted,
  operationId,
  operationScope,
}: {
  currentScope: T;
  gate: MealMutationGate;
  mounted: boolean;
  operationId: number;
  operationScope: T;
}) {
  const operationFinished = finishMealMutation(gate, operationId);
  return operationFinished && mounted && currentScope === operationScope;
}

export function invalidateMealMutationGate(gate: MealMutationGate) {
  gate.operationId += 1;
  gate.inFlight = false;
  gate.identityKey = null;
}

export async function runMealMutation<T>({
  gate,
  mutation,
  refresh,
}: {
  gate: MealMutationGate;
  mutation: () => Promise<T>;
  refresh: () => Promise<unknown>;
}): Promise<MealMutationResult<T>> {
  const operationId = beginMealMutation(gate);
  if (operationId === null) return {status: 'duplicate'};
  try {
    let value: T;
    try {
      value = await mutation();
    } catch (error) {
      return {status: 'failed', error};
    }

    try {
      await refresh();
      return {status: 'success', value};
    } catch (refreshError) {
      return {status: 'successWithRefreshWarning', refreshError, value};
    }
  } finally {
    finishMealMutation(gate, operationId);
  }
}
