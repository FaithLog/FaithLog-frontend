import {readFileSync} from 'node:fs';

import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL('./AdminScreen.tsx', import.meta.url), 'utf8');

describe('admin coffee operations separation', () => {
  it('keeps coffee duty assignment and read filtering but removes coffee creation and settlement controls', () => {
    expect(source).toContain("{id: 'coffee', label: '커피담당'}");
    expect(source).toContain("{id: 'COFFEE', label: '커피'}");
    expect(source).not.toContain("{id: 'COFFEE', label: '커피 주문'}");
    expect(source).not.toContain('accessibilityLabel="커피 미납자 푸시 알림 발송 확인 열기"');
  });

  it('keeps coffee polls read-only while filtering shared-duty templates from admin operations', () => {
    expect(source).not.toContain("polls.filter((poll) => poll.pollType !== 'COFFEE')");
    expect(source).toContain("templates.filter((template) => template.pollType !== 'COFFEE')");
    expect(source).toContain('canManageAdminPoll(poll)');
    expect(source).toContain('canManageAdminPoll(selectedPoll)');
  });
});
