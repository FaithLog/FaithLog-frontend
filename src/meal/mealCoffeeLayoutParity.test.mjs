import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));
const mealScreen = fs.readFileSync(path.join(directory, 'MealDutyScreen.tsx'), 'utf8');
const mealStyles = fs.readFileSync(path.join(directory, 'mealScreenShared.tsx'), 'utf8');
const coffeeScreen = fs.readFileSync(
  path.join(directory, '..', 'coffee', 'CoffeeDutyScreen.tsx'),
  'utf8',
);

describe('meal and coffee duty layout parity', () => {
  it('uses the same management-screen header and keyboard shell primitives', () => {
    for (const primitive of [
      'KeyboardAvoidingView',
      'FaithLogHeaderTopRow',
      'FaithLogHeaderPillButton',
    ]) {
      expect(mealScreen).toContain(primitive);
      expect(coffeeScreen).toContain(primitive);
    }
    expect(mealScreen).toContain('<Text style={mealStyles.kicker}>밥 담당자</Text>');
    expect(mealScreen).toContain('<Text style={mealStyles.screenTitle}>밥 정산 관리</Text>');
  });

  it('keeps the four meal responsibilities split into wrapping two-column navigation', () => {
    expect(mealScreen).toMatch(
      /id: 'polls', label: '투표'[\s\S]*id: 'create', label: '투표 생성'[\s\S]*id: 'account', label: '내 계좌'[\s\S]*id: 'settlement', label: '정산'/,
    );
    expect(mealStyles).toContain("flexWrap: 'wrap'");
    expect(mealStyles).toContain("minWidth: '46%'");
    expect(mealScreen).not.toContain("{name: 'home'}");
  });
});
