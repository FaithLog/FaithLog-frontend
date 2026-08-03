import {describe, expect, it, vi} from 'vitest';

import {getYearlyRecapDisplayPolicy} from './yearlyRecapPolicy';
import type {YearlyRecap} from './yearlyRecapTypes';

const recap = {
  recapYear: 2026,
  hasRecapData: true,
  presentation: {
    shouldAutoPresent: true,
    homeCardVisible: true,
    homeCardVisibleUntil: '2027-01-14T23:59:59+09:00',
    firstPresentedAt: null,
  },
  campusJourney: {campuses: []},
  devotion: {
    quietTimeCount: 0,
    bibleReadingCount: 0,
    prayerCount: 0,
    allCompletedDayCount: 0,
    submittedWeekCount: 0,
    longestStreakDays: 0,
    mostActiveMonth: 0,
  },
  prayerActivity: {submittedWeekCount: 0, participatedSeasonCount: 0},
  commentActivity: {writtenCount: 0},
  penaltySummary: {
    totalCount: 0,
    totalAmount: 0,
    paidCount: 0,
    paidAmount: 0,
    unpaidCount: 0,
    unpaidAmount: 0,
  },
} satisfies YearlyRecap;

describe('yearly recap server presentation policy', () => {
  it('uses server booleans even after the informational deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-12-31T23:59:59+09:00'));
    expect(getYearlyRecapDisplayPolicy(recap)).toEqual({
      showHomeCard: true,
      shouldAutoPresent: true,
    });
    vi.useRealTimers();
  });

  it('hides both entry points when the server says there is no recap data', () => {
    expect(getYearlyRecapDisplayPolicy({...recap, hasRecapData: false})).toEqual({
      showHomeCard: false,
      shouldAutoPresent: false,
    });
  });
});
