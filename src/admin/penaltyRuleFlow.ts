import type {
  PenaltyCalculationType,
  PenaltyRule,
  PenaltyRuleType,
} from '../api/types';

export type PenaltyRuleDraft = {
  amountPerUnit: string;
  baseAmount: string;
  calculationType: PenaltyCalculationType;
  isActive: boolean;
  requiredCount: string;
  ruleId: number | null;
  ruleType: PenaltyRuleType;
};

export type PenaltyRuleFlow =
  | {route: 'list'}
  | {route: 'create'; initialDraft: PenaltyRuleDraft}
  | {route: 'edit'; initialDraft: PenaltyRuleDraft; ruleId: number};

export type PenaltyRuleSaveGate = {
  inFlight: boolean;
  operationId: number;
};

export const penaltyRuleTypes: readonly PenaltyRuleType[] = [
  'QUIET_TIME',
  'PRAYER',
  'BIBLE_READING',
  'SATURDAY_LATE',
];

export const emptyPenaltyRuleDraft: PenaltyRuleDraft = {
  amountPerUnit: '',
  baseAmount: '',
  calculationType: 'MISSING_COUNT',
  isActive: true,
  requiredCount: '',
  ruleId: null,
  ruleType: 'QUIET_TIME',
};

export function createPenaltyRuleSaveGate(): PenaltyRuleSaveGate {
  return {inFlight: false, operationId: 0};
}

export function beginPenaltyRuleSave(gate: PenaltyRuleSaveGate) {
  if (gate.inFlight) {
    return null;
  }

  gate.inFlight = true;
  gate.operationId += 1;
  return gate.operationId;
}

export function invalidatePenaltyRuleSave(gate: PenaltyRuleSaveGate) {
  gate.inFlight = false;
  gate.operationId += 1;
}

export function finishPenaltyRuleSave(
  gate: PenaltyRuleSaveGate,
  operationId: number,
) {
  if (gate.operationId !== operationId) {
    return false;
  }

  gate.inFlight = false;
  return true;
}

export function getAvailablePenaltyRuleTypes(
  rules: ReadonlyArray<Pick<PenaltyRule, 'ruleType'>>,
) {
  const registeredTypes = new Set(rules.map((rule) => rule.ruleType));
  return penaltyRuleTypes.filter((ruleType) => !registeredTypes.has(ruleType));
}

export function getDuplicatePenaltyRuleTypes(
  rules: ReadonlyArray<Pick<PenaltyRule, 'ruleType'>>,
) {
  const counts = new Map<PenaltyRuleType, number>();

  rules.forEach((rule) => {
    counts.set(rule.ruleType, (counts.get(rule.ruleType) ?? 0) + 1);
  });

  return penaltyRuleTypes.filter((ruleType) => (counts.get(ruleType) ?? 0) > 1);
}

export function startPenaltyRuleCreateFlow(
  rules: ReadonlyArray<Pick<PenaltyRule, 'ruleType'>>,
): PenaltyRuleFlow | null {
  const [firstAvailableType] = getAvailablePenaltyRuleTypes(rules);

  if (!firstAvailableType) {
    return null;
  }

  const initialDraft = createPenaltyRuleDraft(firstAvailableType);
  return {route: 'create', initialDraft};
}

export function startPenaltyRuleEditFlow(
  rule: PenaltyRule,
): Extract<PenaltyRuleFlow, {route: 'edit'}> {
  return {route: 'edit', initialDraft: createPenaltyRuleEditDraft(rule), ruleId: rule.id};
}

export function createPenaltyRuleDraft(ruleType: PenaltyRuleType): PenaltyRuleDraft {
  return {
    ...emptyPenaltyRuleDraft,
    calculationType: getPenaltyCalculationType(ruleType),
    requiredCount: ruleType === 'SATURDAY_LATE' ? '0' : '',
    ruleType,
  };
}

export function createPenaltyRuleEditDraft(rule: PenaltyRule): PenaltyRuleDraft {
  return {
    amountPerUnit: String(rule.amountPerUnit),
    baseAmount: String(rule.baseAmount),
    calculationType: rule.calculationType,
    isActive: rule.isActive,
    requiredCount: String(rule.requiredCount),
    ruleId: rule.id,
    ruleType: rule.ruleType,
  };
}

export function isPenaltyRuleDraftDirty(
  flow: PenaltyRuleFlow,
  draft: PenaltyRuleDraft,
) {
  if (flow.route === 'list') {
    return false;
  }

  const initial = flow.initialDraft;
  return (
    draft.amountPerUnit !== initial.amountPerUnit ||
    draft.baseAmount !== initial.baseAmount ||
    draft.calculationType !== initial.calculationType ||
    draft.isActive !== initial.isActive ||
    draft.requiredCount !== initial.requiredCount ||
    draft.ruleId !== initial.ruleId ||
    draft.ruleType !== initial.ruleType
  );
}

export function isPenaltyRuleCreateTypeUnavailable(
  flow: PenaltyRuleFlow,
  draft: PenaltyRuleDraft,
  rules: ReadonlyArray<Pick<PenaltyRule, 'ruleType'>>,
) {
  return (
    flow.route === 'create' &&
    !getAvailablePenaltyRuleTypes(rules).includes(draft.ruleType)
  );
}

export function getPenaltyCalculationType(
  ruleType: PenaltyRuleType,
): PenaltyCalculationType {
  return ruleType === 'SATURDAY_LATE' ? 'LATE_MINUTE' : 'MISSING_COUNT';
}

export function getRequiredCountForRuleType(
  ruleType: PenaltyRuleType,
  currentRequiredCount: string,
) {
  if (ruleType === 'SATURDAY_LATE') {
    return '0';
  }

  return currentRequiredCount === '0' ? '' : currentRequiredCount;
}

export function isPenaltyRuleRequestCurrent({
  currentCampusId,
  currentGeneration,
  currentSequence,
  mounted,
  requestCampusId,
  requestGeneration,
  requestSequence,
}: {
  currentCampusId: number;
  currentGeneration: number;
  currentSequence: number;
  mounted: boolean;
  requestCampusId: number;
  requestGeneration: number;
  requestSequence: number;
}) {
  return (
    mounted &&
    requestCampusId === currentCampusId &&
    requestGeneration === currentGeneration &&
    requestSequence === currentSequence
  );
}
