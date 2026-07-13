import {readFileSync} from 'node:fs';

import {describe, expect, it} from 'vitest';

const adminScreenSource = readFileSync(new URL('./AdminScreen.tsx', import.meta.url), 'utf8');
const rootSource = readFileSync(new URL('../root/FaithLogApp.tsx', import.meta.url), 'utf8');
const penaltyRuleSaveSource = adminScreenSource.slice(
  adminScreenSource.indexOf('const savePenaltyRule = async () =>'),
  adminScreenSource.indexOf('const openPenaltyRuleCreate = () =>'),
);

describe('penalty rule mobile layout contract', () => {
  it('keeps add and edit forms on subpages with explicit accessible navigation', () => {
    expect(adminScreenSource).toContain('벌금 규칙 추가 페이지 열기');
    expect(adminScreenSource).toContain('페이지에서 규칙 목록으로 돌아가기');
    expect(adminScreenSource).toContain('규칙 항목은 유지하고 현재 적용 중인 금액 기준만 수정합니다.');
  });

  it('supports Android hardware back, iOS keyboard avoidance, and wrapped small-screen rows', () => {
    expect(adminScreenSource).toContain("BackHandler.addEventListener('hardwareBackPress'");
    expect(rootSource).toContain('enabled={Platform.OS === \'ios\'}');
    expect(rootSource).toContain('style={styles.keyboardRoot}');
    expect(adminScreenSource).toMatch(/penaltyRuleListHeader:\s*\{[\s\S]*?flexWrap: 'wrap'/);
    expect(adminScreenSource).toMatch(/penaltyModeSummary:\s*\{[\s\S]*?flexWrap: 'wrap'/);
  });

  it('explains replacement without exposing inactive history or duplicate UI', () => {
    expect(adminScreenSource).toContain(
      '저장하면 새 규칙이 적용되고 기존 규칙은 이력으로 보관됩니다.',
    );
    expect(adminScreenSource).not.toContain('PENALTY_RULE_DUPLICATE');
    expect(adminScreenSource).not.toContain('모든 규칙이 등록되었습니다');
    expect(adminScreenSource).not.toContain('penaltyRuleActiveOptions');
    expect(adminScreenSource).toContain(
      '에는 현재 적용 중인 규칙이 있습니다. 저장하면 새 규칙이 적용되고',
    );
  });

  it('announces logical page changes and freezes every field during save', () => {
    expect(adminScreenSource).toContain('벌금 규칙 추가 페이지입니다.');
    expect(adminScreenSource).toContain('벌금 규칙 목록으로 돌아왔습니다.');
    expect(adminScreenSource.match(/editable=\{!busy\}/g)).toHaveLength(3);
    expect(penaltyRuleSaveSource).toContain('isActive: true');
  });

  it('returns to the list and reloads the current active rules after save', () => {
    expect(penaltyRuleSaveSource).toMatch(
      /setPenaltyRuleFlow\(\{route: 'list'\}\);[\s\S]*?await loadPenaltyRules\(\);/,
    );
    expect(penaltyRuleSaveSource).toContain('isPenaltyRuleSaveOperationCurrent');
  });
});
