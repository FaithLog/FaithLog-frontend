import {describe, expect, it} from 'vitest';

import {buildYearlyRecapChapters, formatCampusJourney} from './yearlyRecapPresentation';
import type {YearlyRecap} from './yearlyRecapTypes';

const recap: YearlyRecap = {
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
    quietTimeCount: 10,
    bibleReadingCount: 8,
    prayerCount: 12,
    allCompletedDayCount: 5,
    submittedWeekCount: 4,
    longestStreakDays: 3,
    mostActiveMonth: 8,
  },
  prayerActivity: {submittedWeekCount: 0, participatedSeasonCount: 0},
  pollActivity: {
    participatedCount: 0,
    wedServicePollCount: 0,
    saturdayLeaderPollCount: 0,
    coffeePollCount: 0,
    mealPollCount: 0,
    customPollCount: 0,
    commentCount: 0,
  },
};

describe('yearly recap presentation', () => {
  it('orders chapters and omits optional all-zero sections', () => {
    expect(buildYearlyRecapChapters(recap).map((chapter) => chapter.kind)).toEqual([
      'intro',
      'devotion',
      'consistency',
      'closing',
    ]);
  });

  it('formats campus dates as calendar dates without timezone conversion', () => {
    expect(formatCampusJourney({
      campusId: 10,
      campusName: '서울 캠퍼스',
      joinedDate: '2026-03-10',
      joinedDuringRecapYear: true,
    }, 2026)).toBe('2026년 3월 10일부터 서울 캠퍼스와 함께했어요');
  });

  it('does not expose prayer, vote, comment, account, or identity source text', () => {
    const serialized = JSON.stringify(buildYearlyRecapChapters(recap));
    expect(serialized).not.toMatch(/email|token|accountNumber|prayerContent|commentContent|choiceContent/i);
  });
});
