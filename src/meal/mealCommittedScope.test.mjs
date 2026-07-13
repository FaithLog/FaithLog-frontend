import React, {Suspense, useLayoutEffect} from 'react';
import {act, create} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

vi.mock('react-native', () => ({}));
vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: vi.fn(() => 1),
  isAuthSessionRequestAllowed: vi.fn(() => true),
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {},
}));
vi.mock('../auth/accessTokenResolver', () => ({
  expireMissingAuthSession: vi.fn(),
  readCurrentAccessToken: vi.fn(),
}));

import {
  beginMealMutation,
  createMealMutationGate,
  finishMealMutationForScope,
} from './mealMutationFlow';
import {useCommittedMealMutationScope} from './useCommittedMealMutationScope';
import {useMealRequestTracker} from './useMealRequestTracker';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const never = new Promise(() => undefined);

describe('committed MEAL scope boundaries', () => {
  it('does not invalidate a committed request from an abandoned speculative render', async () => {
    let committed;
    function Harness({scope, suspend}) {
      const value = useMealRequestTracker(scope);
      if (suspend) throw never;
      useLayoutEffect(() => {
        committed = value;
      }, [value]);
      return React.createElement('scope', {scope});
    }

    let renderer;
    await act(async () => {
      renderer = create(
        React.createElement(Suspense, {fallback: React.createElement('fallback')},
          React.createElement(Harness, {scope: 'campus:1', suspend: false})),
        {unstable_isConcurrent: true},
      );
    });
    const identity = committed.tracker.begin('load');

    await act(async () => {
      renderer.update(
        React.createElement(Suspense, {fallback: React.createElement('fallback')},
          React.createElement(Harness, {scope: 'campus:2', suspend: true})),
      );
    });

    expect(committed.tracker.isOperationCurrent(identity)).toBe(true);
  });

  it('invalidates requests only after the new scope commits', async () => {
    let committed;
    function Harness({scope}) {
      const value = useMealRequestTracker(scope);
      useLayoutEffect(() => {
        committed = value;
      }, [value]);
      return React.createElement('scope', {scope, scopeIsCommitted: value.scopeIsCommitted});
    }

    let renderer;
    await act(async () => {
      renderer = create(React.createElement(Harness, {scope: 'campus:1'}));
    });
    const identity = committed.tracker.begin('load');
    await act(async () => {
      renderer.update(React.createElement(Harness, {scope: 'campus:2'}));
    });

    expect(committed.tracker.isOperationCurrent(identity)).toBe(false);
    expect(renderer.root.findByType('scope').props.scopeIsCommitted).toBe(true);
  });

  it('keeps an admin mutation for speculative B but invalidates and resets it on committed B', async () => {
    const gate = createMealMutationGate();
    const reset = vi.fn();

    function Harness({campusId, suspend}) {
      useCommittedMealMutationScope(String(campusId), gate, reset);
      if (suspend) throw never;
      return React.createElement('admin-scope', {campusId});
    }

    let renderer;
    await act(async () => {
      renderer = create(
        React.createElement(Suspense, {fallback: React.createElement('fallback')},
          React.createElement(Harness, {campusId: 1, suspend: false})),
        {unstable_isConcurrent: true},
      );
    });
    const operationId = beginMealMutation(gate, 'campus:1');

    await act(async () => {
      renderer.update(
        React.createElement(Suspense, {fallback: React.createElement('fallback')},
          React.createElement(Harness, {campusId: 2, suspend: true})),
      );
    });
    expect(gate.operationId).toBe(operationId);
    expect(gate.inFlight).toBe(true);
    expect(reset).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(
        React.createElement(Suspense, {fallback: React.createElement('fallback')},
          React.createElement(Harness, {campusId: 2, suspend: false})),
      );
    });
    expect(gate.operationId).not.toBe(operationId);
    expect(gate.inFlight).toBe(false);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer admin A operation busy when an old A finally returns after committed A to B to A', async () => {
    const gate = createMealMutationGate();
    const reset = vi.fn();
    let committedScopeRef;

    function Harness({campusId}) {
      committedScopeRef = useCommittedMealMutationScope(campusId, gate, reset);
      return React.createElement('admin-scope', {campusId});
    }

    let renderer;
    await act(async () => {
      renderer = create(React.createElement(Harness, {campusId: 1}));
    });
    const oldAOperation = beginMealMutation(gate, 'campus:1/session:3');

    await act(async () => {
      renderer.update(React.createElement(Harness, {campusId: 2}));
    });
    await act(async () => {
      renderer.update(React.createElement(Harness, {campusId: 1}));
    });
    const newerAOperation = beginMealMutation(gate, 'campus:1/session:3');

    expect(finishMealMutationForScope({
      currentScope: committedScopeRef.current,
      gate,
      mounted: true,
      operationId: oldAOperation,
      operationScope: 1,
    })).toBe(false);
    expect(gate).toMatchObject({inFlight: true, operationId: newerAOperation});
    expect(reset).toHaveBeenCalledTimes(2);
  });
});
