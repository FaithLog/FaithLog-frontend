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
    commentActivity: {writtenCount: 6},
    penaltySummary: {
      totalCount: 3,
      totalAmount: 15_000,
      paidCount: 2,
      paidAmount: 10_000,
      unpaidCount: 1,
      unpaidAmount: 5_000,
    },
  },
  timestamp: '2027-01-01T09:00:00+09:00',
};

const penaltyFields = [
  'totalCount',
  'totalAmount',
  'paidCount',
  'paidAmount',
  'unpaidCount',
  'unpaidAmount',
] as const;

const invalidPenaltyValues = [
  ['negative', -1],
  ['fractional', 1.5],
  ['unsafe', Number.MAX_SAFE_INTEGER + 1],
] as const;

describe('parseYearlyRecapEnvelope', () => {
  it('accepts the exact final #236 DTO and keeps calendar dates unchanged', () => {
    const recap = parseYearlyRecapEnvelope(validEnvelope);

    expect(recap.recapYear).toBe(2026);
    expect(recap.campusJourney.campuses[0]?.joinedDate).toBe('2026-03-10');
    expect(recap.commentActivity).toEqual({writtenCount: 6});
    expect(recap.penaltySummary).toEqual(validEnvelope.data.penaltySummary);
  });

  it('fails only the new sections closed when their capability fields are absent', () => {
    const {commentActivity: _comment, penaltySummary: _penalty, ...baseData} = validEnvelope.data;
    const recap = parseYearlyRecapEnvelope({...validEnvelope, data: baseData});

    expect(recap).not.toHaveProperty('commentActivity');
    expect(recap).not.toHaveProperty('penaltySummary');
    expect(recap.devotion.quietTimeCount).toBe(210);
  });

  it('ignores backward pollActivity data without exposing it on the parsed DTO', () => {
    const {commentActivity: _comment, penaltySummary: _penalty, ...baseData} = validEnvelope.data;
    const recap = parseYearlyRecapEnvelope({
      ...validEnvelope,
      data: {
        ...baseData,
        pollActivity: {participatedCount: 999, commentCount: 888},
      },
    });

    expect(recap).not.toHaveProperty('pollActivity');
    expect(recap).not.toHaveProperty('commentActivity');
  });

  it('accepts zero and maximum-safe-integer comment and penalty values', () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const recap = parseYearlyRecapEnvelope({
      ...validEnvelope,
      data: {
        ...validEnvelope.data,
        commentActivity: {writtenCount: maximum},
        penaltySummary: {
          totalCount: maximum,
          totalAmount: maximum,
          paidCount: maximum - 1,
          paidAmount: maximum - 1,
          unpaidCount: 1,
          unpaidAmount: 1,
        },
      },
    });

    expect(recap.commentActivity?.writtenCount).toBe(maximum);
    expect(recap.penaltySummary?.totalAmount).toBe(maximum);
  });

  it.each([
    ['zero', {
      totalCount: 0,
      totalAmount: 0,
      paidCount: 0,
      paidAmount: 0,
      unpaidCount: 0,
      unpaidAmount: 0,
    }],
    ['paid only', {
      totalCount: 2,
      totalAmount: 5_000,
      paidCount: 2,
      paidAmount: 5_000,
      unpaidCount: 0,
      unpaidAmount: 0,
    }],
    ['unpaid only', {
      totalCount: 2,
      totalAmount: 7_000,
      paidCount: 0,
      paidAmount: 0,
      unpaidCount: 2,
      unpaidAmount: 7_000,
    }],
    ['zero amount with a count', {
      totalCount: 1,
      totalAmount: 0,
      paidCount: 1,
      paidAmount: 0,
      unpaidCount: 0,
      unpaidAmount: 0,
    }],
    ['positive amount with zero count', {
      totalCount: 0,
      totalAmount: 1,
      paidCount: 0,
      paidAmount: 1,
      unpaidCount: 0,
      unpaidAmount: 0,
    }],
  ])('accepts a valid %s penalty shape without inventing cross-field rules', (_label, summary) => {
    const recap = parseYearlyRecapEnvelope({
      ...validEnvelope,
      data: {...validEnvelope.data, penaltySummary: summary},
    });

    expect(recap.penaltySummary).toEqual(summary);
  });

  it.each(penaltyFields.flatMap((field) =>
    invalidPenaltyValues.map(([label, value]) => [field, label, value] as const)))(
    'rejects %s when it is %s',
    (field, _label, value) => {
      expect(() => parseYearlyRecapEnvelope({
        ...validEnvelope,
        data: {
          ...validEnvelope.data,
          penaltySummary: {...validEnvelope.data.penaltySummary, [field]: value},
        },
      })).toThrow();
    },
  );

  it.each([
    ['invalid year', {recapYear: 0}],
    ['duplicate campus', {campusJourney: {campuses: [
      validEnvelope.data.campusJourney.campuses[0],
      validEnvelope.data.campusJourney.campuses[0],
    ]}}],
    ['invalid month', {devotion: {...validEnvelope.data.devotion, mostActiveMonth: 13}}],
    ['negative devotion count', {devotion: {...validEnvelope.data.devotion, quietTimeCount: -1}}],
    ['invalid date', {campusJourney: {campuses: [{
      ...validEnvelope.data.campusJourney.campuses[0],
      joinedDate: '2026-02-31',
    }]}}],
    ['inconsistent joined year', {campusJourney: {campuses: [{
      ...validEnvelope.data.campusJourney.campuses[0],
      joinedDate: '2025-03-10',
    }]}}],
    ['false joined flag for recap year', {campusJourney: {campuses: [{
      ...validEnvelope.data.campusJourney.campuses[0],
      joinedDuringRecapYear: false,
    }]}}],
    ['inconsistent completed days', {devotion: {
      ...validEnvelope.data.devotion,
      allCompletedDayCount: 211,
    }}],
    ['negative comment count', {commentActivity: {writtenCount: -1}}],
    ['fractional comment count', {commentActivity: {writtenCount: 1.5}}],
    ['unsafe comment count', {commentActivity: {writtenCount: Number.MAX_SAFE_INTEGER + 1}}],
    ['inconsistent penalty count total', {penaltySummary: {
      ...validEnvelope.data.penaltySummary,
      totalCount: 4,
    }}],
    ['inconsistent penalty amount total', {penaltySummary: {
      ...validEnvelope.data.penaltySummary,
      totalAmount: 15_001,
    }}],
  ])('rejects %s', (_label, dataOverride) => {
    expect(() => parseYearlyRecapEnvelope({
      ...validEnvelope,
      data: {...validEnvelope.data, ...dataOverride},
    })).toThrow();
  });
});
