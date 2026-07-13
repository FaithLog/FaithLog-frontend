import {readFileSync} from 'node:fs';

import {describe, expect, it} from 'vitest';

const adminScreenSource = readFileSync(new URL('./AdminScreen.tsx', import.meta.url), 'utf8');
const rootSource = readFileSync(new URL('../root/FaithLogApp.tsx', import.meta.url), 'utf8');

describe('penalty rule mobile layout contract', () => {
  it('keeps add and edit forms on subpages with explicit accessible navigation', () => {
    expect(adminScreenSource).toContain('벌금 규칙 추가 페이지 열기');
    expect(adminScreenSource).toContain('페이지에서 규칙 목록으로 돌아가기');
    expect(adminScreenSource).toContain('규칙 항목은 유지하고 금액 기준과 활성 상태만 수정합니다.');
  });

  it('supports Android hardware back, iOS keyboard avoidance, and wrapped small-screen rows', () => {
    expect(adminScreenSource).toContain("BackHandler.addEventListener('hardwareBackPress'");
    expect(rootSource).toContain('enabled={Platform.OS === \'ios\'}');
    expect(rootSource).toContain('style={styles.keyboardRoot}');
    expect(adminScreenSource).toMatch(/penaltyRuleListHeader:\s*\{[\s\S]*?flexWrap: 'wrap'/);
    expect(adminScreenSource).toMatch(/penaltyModeSummary:\s*\{[\s\S]*?flexWrap: 'wrap'/);
  });

  it('keeps duplicate and concurrent-create messages exposed as accessibility alerts', () => {
    expect(adminScreenSource).toContain('accessibilityRole="alert" style={styles.inlineWarning}');
    expect(adminScreenSource).toContain('중복 방지를 위해 저장할 수 없습니다');
  });

  it('announces logical page changes and freezes every field during save', () => {
    expect(adminScreenSource).toContain('벌금 규칙 추가 페이지입니다.');
    expect(adminScreenSource).toContain('벌금 규칙 목록으로 돌아왔습니다.');
    expect(adminScreenSource.match(/editable=\{!busy\}/g)).toHaveLength(3);
    expect(adminScreenSource.match(/disabled=\{busy\}/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
