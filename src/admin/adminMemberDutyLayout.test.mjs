import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(directory, 'AdminScreen.tsx'), 'utf8');

describe('admin member duty production layout', () => {
  it('puts the meal duty page next to the coffee duty page', () => {
    expect(source).toMatch(/id: 'coffee', label: '커피담당'[\s\S]*id: 'meal', label: '밥담당'/);
    expect(source).toContain('<AdminMealDutyManagement');
  });

  it('passes active duty assignments to both the route-level list and regular member list', () => {
    expect(source).toMatch(/<AdminMemberListRoute[\s\S]*duties=\{loadState\.duties\}/);
    expect(source).toMatch(/<AdminMemberPage[\s\S]*activeMealDuties=\{activeMealDuties\}/);
  });

  it('uses neutral empty copy for role and duty filters', () => {
    expect(source.match(/다른 필터를 선택해 주세요\./g)).toHaveLength(2);
    expect(source).not.toContain('다른 역할 필터를 선택해 주세요.');
  });
});
