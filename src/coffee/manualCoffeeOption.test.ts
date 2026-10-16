import {describe, expect, it} from 'vitest';
import {createManualCoffeeOption, getManualCoffeeOptionError} from './manualCoffeeOption';

describe('manual coffee input', () => {
  it('trims the name and creates an integer amount', () => {
    expect(createManualCoffeeOption('  동네 라떼  ', '4500')).toEqual({content: '동네 라떼', priceAmount: 4500});
  });
  it.each(['', '0', '-1', '1.5', '1e3', '2,500', '2147483648'])('rejects invalid price %s', (price) => {
    expect(getManualCoffeeOptionError('라떼', price)).not.toBeNull();
  });
  it('rejects blank, long, and duplicate names', () => {
    expect(getManualCoffeeOptionError('  ', '4500')).not.toBeNull();
    expect(getManualCoffeeOptionError('가'.repeat(201), '4500')).not.toBeNull();
    expect(getManualCoffeeOptionError(' LATTE ', '4500', ['Latte'])).toBe('이미 추가된 항목입니다.');
  });
});
