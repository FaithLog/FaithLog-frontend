import {describe, expect, it} from 'vitest';

import {
  getRepeatScheduleValidationMessage,
  getWeeklyRepeatDurationMinutes,
} from './repeatSchedule';

describe('repeat poll schedule validation', () => {
  it('allows a schedule that crosses from Sunday to Monday', () => {
    const message = getRepeatScheduleValidationMessage({
      startDayOfWeek: 7,
      startTime: '20:00:00',
      endDayOfWeek: 1,
      endTime: '09:00:00',
    });

    expect(message).toBeNull();
    expect(
      getWeeklyRepeatDurationMinutes({
        startDayOfWeek: 7,
        startMinutes: 20 * 60,
        endDayOfWeek: 1,
        endMinutes: 9 * 60,
      }),
    ).toBe(13 * 60);
  });

  it('keeps same-day later schedules valid', () => {
    expect(
      getRepeatScheduleValidationMessage({
        startDayOfWeek: '3',
        startTime: '09:00',
        endDayOfWeek: '3',
        endTime: '18:00',
      }),
    ).toBeNull();
  });

  it('rejects invalid time input', () => {
    expect(
      getRepeatScheduleValidationMessage({
        startDayOfWeek: 1,
        startTime: '24:00',
        endDayOfWeek: 1,
        endTime: '25:00',
      }),
    ).toBe('시간은 HH:mm 형식으로 선택해 주세요.');
  });
});
