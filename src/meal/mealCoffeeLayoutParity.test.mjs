import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));
const mealScreen = fs.readFileSync(path.join(directory, 'MealDutyScreen.tsx'), 'utf8');
const mealPollCreate = fs.readFileSync(path.join(directory, 'MealPollCreateScreen.tsx'), 'utf8');
const mealPollList = fs.readFileSync(path.join(directory, 'MealPollListScreen.tsx'), 'utf8');
const mealAccount = fs.readFileSync(path.join(directory, 'MealAccountScreen.tsx'), 'utf8');
const mealSettlement = fs.readFileSync(path.join(directory, 'MealSettlementScreen.tsx'), 'utf8');
const coffeeScreen = fs.readFileSync(
  path.join(directory, '..', 'coffee', 'CoffeeDutyScreen.tsx'),
  'utf8',
);
const dutyPageNav = fs.readFileSync(
  path.join(directory, '..', 'duty', 'DutyPageNav.tsx'),
  'utf8',
);

describe('meal and coffee duty layout parity', () => {
  it('delegates the common header, keyboard shell, and content rhythm to one scaffold', () => {
    expect(mealScreen).toContain('<DutyPageScaffold');
    expect(coffeeScreen).toContain('<DutyPageScaffold');
    expect(mealScreen).not.toContain('<KeyboardAvoidingView');
    expect(coffeeScreen).not.toContain('<KeyboardAvoidingView');
    expect(coffeeScreen).not.toContain('<ScrollView');
    expect(mealScreen).toContain('domainLabel="밥"');
    expect(coffeeScreen).toContain('domainLabel="커피"');
  });

  it('keeps the four meal responsibilities split into wrapping two-column navigation', () => {
    expect(mealScreen).toMatch(
      /id: 'polls', label: '투표'[\s\S]*id: 'create', label: '투표 생성'[\s\S]*id: 'account', label: '내 계좌'[\s\S]*id: 'settlement', label: '정산'/,
    );
    expect(dutyPageNav).toContain("flexWrap: 'wrap'");
    expect(dutyPageNav).toContain("minWidth: '46%'");
    expect(mealScreen).not.toContain("{name: 'home'}");
  });

  it('uses the same page order, terminology, and scoped accessibility labels', () => {
    expect(mealScreen).toMatch(
      /id: 'polls', label: '투표'[\s\S]*id: 'create', label: '투표 생성'[\s\S]*id: 'account', label: '내 계좌'[\s\S]*id: 'settlement', label: '정산'/,
    );
    expect(coffeeScreen).toMatch(
      /id: 'manage', label: '투표'[\s\S]*id: 'create', label: '투표 생성'[\s\S]*id: 'accounts', label: '내 계좌'[\s\S]*id: 'summary', label: '정산'/,
    );
    expect(mealScreen).toContain('domainLabel="밥"');
    expect(coffeeScreen).toContain('domainLabel="커피"');
    expect(dutyPageNav).toContain('accessibilityLabel={`${domainLabel} ${item.label} 페이지 열기`}');
    expect(dutyPageNav).toContain('accessibilityState={{selected: active}}');
    expect(dutyPageNav).toContain('hitSlop={4}');
    expect(dutyPageNav).toContain('minHeight: 40');
    expect(coffeeScreen).not.toContain('관리자 투표 생성과 같은 순서로');
    expect(mealPollCreate).not.toContain('커스텀 투표와 같은 순서로');
  });

  it('uses one admin-style account registration form for coffee and meal', () => {
    expect(coffeeScreen).toContain('<DutyAccountRegistrationForm');
    expect(mealAccount).toContain('<DutyAccountRegistrationForm');
    expect(coffeeScreen).not.toContain('placeholder="3333-33-333333"');
  });

  it('keeps account-add and refresh header actions compact in both duty domains', () => {
    expect(mealAccount).toMatch(
      /accessibilityLabel="밥 계좌 추가 페이지 열기"[\s\S]*?compact[\s\S]*?label="계좌 추가"/,
    );
    expect(coffeeScreen).toMatch(
      /accessibilityLabel="커피 계좌 추가 페이지 열기"[\s\S]*?compact[\s\S]*?label="계좌 추가"/,
    );
    expect(coffeeScreen).toMatch(
      /accessibilityLabel="커피 정산 새로고침"[\s\S]*?compact[\s\S]*?label="새로고침"/,
    );
    expect(coffeeScreen).toMatch(
      /accessibilityLabel="커피 투표 목록 새로고침"[\s\S]*?compact[\s\S]*?label="새로고침"/,
    );
    expect(mealPollList).toMatch(
      /accessibilityLabel="밥 투표 목록 새로고침"[\s\S]*?compact[\s\S]*?label="새로고침"/,
    );
    expect(mealSettlement).toMatch(
      /accessibilityLabel="밥 정산 새로고침"[\s\S]*?compact[\s\S]*?label="새로고침"/,
    );
  });

  it('keeps account-form back actions compact in both duty domains', () => {
    expect(mealAccount).toMatch(
      /accessibilityLabel="밥 계좌 목록으로 돌아가기"[\s\S]*?compact[\s\S]*?label="뒤로"/,
    );
    expect(coffeeScreen).toMatch(
      /accessibilityLabel="커피 계좌 목록으로 돌아가기"[\s\S]*?compact[\s\S]*?label="뒤로"/,
    );
  });
});
