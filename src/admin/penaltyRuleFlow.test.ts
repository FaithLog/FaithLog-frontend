import {describe, expect, it} from 'vitest';

import type {PenaltyRule, PenaltyRuleType} from '../api/types';
import {
  beginPenaltyRuleSave,
  createPenaltyRuleDraft,
  createPenaltyRuleSaveGate,
  finishPenaltyRuleSave,
  getAvailablePenaltyRuleTypes,
  getDuplicatePenaltyRuleTypes,
  isPenaltyRuleCreateTypeUnavailable,
  isPenaltyRuleDraftDirty,
  isPenaltyRuleRequestCurrent,
  invalidatePenaltyRuleSave,
  startPenaltyRuleCreateFlow,
  startPenaltyRuleEditFlow,
} from './penaltyRuleFlow';

describe('penalty rule flow', () => {
  it('offers only rule types that have no campus rule, including inactive rules', () => {
    const rules = [
      penaltyRule({ruleType: 'QUIET_TIME', isActive: false}),
      penaltyRule({id: 2, ruleType: 'SATURDAY_LATE'}),
    ];

    expect(getAvailablePenaltyRuleTypes(rules)).toEqual(['PRAYER', 'BIBLE_READING']);
    expect(startPenaltyRuleCreateFlow(rules)?.route).toBe('create');
  });

  it('blocks create entry after every type has been registered', () => {
    const rules = (
      ['QUIET_TIME', 'PRAYER', 'BIBLE_READING', 'SATURDAY_LATE'] as PenaltyRuleType[]
    ).map((ruleType, index) => penaltyRule({id: index + 1, ruleType}));

    expect(getAvailablePenaltyRuleTypes(rules)).toEqual([]);
    expect(startPenaltyRuleCreateFlow(rules)).toBeNull();
  });

  it('reports legacy duplicate types without making them selectable again', () => {
    const rules = [
      penaltyRule({id: 1, ruleType: 'PRAYER', isActive: false}),
      penaltyRule({id: 2, ruleType: 'PRAYER', isActive: true}),
    ];

    expect(getDuplicatePenaltyRuleTypes(rules)).toEqual(['PRAYER']);
    expect(getAvailablePenaltyRuleTypes(rules)).not.toContain('PRAYER');
    expect(getAvailablePenaltyRuleTypes(rules)).toContain('QUIET_TIME');
  });

  it('prefills edit content and treats the rule type as fixed', () => {
    const rule = penaltyRule({
      id: 42,
      ruleType: 'BIBLE_READING',
      requiredCount: 6,
      baseAmount: 100,
      amountPerUnit: 300,
      isActive: false,
    });
    const flow = startPenaltyRuleEditFlow(rule);

    expect(flow).toMatchObject({route: 'edit', ruleId: 42});
    if (flow.route !== 'edit') throw new Error('expected edit flow');
    expect(flow.initialDraft).toEqual({
      amountPerUnit: '300',
      baseAmount: '100',
      calculationType: 'MISSING_COUNT',
      isActive: false,
      requiredCount: '6',
      ruleId: 42,
      ruleType: 'BIBLE_READING',
    });
  });

  it('detects unsaved edits but not an untouched create draft', () => {
    const flow = startPenaltyRuleCreateFlow([]);
    if (!flow || flow.route !== 'create') throw new Error('expected create flow');

    expect(isPenaltyRuleDraftDirty(flow, flow.initialDraft)).toBe(false);
    expect(
      isPenaltyRuleDraftDirty(flow, {...flow.initialDraft, baseAmount: '1000'}),
    ).toBe(true);
  });

  it('marks a preserved create draft unavailable after a concurrent insert', () => {
    const flow = startPenaltyRuleCreateFlow([]);
    if (!flow || flow.route !== 'create') throw new Error('expected create flow');

    expect(
      isPenaltyRuleCreateTypeUnavailable(
        flow,
        {...createPenaltyRuleDraft('QUIET_TIME'), baseAmount: '500'},
        [penaltyRule({ruleType: 'QUIET_TIME'})],
      ),
    ).toBe(true);
  });

  it('rejects stale campus, auth generation, sequence, and unmounted responses', () => {
    const current = {
      currentCampusId: 2,
      currentGeneration: 7,
      currentSequence: 4,
      mounted: true,
      requestCampusId: 2,
      requestGeneration: 7,
      requestSequence: 4,
    };

    expect(isPenaltyRuleRequestCurrent(current)).toBe(true);
    expect(isPenaltyRuleRequestCurrent({...current, requestCampusId: 1})).toBe(false);
    expect(isPenaltyRuleRequestCurrent({...current, requestGeneration: 6})).toBe(false);
    expect(isPenaltyRuleRequestCurrent({...current, requestSequence: 3})).toBe(false);
    expect(isPenaltyRuleRequestCurrent({...current, mounted: false})).toBe(false);
  });

  it('blocks a second save synchronously while the first request is deferred', async () => {
    const gate = createPenaltyRuleSaveGate();
    let releaseRequest: (() => void) | undefined;
    const request = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    const firstOperationId = beginPenaltyRuleSave(gate);
    if (firstOperationId === null) throw new Error('expected first operation');

    const firstSave = request.then(() => finishPenaltyRuleSave(gate, firstOperationId));

    expect(beginPenaltyRuleSave(gate)).toBeNull();
    releaseRequest?.();
    await expect(firstSave).resolves.toBe(true);
    expect(gate.inFlight).toBe(false);
  });

  it('invalidates an older save when the campus changes and permits a new save', async () => {
    const gate = createPenaltyRuleSaveGate();
    let releaseOldRequest: (() => void) | undefined;
    const oldRequest = new Promise<void>((resolve) => {
      releaseOldRequest = resolve;
    });
    const oldOperationId = beginPenaltyRuleSave(gate);
    if (oldOperationId === null) throw new Error('expected old operation');
    const oldSave = oldRequest.then(() => finishPenaltyRuleSave(gate, oldOperationId));

    invalidatePenaltyRuleSave(gate);
    const newOperationId = beginPenaltyRuleSave(gate);

    expect(newOperationId).not.toBeNull();
    releaseOldRequest?.();
    await expect(oldSave).resolves.toBe(false);
    expect(gate.inFlight).toBe(true);
    expect(finishPenaltyRuleSave(gate, newOperationId ?? -1)).toBe(true);
  });
});

function penaltyRule(patch: Partial<PenaltyRule> = {}): PenaltyRule {
  return {
    id: 1,
    ruleType: 'QUIET_TIME',
    calculationType: patch.ruleType === 'SATURDAY_LATE' ? 'LATE_MINUTE' : 'MISSING_COUNT',
    requiredCount: 5,
    baseAmount: 0,
    amountPerUnit: 500,
    isActive: true,
    ...patch,
  };
}
