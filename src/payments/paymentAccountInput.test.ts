import {describe, expect, it} from 'vitest';

import {
  BANK_OPTIONS,
  isPresetBankName,
  normalizeAccountNumber,
  preparePaymentAccountFields,
} from './paymentAccountInput';

describe('payment account input', () => {
  it('exposes only the approved representative banks in the requested order', () => {
    expect(BANK_OPTIONS).toEqual([
      '카카오뱅크',
      '토스뱅크',
      'KB국민은행',
      '신한은행',
      '우리은행',
      '하나은행',
      'NH농협은행',
      'IBK기업은행',
      '케이뱅크',
    ]);
  });

  it('removes hyphens, spaces, and other non-digits before an account is submitted', () => {
    expect(normalizeAccountNumber(' 3333-3704 25901 ')).toBe('3333370425901');
    expect(preparePaymentAccountFields({
      accountHolder: '  홍길동 ',
      accountNumber: '3333-3704-25901',
      bankName: ' 카카오뱅크 ',
      nickname: ' 밥 계좌 ',
    })).toEqual({
      accountHolder: '홍길동',
      accountNumber: '3333370425901',
      bankName: '카카오뱅크',
      nickname: '밥 계좌',
    });
  });

  it('distinguishes preset banks from a directly entered bank', () => {
    expect(isPresetBankName('신한은행')).toBe(true);
    expect(isPresetBankName(' 부산은행 ')).toBe(false);
  });
});
