import {describe, expect, it} from 'vitest';

import {getHorizontalEdgeDirection} from './useHorizontalDragAutoScroll';

describe('getHorizontalEdgeDirection', () => {
  it('returns the left direction only near the left edge', () => {
    expect(getHorizontalEdgeDirection(105, 100, 300)).toBe(-1);
    expect(getHorizontalEdgeDirection(180, 100, 300)).toBe(0);
  });

  it('returns the right direction only near the right edge', () => {
    expect(getHorizontalEdgeDirection(395, 100, 300)).toBe(1);
    expect(getHorizontalEdgeDirection(320, 100, 300)).toBe(0);
  });

  it('fails closed when viewport metrics are unavailable', () => {
    expect(getHorizontalEdgeDirection(0, 0, 0)).toBe(0);
    expect(getHorizontalEdgeDirection(Number.NaN, 0, 300)).toBe(0);
  });
});
