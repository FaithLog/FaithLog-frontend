import {describe, expect, it} from 'vitest';

import type {PenaltyRule, WeeklyDevotionSummary} from '../api/types';
import {
  buildDailyCompletionMap,
  canRequestWeeklySubmit,
  getWeeklyDevotionEntryState,
  getDailyCompletionCount,
  summarizeDevotionPenalty,
} from './devotionUtils';

describe('devotion utilities', () => {
  it('calculates daily completion intensity from the three stored daily checks', () => {
    expect(
      getDailyCompletionCount({
        quietTimeChecked: false,
        prayerChecked: false,
        bibleReadingChecked: false,
      }),
    ).toBe(0);
    expect(
      getDailyCompletionCount({
        quietTimeChecked: true,
        prayerChecked: false,
        bibleReadingChecked: false,
      }),
    ).toBe(1);
    expect(
      getDailyCompletionCount({
        quietTimeChecked: true,
        prayerChecked: true,
        bibleReadingChecked: false,
      }),
    ).toBe(2);
    expect(
      getDailyCompletionCount({
        quietTimeChecked: true,
        prayerChecked: true,
        bibleReadingChecked: true,
      }),
    ).toBe(3);
  });

  it('builds the calendar intensity map from real weekly dailyChecks', () => {
    const weekly = {
      dailyChecks: [
        {
          id: 1,
          recordDate: '2026-06-22',
          quietTimeChecked: true,
          prayerChecked: false,
          bibleReadingChecked: true,
        },
        {
          id: 2,
          recordDate: '2026-06-23',
          quietTimeChecked: true,
          prayerChecked: true,
          bibleReadingChecked: true,
        },
      ],
    } as WeeklyDevotionSummary;

    expect(buildDailyCompletionMap([weekly])).toEqual({
      '2026-06-22': 2,
      '2026-06-23': 3,
    });
  });

  it('summarizes penalty causes without inventing amounts', () => {
    const summary = summarizeDevotionPenalty(
      [
        {quietTimeChecked: true, prayerChecked: true, bibleReadingChecked: false},
        {quietTimeChecked: true, prayerChecked: false, bibleReadingChecked: false},
        {quietTimeChecked: true, prayerChecked: true, bibleReadingChecked: true},
        {quietTimeChecked: true, prayerChecked: true, bibleReadingChecked: false},
        {quietTimeChecked: false, prayerChecked: true, bibleReadingChecked: false},
        {quietTimeChecked: false, prayerChecked: false, bibleReadingChecked: false},
        {quietTimeChecked: false, prayerChecked: false, bibleReadingChecked: false},
      ],
      12,
    );

    expect(summary.missingTypes).toBe(4);
    expect(summary.missingCount).toBe(6);
    expect(summary.amountStatus).toBe('rulesUnavailable');
    expect(summary.totalEstimatedAmount).toBeNull();
    expect(summary.rows.map((row) => [row.label, row.status])).toEqual([
      ['큐티', 'attention'],
      ['기도', 'attention'],
      ['말씀', 'attention'],
      ['토요 지각', 'attention'],
    ]);
  });

  it('calculates estimated amount from active missing-count and late-minute rules', () => {
    const rules = [
      penaltyRule({id: 1, ruleType: 'QUIET_TIME', requiredCount: 5, amountPerUnit: 1000}),
      penaltyRule({id: 2, ruleType: 'PRAYER', requiredCount: 5, amountPerUnit: 1000}),
      penaltyRule({id: 3, ruleType: 'BIBLE_READING', requiredCount: 5, amountPerUnit: 1000}),
      penaltyRule({
        id: 4,
        ruleType: 'SATURDAY_LATE',
        calculationType: 'LATE_MINUTE',
        amountPerUnit: 500,
      }),
    ];
    const summary = summarizeDevotionPenalty(
      [
        {quietTimeChecked: true, prayerChecked: true, bibleReadingChecked: true},
        {quietTimeChecked: true, prayerChecked: false, bibleReadingChecked: false},
        {quietTimeChecked: true, prayerChecked: true, bibleReadingChecked: false},
      ],
      10,
      rules,
    );

    expect(summary.amountStatus).toBe('ready');
    expect(summary.totalEstimatedAmount).toBe(26000);
    expect(summary.rows.map((row) => [row.label, row.missingUnits, row.amount])).toEqual([
      ['큐티', 2, 5000],
      ['기도', 3, 6000],
      ['말씀', 4, 7000],
      ['토요 지각', 10, 8000],
    ]);
  });

  it('returns zero estimated amount when the devotion rule threshold is satisfied', () => {
    const rules = [
      penaltyRule({id: 1, ruleType: 'QUIET_TIME', requiredCount: 2, amountPerUnit: 1000}),
    ];
    const summary = summarizeDevotionPenalty(
      [
        {quietTimeChecked: true, prayerChecked: false, bibleReadingChecked: false},
        {quietTimeChecked: true, prayerChecked: false, bibleReadingChecked: false},
      ],
      0,
      rules,
    );

    expect(summary.amountStatus).toBe('ready');
    expect(summary.rows[0]).toMatchObject({amount: 0, missingUnits: 0, status: 'clear'});
    expect(summary.totalEstimatedAmount).toBe(0);
  });

  it('falls back when penalty rules are empty or inactive', () => {
    expect(summarizeDevotionPenalty([], 0, []).amountStatus).toBe('rulesEmpty');
    expect(summarizeDevotionPenalty([], 0, [penaltyRule({isActive: false})]).amountStatus).toBe(
      'rulesEmpty',
    );
  });

  it('opens the weekly submit confirmation only when the entry state can submit', () => {
    expect(canRequestWeeklySubmit({invalidLateMinutes: false, locked: false, saving: false})).toBe(
      true,
    );
    expect(canRequestWeeklySubmit({invalidLateMinutes: false, locked: true, saving: false})).toBe(
      false,
    );
    expect(canRequestWeeklySubmit({invalidLateMinutes: false, locked: false, saving: true})).toBe(
      false,
    );
    expect(canRequestWeeklySubmit({invalidLateMinutes: true, locked: false, saving: false})).toBe(
      false,
    );
  });

  it('keeps reopened daily checks editable when submittedAt is null', () => {
    const weekly: WeeklyDevotionSummary = {
      weeklyRecordId: 41,
      campusId: 1,
      campusName: '샘플 캠퍼스',
      region: '서울',
      userId: 7,
      weekStartDate: '2026-07-06',
      weekEndDate: '2026-07-12',
      quietTimeCount: 1,
      prayerCount: 1,
      bibleReadingCount: 0,
      saturdayLateMinutes: 0,
      submittedAt: null,
      dailyChecks: [
        {
          id: 91,
          recordDate: '2026-07-06',
          quietTimeChecked: true,
          prayerChecked: true,
          bibleReadingChecked: false,
        },
      ],
    };

    const state = getWeeklyDevotionEntryState(weekly, [
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
    ]);

    expect(state.editable).toBe(true);
    expect(state.dailyChecks).toHaveLength(7);
    expect(state.dailyChecks[0]).toEqual(weekly.dailyChecks[0]);
    expect(state.dailyChecks[1]).toEqual({
      id: null,
      recordDate: '2026-07-07',
      quietTimeChecked: false,
      prayerChecked: false,
      bibleReadingChecked: false,
    });
  });
});

function penaltyRule(patch: Partial<PenaltyRule> = {}): PenaltyRule {
  return {
    id: 1,
    ruleType: 'QUIET_TIME',
    calculationType: 'MISSING_COUNT',
    requiredCount: 5,
    baseAmount: 3000,
    amountPerUnit: 1000,
    isActive: true,
    ...patch,
  };
}
