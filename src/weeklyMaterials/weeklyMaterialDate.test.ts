import {describe, expect, it} from 'vitest';

import {
  formatWeeklyMaterialHeader,
  getSeoulCurrentWeekStartDate,
  moveWeekStartDate,
  normalizeWeekStartDate,
} from './weeklyMaterialDate';

describe('weekly material Seoul week policy', () => {
  it('uses the Asia/Seoul Monday even when the UTC date is Sunday', () => {
    expect(getSeoulCurrentWeekStartDate(new Date('2026-08-02T15:30:00.000Z')))
      .toBe('2026-08-03');
  });

  it('normalizes only valid Monday ISO dates', () => {
    expect(normalizeWeekStartDate('2026-08-03')).toBe('2026-08-03');
    expect(() => normalizeWeekStartDate('2026-08-04')).toThrow();
    expect(() => normalizeWeekStartDate('2026-02-30')).toThrow();
  });

  it('moves naturally across year boundaries', () => {
    expect(moveWeekStartDate('2026-12-28', 1)).toBe('2027-01-04');
    expect(moveWeekStartDate('2027-01-04', -1)).toBe('2026-12-28');
  });

  it('formats the month week and exact Monday to Sunday range', () => {
    expect(formatWeeklyMaterialHeader('2026-08-03')).toEqual({
      rangeLabel: '2026.08.03 - 08.09',
      weekLabel: '8월 1주',
    });
  });
});
