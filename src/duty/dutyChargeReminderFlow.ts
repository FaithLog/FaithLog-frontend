export type DutyChargeReminderGate = {
  inFlight: boolean;
  operationId: number;
  scope: string;
};

export function createDutyChargeReminderGate(scope: string): DutyChargeReminderGate {
  return {inFlight: false, operationId: 0, scope};
}

export function syncDutyChargeReminderScope(
  gate: DutyChargeReminderGate,
  scope: string,
) {
  if (gate.scope === scope) return false;
  gate.scope = scope;
  gate.operationId += 1;
  gate.inFlight = false;
  return true;
}

export function beginDutyChargeReminder(
  gate: DutyChargeReminderGate,
  scope: string,
) {
  syncDutyChargeReminderScope(gate, scope);
  if (gate.inFlight) return null;
  gate.operationId += 1;
  gate.inFlight = true;
  return gate.operationId;
}

export function isDutyChargeReminderCurrent(
  gate: DutyChargeReminderGate,
  operationId: number,
  scope: string,
) {
  return gate.inFlight && gate.operationId === operationId && gate.scope === scope;
}

export function finishDutyChargeReminder(
  gate: DutyChargeReminderGate,
  operationId: number,
  scope: string,
) {
  if (!isDutyChargeReminderCurrent(gate, operationId, scope)) return false;
  gate.inFlight = false;
  return true;
}
