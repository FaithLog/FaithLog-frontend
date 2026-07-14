import {describe, expect, it} from 'vitest';

import {
  beginDutyChargeReminder,
  createDutyChargeReminderGate,
  finishDutyChargeReminder,
  isDutyChargeReminderCurrent,
  syncDutyChargeReminderScope,
} from './dutyChargeReminderFlow';

describe('duty charge reminder operation gate', () => {
  it('blocks double submit and only lets the owning operation finish', () => {
    const gate = createDutyChargeReminderGate('campus:1/user:7');
    const operationId = beginDutyChargeReminder(gate, 'campus:1/user:7');

    expect(operationId).not.toBeNull();
    expect(beginDutyChargeReminder(gate, 'campus:1/user:7')).toBeNull();
    expect(finishDutyChargeReminder(gate, (operationId ?? 0) + 1, 'campus:1/user:7')).toBe(false);
    expect(finishDutyChargeReminder(gate, operationId ?? 0, 'campus:1/user:7')).toBe(true);
  });

  it('invalidates an old A operation across A-B-A without unlocking the newer A operation', () => {
    const gate = createDutyChargeReminderGate('campus:1/user:7');
    const oldA = beginDutyChargeReminder(gate, 'campus:1/user:7') ?? 0;
    expect(syncDutyChargeReminderScope(gate, 'campus:2/user:7')).toBe(true);
    expect(syncDutyChargeReminderScope(gate, 'campus:1/user:7')).toBe(true);
    const newA = beginDutyChargeReminder(gate, 'campus:1/user:7') ?? 0;

    expect(finishDutyChargeReminder(gate, oldA, 'campus:1/user:7')).toBe(false);
    expect(isDutyChargeReminderCurrent(gate, newA, 'campus:1/user:7')).toBe(true);
  });
});
