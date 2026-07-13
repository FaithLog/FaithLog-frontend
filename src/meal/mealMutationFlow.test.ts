import {describe, expect, it, vi} from 'vitest';

import {
  beginMealMutation,
  createMealMutationGate,
  finishMealMutation,
  runMealMutation,
} from './mealMutationFlow';

describe('MEAL mutation flow', () => {
  it.each([
    'poll create',
    'poll close',
    'account create',
    'account deactivate',
    'duty assign',
    'duty revoke',
  ])('single-flights a rapid %s double submit', async () => {
    let resolveMutation!: (value: number) => void;
    const mutation = vi.fn(() => new Promise<number>((resolve) => {
      resolveMutation = resolve;
    }));
    const gate = createMealMutationGate();

    const first = runMealMutation({gate, mutation, refresh: async () => undefined});
    const duplicate = runMealMutation({gate, mutation, refresh: async () => undefined});

    expect(mutation).toHaveBeenCalledTimes(1);
    await expect(duplicate).resolves.toEqual({status: 'duplicate'});
    resolveMutation(1);
    await expect(first).resolves.toMatchObject({status: 'success'});
  });

  it('keeps mutation success terminal when refresh fails and never resends mutation', async () => {
    const mutation = vi.fn(async () => ({id: 9}));
    const refresh = vi.fn(async () => {
      throw new Error('refresh unavailable');
    });

    const result = await runMealMutation({
      gate: createMealMutationGate(),
      mutation,
      refresh,
    });

    expect(result).toMatchObject({status: 'successWithRefreshWarning', value: {id: 9}});
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('replaces an in-flight gate when campus or session identity changes', () => {
    const gate = createMealMutationGate();
    const oldOperation = beginMealMutation(gate, 'campus:1/session:3');
    expect(beginMealMutation(gate, 'campus:1/session:3')).toBeNull();

    const currentOperation = beginMealMutation(gate, 'campus:2/session:4');
    expect(currentOperation).not.toBeNull();
    expect(finishMealMutation(gate, oldOperation ?? -1)).toBe(false);
    expect(finishMealMutation(gate, currentOperation ?? -1)).toBe(true);
  });
});
