import {describe, expect, it} from 'vitest';

import {
  getNextProgressiveItemLimit,
  getProgressiveItems,
} from './progressiveRendering';

describe('progressive rendering', () => {
  it('bounds the initial render and advances by a bounded batch', () => {
    const items = Array.from({length: 75}, (_, index) => index + 1);

    expect(getProgressiveItems(items, 24)).toEqual(items.slice(0, 24));
    expect(getNextProgressiveItemLimit(24, items.length, 24)).toBe(48);
    expect(getNextProgressiveItemLimit(72, items.length, 24)).toBe(75);
  });

  it('does not mutate the source collection', () => {
    const items = Object.freeze([1, 2, 3, 4]);
    expect(getProgressiveItems(items, 2)).toEqual([1, 2]);
    expect(items).toEqual([1, 2, 3, 4]);
  });
});
