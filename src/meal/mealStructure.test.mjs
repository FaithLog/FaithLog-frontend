import {readFileSync} from 'node:fs';

import {describe, expect, it} from 'vitest';

const mealDirectory = new URL('./', import.meta.url);
const screenNames = [
  'MealDutyScreen',
  'MealPollListScreen',
  'MealPollCreateScreen',
  'MealPollDetailScreen',
  'MealPollChargeScreen',
  'MealAccountScreen',
  'MealSettlementScreen',
];

describe('MEAL screen architecture', () => {
  it('keeps every required page in its own source file', () => {
    for (const screenName of screenNames) {
      const source = readFileSync(new URL(`${screenName}.tsx`, mealDirectory), 'utf8');
      expect(source).toContain(`function ${screenName}`);
    }
  });

  it('places the duty entry in my profile, not in the administrator operation tabs', () => {
    const rootSource = readFileSync(new URL('../root/FaithLogApp.tsx', import.meta.url), 'utf8');
    const adminSource = readFileSync(new URL('../admin/AdminScreen.tsx', import.meta.url), 'utf8');

    expect(rootSource).toContain('밥 정산 관리');
    expect(rootSource).toContain('MealDutyScreen');
    expect(adminSource).not.toContain('MealDutyScreen');
  });

  it('shows a separate meal duty badge and supports multiple active assignments', () => {
    const adminSource = readFileSync(new URL('../admin/AdminScreen.tsx', import.meta.url), 'utf8');

    expect(adminSource).toContain("duty.dutyType === 'MEAL' && duty.isActive");
    expect(adminSource).toContain("label=\"밥 담당\"");
    expect(adminSource).toContain('activeMealDuties.filter');
  });

  it('keeps privacy and final-confirmation copy visible in the charge UI', () => {
    const chargeSource = readFileSync(new URL('MealPollChargeScreen.tsx', mealDirectory), 'utf8');
    const detailSource = readFileSync(new URL('MealPollDetailScreen.tsx', mealDirectory), 'utf8');

    expect(chargeSource).toContain('최종 청구 확인');
    expect(chargeSource).toContain('투표 전체 공통 계좌');
    expect(detailSource).toContain('다른 밥 담당자가 청구했습니다');
    expect(detailSource).not.toContain('chargedByMe ? charge.paymentAccountId');
  });
});
