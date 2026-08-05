import {describe, expect, it, vi} from 'vitest';

vi.mock('expo-clipboard', () => ({setStringAsync: vi.fn()}));

import {formatAccountClipboardText} from './clipboard';

describe('formatAccountClipboardText', () => {
  it('copies the bank name followed by account-number digits', () => {
    expect(formatAccountClipboardText({
      accountNumber: '3333-00 7777777',
      bankName: '카카오뱅크',
    })).toBe('카카오뱅크 3333007777777');
  });

  it('normalizes bank whitespace and removes every non-digit account character', () => {
    expect(formatAccountClipboardText({
      accountNumber: ' 110‑123‑456(789) ',
      bankName: '  신한 은행  ',
    })).toBe('신한 은행 110123456789');
  });

  it('falls back to digits when a legacy account has no bank name', () => {
    expect(formatAccountClipboardText({
      accountNumber: '110-123-456',
      bankName: null,
    })).toBe('110123456');
  });
});
