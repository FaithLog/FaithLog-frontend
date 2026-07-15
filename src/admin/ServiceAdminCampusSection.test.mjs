import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const source = fs.readFileSync(
  fileURLToPath(new URL('./ServiceAdminCampusSection.tsx', import.meta.url)),
  'utf8',
);

describe('service ADMIN stale duty recovery wiring', () => {
  it('uses the isolated stale list and explicit terminal choices', () => {
    expect(source).toContain('fetchDutyAssignments(accessToken, campusId, {staleOnly: true})');
    expect(source).toContain("(['PAID', 'WAIVED', 'CANCELED'] as const)");
    expect(source).toContain('changeServiceAdminStaleDutyChargeStatus');
    expect(source).not.toContain("changeServiceAdminStaleDutyChargeStatus(accessToken, chargeId, 'UNPAID'");
  });

  it('keeps category-specific revoke and conflict handling explicit', () => {
    expect(source).toContain('revokeCoffeeDuty(accessToken, campusId, assignment.assignmentId)');
    expect(source).toContain('mealApi.revokeDuty(accessToken, campusId, assignment.assignmentId)');
    expect(source).toContain('CAMPUS_COFFEE_DUTY_UNPAID_CHARGE_CONFLICT');
    expect(source).toContain('CAMPUS_MEAL_DUTY_UNPAID_CHARGE_CONFLICT');
  });
});
