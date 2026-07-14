import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(directory, 'FaithLogApp.tsx'), 'utf8');

describe('profile duty management entries', () => {
  it('renders coffee and meal entries as independent siblings', () => {
    expect(source).toMatch(
      /<CoffeeDutyProfileRow[\s\S]*?<MealDutyProfileRow/,
    );
    expect(source).not.toMatch(
      /canManageCoffee\s*\?[^:]+CoffeeDutyProfileRow[\s\S]*:\s*[^;]+MealDutyProfileRow/,
    );
  });

  it('keeps distinct long-text accessible labels for both management entries', () => {
    expect(source).toContain('title="커피 정산 관리"');
    expect(source).toContain('title="밥 정산 관리"');
    expect(source).toContain('subtitle="커피 주문 투표 생성과 커피 정산 확인"');
    expect(source).toContain('subtitle="밥 투표, 내 계좌와 정산 관리"');
  });

  it('checks the requested campus and user identity before showing coffee access', () => {
    expect(source).toContain('isActiveDutyForRequest(duty, {');
    expect(source).toContain("dutyType: 'COFFEE'");
  });
});
