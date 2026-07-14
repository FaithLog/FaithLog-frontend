import {readFileSync} from 'node:fs';

import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL('./AdminScreen.tsx', import.meta.url), 'utf8');

describe('admin payment account page flow', () => {
  it('opens account registration as a separate page from the account list', () => {
    expect(source).toContain("type PaymentAccountView = 'create' | 'list'");
    expect(source).toContain('accessibilityLabel="관리자 납부 계좌 추가 페이지 열기"');
    expect(source).toContain("paymentAccountView === 'create'");
    expect(source).toContain('accessibilityLabel="관리자 납부 계좌 목록으로 돌아가기"');
  });
});
