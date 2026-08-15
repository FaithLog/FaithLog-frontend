import {describe, expect, it, vi} from 'vitest';

import type {WeeklyDevotionSummary} from '../api/types';
import {
  getSeoulDevotionWeekContext,
  resolveInitialDevotionWeek,
} from './devotionDefaultWeek';

describe('devotion initial week policy', () => {
  it('selects the previous week when that week is not submitted', async () => {
    const loadWeek = vi.fn().mockResolvedValue(weekly('2026-08-03', null));

    await expect(resolveInitialDevotionWeek({
      explicitSelectedDate: null,
      loadWeek,
      now: new Date('2026-08-11T03:00:00.000Z'),
    })).resolves.toMatchObject({
      selectedWeekStart: '2026-08-03',
      reason: 'previousUnsubmitted',
    });
    expect(loadWeek).toHaveBeenCalledOnce();
    expect(loadWeek).toHaveBeenCalledWith('2026-08-03');
  });

  it('selects the current week when the previous week was submitted', async () => {
    const loadWeek = vi.fn().mockResolvedValue(weekly('2026-08-03', '2026-08-10T01:00:00Z'));

    await expect(resolveInitialDevotionWeek({
      explicitSelectedDate: null,
      loadWeek,
      now: new Date('2026-08-11T03:00:00.000Z'),
    })).resolves.toMatchObject({
      selectedWeekStart: '2026-08-10',
      reason: 'current',
    });
  });

  it('keeps an explicitly selected calendar week without probing the previous week', async () => {
    const loadWeek = vi.fn();

    await expect(resolveInitialDevotionWeek({
      explicitSelectedDate: '2026-07-29',
      loadWeek,
      now: new Date('2026-08-11T03:00:00.000Z'),
    })).resolves.toEqual({
      currentWeekStart: '2026-08-10',
      preloadedWeekly: null,
      reason: 'explicit',
      selectedWeekStart: '2026-07-27',
    });
    expect(loadWeek).not.toHaveBeenCalled();
  });

  it('uses Asia/Seoul Monday across UTC Sunday and a year boundary', () => {
    expect(getSeoulDevotionWeekContext(new Date('2026-12-27T15:30:00.000Z'))).toEqual({
      currentWeekStart: '2026-12-28',
      previousWeekStart: '2026-12-21',
    });
    expect(getSeoulDevotionWeekContext(new Date('2027-01-03T14:59:59.000Z'))).toEqual({
      currentWeekStart: '2026-12-28',
      previousWeekStart: '2026-12-21',
    });
  });

  it('rejects a previous-week response that belongs to another week', async () => {
    const loadWeek = vi.fn().mockResolvedValue(weekly('2026-07-27', null));

    await expect(resolveInitialDevotionWeek({
      explicitSelectedDate: null,
      loadWeek,
      now: new Date('2026-08-11T03:00:00.000Z'),
    })).rejects.toThrow('Unexpected weekly devotion response.');
  });
});

function weekly(weekStartDate: string, submittedAt: string | null): WeeklyDevotionSummary {
  const start = new Date(`${weekStartDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    weeklyRecordId: 1,
    campusId: 1,
    campusName: '프론트 QA 캠퍼스',
    region: '서울',
    userId: 7,
    weekStartDate,
    weekEndDate: end.toISOString().slice(0, 10),
    quietTimeCount: 0,
    prayerCount: 0,
    bibleReadingCount: 0,
    saturdayLateMinutes: 0,
    submittedAt,
    dailyChecks: [],
  };
}
