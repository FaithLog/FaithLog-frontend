import {describe, expect, it, vi} from 'vitest';

vi.mock('expo-clipboard', () => ({setStringAsync: vi.fn()}));

import {formatAccountClipboardText} from './clipboard';

describe('formatAccountClipboardText', () => {
  it('copies only account-number digits regardless of display separators', () => {
    expect(formatAccountClipboardText({
      accountNumber: '3333-00 7777777',
      bankName: '카카오뱅크',
    })).toBe('3333007777777');
  });

  it('removes every non-digit character from pasted account numbers', () => {
    expect(formatAccountClipboardText({
      accountNumber: ' 110‑123‑456(789) ',
    })).toBe('110123456789');
  });
});
