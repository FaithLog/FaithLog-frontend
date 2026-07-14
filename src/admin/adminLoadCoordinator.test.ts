import {describe, expect, it} from 'vitest';

import {
  beginAdminLoad,
  commitAdminLoadCampus,
  createAdminLoadCoordinator,
  isAdminLoadCurrent,
} from './adminLoadCoordinator';

describe('admin load coordinator', () => {
  it('drops a deferred A response after committing campus B', async () => {
    const coordinator = createAdminLoadCoordinator(1);
    const loadA = beginAdminLoad(coordinator, 1, 10);
    expect(loadA).not.toBeNull();
    const responseA = deferred<string>();
    const applied: string[] = [];
    const operationA = responseA.promise.then((value) => {
      if (isAdminLoadCurrent(coordinator, loadA!, currentContext(10))) applied.push(value);
    });

    commitAdminLoadCampus(coordinator, 2);
    responseA.resolve('campus-a');
    await operationA;

    expect(applied).toEqual([]);
  });

  it('drops a deferred old A response after A to B to A and applies only newest A', async () => {
    const coordinator = createAdminLoadCoordinator(1);
    const oldA = beginAdminLoad(coordinator, 1, 10)!;
    const oldResponse = deferred<string>();
    const newResponse = deferred<string>();
    const applied: string[] = [];
    const oldOperation = oldResponse.promise.then((value) => {
      if (isAdminLoadCurrent(coordinator, oldA, currentContext(10))) applied.push(value);
    });
    commitAdminLoadCampus(coordinator, 2);
    commitAdminLoadCampus(coordinator, 1);
    const newA = beginAdminLoad(coordinator, 1, 10)!;
    const newOperation = newResponse.promise.then((value) => {
      if (isAdminLoadCurrent(coordinator, newA, currentContext(10))) applied.push(value);
    });

    newResponse.resolve('new-a');
    await newOperation;
    oldResponse.resolve('old-a');
    await oldOperation;

    expect(applied).toEqual(['new-a']);
  });

  it('requires exact generation, mounted state, and an open request gate', () => {
    const coordinator = createAdminLoadCoordinator(1);
    const load = beginAdminLoad(coordinator, 1, 10)!;

    expect(isAdminLoadCurrent(coordinator, load, {
      currentGeneration: 11,
      mounted: true,
      requestAllowed: true,
    })).toBe(false);
    expect(isAdminLoadCurrent(coordinator, load, {
      currentGeneration: 10,
      mounted: false,
      requestAllowed: true,
    })).toBe(false);
    expect(isAdminLoadCurrent(coordinator, load, {
      currentGeneration: 10,
      mounted: true,
      requestAllowed: false,
    })).toBe(false);
  });
});

function currentContext(currentGeneration: number) {
  return {currentGeneration, mounted: true, requestAllowed: true};
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return {promise, resolve};
}
