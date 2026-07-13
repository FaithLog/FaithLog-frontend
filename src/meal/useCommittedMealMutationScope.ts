import {useLayoutEffect, useRef} from 'react';

import {invalidateMealMutationGate, type MealMutationGate} from './mealMutationFlow';

export function useCommittedMealMutationScope<T>(
  scope: T,
  gate: MealMutationGate,
  onCommittedScopeChange: () => void,
) {
  const committedScopeRef = useRef<T>(scope);

  useLayoutEffect(() => {
    if (committedScopeRef.current === scope) return;
    committedScopeRef.current = scope;
    invalidateMealMutationGate(gate);
    onCommittedScopeChange();
  }, [gate, onCommittedScopeChange, scope]);

  return committedScopeRef;
}
