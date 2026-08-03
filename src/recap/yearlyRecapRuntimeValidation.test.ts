import {describe, expect, it} from 'vitest';

import {parseYearlyRecapEnvelope} from './yearlyRecapRuntimeValidation';

const validEnvelope = {
  success: true,
  code: 'SUCCESS',
  message: '요청이 성공했습니다.',
  data: {
    recapYear: 2026,
    hasRecapData: true,
    presentation: {
      shouldAutoPresent: true,
      homeCardVisible: true,
      homeCardVisibleUntil: '2027-01-14T23:59:59+09:00',
      firstPresentedAt: null,
    },
    campusJourney: {
      campuses: [
        {
          campusId: 10,
          campusName: '서울 캠퍼스',
          joinedDate: '2026-03-10',
          joinedDuringRecapYear: true,
        },
      ],
    },
    devotion: {
      quietTimeCount: 210,
      bibleReadingCount: 185,
      prayerCount: 230,
      allCompletedDayCount: 150,
      submittedWeekCount: 40,
      longestStreakDays: 12,
      mostActiveMonth: 8,
    },
    prayerActivity: {submittedWeekCount: 22, participatedSeasonCount: 2},
    pollActivity: {
      participatedCount: 31,
      wedServicePollCount: 4,
      saturdayLeaderPollCount: 3,
      coffeePollCount: 10,
      mealPollCount: 8,
      customPollCount: 6,
      commentCount: 6,
    },
  },
  timestamp: '2027-01-01T09:00:00+09:00',
};

describe('parseYearlyRecapEnvelope', () => {
  it('accepts the provisional #236 envelope without changing calendar dates', () => {
    const recap = parseYearlyRecapEnvelope(validEnvelope);
    expect(recap.recapYear).toBe(2026);
    expect(recap.campusJourney.campuses[0]?.joinedDate).toBe('2026-03-10');
    expect(recap.devotion.quietTimeCount).toBe(210);
    expect(recap.devotion.bibleReadingCount).toBe(185);
    expect(recap.devotion.prayerCount).toBe(230);
  });

  it.each([
    ['invalid year', {data: {...validEnvelope.data, recapYear: 0}}],
    ['duplicate campus', {data: {...validEnvelope.data, campusJourney: {campuses: [
      validEnvelope.data.campusJourney.campuses[0],
      validEnvelope.data.campusJourney.campuses[0],
    ]}}}],
    ['invalid month', {data: {...validEnvelope.data, devotion: {...validEnvelope.data.devotion, mostActiveMonth: 13}}}],
    ['negative count', {data: {...validEnvelope.data, devotion: {...validEnvelope.data.devotion, quietTimeCount: -1}}}],
    ['invalid date', {data: {...validEnvelope.data, campusJourney: {campuses: [{...validEnvelope.data.campusJourney.campuses[0], joinedDate: '2026-02-31'}]}}}],
    ['inconsistent joined year', {data: {...validEnvelope.data, campusJourney: {campuses: [{...validEnvelope.data.campusJourney.campuses[0], joinedDate: '2025-03-10'}]}}}],
    ['false joined flag for recap year', {data: {...validEnvelope.data, campusJourney: {campuses: [{...validEnvelope.data.campusJourney.campuses[0], joinedDuringRecapYear: false}]}}}],
    ['inconsistent completed days', {data: {...validEnvelope.data, devotion: {...validEnvelope.data.devotion, allCompletedDayCount: 211}}}],
    ['inconsistent poll total', {data: {...validEnvelope.data, pollActivity: {...validEnvelope.data.pollActivity, participatedCount: 32}}}],
  ])('rejects %s', (_label, override) => {
    expect(() => parseYearlyRecapEnvelope({...validEnvelope, ...override})).toThrow();
  });
});
