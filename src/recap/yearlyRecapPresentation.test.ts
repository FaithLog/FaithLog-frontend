import {describe, expect, it} from 'vitest';

import {
  buildYearlyRecapChapters,
  formatCampusJourney,
  getYearlyRecapChapterAnnouncement,
} from './yearlyRecapPresentation';
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
    const chapters = buildYearlyRecapChapters(recap);
    expect(chapters.map((chapter) => chapter.kind)).toEqual([
      'intro',
      'devotion',
      'consistency',
      'closing',
    ]);
    expect(chapters[0]?.metrics).toEqual([
      {label: '큐티한 날', value: '10일'},
      {label: '말씀 읽은 날', value: '8일'},
      {label: '기도한 날', value: '12일'},
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

  it('builds a screen-reader announcement with the title and key metric values', () => {
    const devotion = buildYearlyRecapChapters(recap).find((chapter) => chapter.kind === 'devotion');

    expect(devotion).toBeDefined();
    expect(getYearlyRecapChapterAnnouncement(devotion!)).toBe(
      '매일의 작은 실천이 모였어요. 큐티한 날 10일, 말씀 읽은 날 8일, 기도한 날 12일',
    );
  });
});
