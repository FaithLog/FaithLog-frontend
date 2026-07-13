import {describe, expect, it} from 'vitest';

import type {PenaltyRule, PenaltyRuleType} from '../api/types';
import {
  beginPenaltyRuleSave,
  createPenaltyRuleSaveGate,
  deriveCurrentActivePenaltyRules,
  finishPenaltyRuleSave,
  hasActivePenaltyRuleType,
  isPenaltyRuleDraftDirty,
  isPenaltyRuleRequestCurrent,
  isPenaltyRuleSaveOperationCurrent,
  invalidatePenaltyRuleSave,
  startPenaltyRuleCreateFlow,
  startPenaltyRuleEditFlow,
} from './penaltyRuleFlow';

describe('penalty rule flow', () => {
  it('opens create with every rule type still available after existing rules', () => {
    const rules = [
      penaltyRule({ruleType: 'QUIET_TIME', isActive: false}),
      penaltyRule({id: 2, ruleType: 'SATURDAY_LATE'}),
    ];

    const current = deriveCurrentActivePenaltyRules(rules);
    const flow = startPenaltyRuleCreateFlow();

    expect(current.rules.map((rule) => rule.ruleType)).toEqual(['SATURDAY_LATE']);
    expect(flow.route).toBe('create');
    expect(flow.initialDraft.ruleType).toBe('QUIET_TIME');
  });

  it('keeps create available after every type has an active rule', () => {
    const rules = (
      ['QUIET_TIME', 'PRAYER', 'BIBLE_READING', 'SATURDAY_LATE'] as PenaltyRuleType[]
    ).map((ruleType, index) => penaltyRule({id: index + 1, ruleType}));

    expect(deriveCurrentActivePenaltyRules(rules).rules).toHaveLength(4);
    expect(startPenaltyRuleCreateFlow().route).toBe('create');
    expect(hasActivePenaltyRuleType(rules, 'PRAYER')).toBe(true);
  });

  it('hides inactive history and keeps only the latest id for duplicate active types', () => {
    const rules = [
      penaltyRule({id: 1, ruleType: 'PRAYER', isActive: false, amountPerUnit: 100}),
      penaltyRule({id: 2, ruleType: 'PRAYER', isActive: true, amountPerUnit: 200}),
      penaltyRule({id: 7, ruleType: 'PRAYER', isActive: true, amountPerUnit: 700}),
      penaltyRule({id: 4, ruleType: 'QUIET_TIME', isActive: true}),
    ];
    const current = deriveCurrentActivePenaltyRules(rules);

    expect(current.duplicateActiveTypes).toEqual(['PRAYER']);
    expect(current.rules.map((rule) => rule.id)).toEqual([4, 7]);
    expect(current.rules.find((rule) => rule.ruleType === 'PRAYER')).toMatchObject({
      amountPerUnit: 700,
      isActive: true,
    });
    expect(hasActivePenaltyRuleType(rules, 'PRAYER')).toBe(true);
    expect(
      hasActivePenaltyRuleType(
        [penaltyRule({ruleType: 'BIBLE_READING', isActive: false})],
        'BIBLE_READING',
      ),
    ).toBe(false);
  });

  it('prefills edit content and treats the rule type as fixed', () => {
    const rule = penaltyRule({
      id: 42,
      ruleType: 'BIBLE_READING',
      requiredCount: 6,
      baseAmount: 100,
      amountPerUnit: 300,
      isActive: true,
    });
    const flow = startPenaltyRuleEditFlow(rule);

    expect(flow).toMatchObject({route: 'edit', ruleId: 42});
    if (flow.route !== 'edit') throw new Error('expected edit flow');
    expect(flow.initialDraft).toEqual({
      amountPerUnit: '300',
      baseAmount: '100',
      calculationType: 'MISSING_COUNT',
      requiredCount: '6',
      ruleId: 42,
      ruleType: 'BIBLE_READING',
    });
  });

  it('detects unsaved edits but not an untouched create draft', () => {
    const flow = startPenaltyRuleCreateFlow();

    expect(isPenaltyRuleDraftDirty(flow, flow.initialDraft)).toBe(false);
    expect(
      isPenaltyRuleDraftDirty(flow, {...flow.initialDraft, baseAmount: '1000'}),
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

  it('rejects an old save response after an A to B to A campus transition', () => {
    const gate = createPenaltyRuleSaveGate();
    const campusAOperationId = beginPenaltyRuleSave(gate);
    if (campusAOperationId === null) throw new Error('expected campus A operation');

    invalidatePenaltyRuleSave(gate);
    invalidatePenaltyRuleSave(gate);
    const returnedCampusAOperationId = beginPenaltyRuleSave(gate);
    if (returnedCampusAOperationId === null) {
      throw new Error('expected returned campus A operation');
    }

    expect(isPenaltyRuleSaveOperationCurrent(gate, campusAOperationId)).toBe(false);
    expect(isPenaltyRuleSaveOperationCurrent(gate, returnedCampusAOperationId)).toBe(true);
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
