import {describe, expect, it} from 'vitest';
import {getCompanionCareBadges} from './companionCareBadges';

describe('companion care badges', () => {
  it.each([
    [0, undefined, 3],
    [2, undefined, 3],
    [3, 3, 7],
    [6, 3, 7],
    [7, 7, 14],
    [13, 7, 14],
    [14, 14, undefined],
    [30, 14, undefined],
  ])('uses the stored distinct care days at %i days', (days, earned, next) => {
    const badges = getCompanionCareBadges(days);
    expect(badges.earned?.careDays).toBe(earned);
    expect(badges.next?.careDays).toBe(next);
  });
});
