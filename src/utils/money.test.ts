import {describe, expect, it} from 'vitest';

import {formatCompactWon, formatWon} from './money';

describe('money formatters', () => {
  it('keeps won units on full amount formatting', () => {
    expect(formatWon(0)).toBe('0원');
    expect(formatWon(4000)).toBe('4,000원');
    expect(formatWon(-1000)).toBe('0원');
  });

  it('keeps won units on compact k formatting', () => {
    expect(formatCompactWon(0)).toBe('0원');
    expect(formatCompactWon(999)).toBe('999원');
    expect(formatCompactWon(4000)).toBe('4k원');
    expect(formatCompactWon(4500)).toBe('4.5k원');
  });
});
