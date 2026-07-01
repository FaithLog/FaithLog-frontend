const minutesInDay = 24 * 60;
const minutesInWeek = 7 * minutesInDay;

export type RepeatScheduleInput = {
  endDayOfWeek: number | string;
  endTime: string;
  startDayOfWeek: number | string;
  startTime: string;
};

export function getRepeatScheduleValidationMessage(input: RepeatScheduleInput) {
  const startMinutes = parseRepeatTimeMinutes(input.startTime);
  const endMinutes = parseRepeatTimeMinutes(input.endTime);

  if (startMinutes === null || endMinutes === null) {
    return '시간은 HH:mm 형식으로 선택해 주세요.';
  }

  const durationMinutes = getWeeklyRepeatDurationMinutes({
    endDayOfWeek: input.endDayOfWeek,
    endMinutes,
    startDayOfWeek: input.startDayOfWeek,
    startMinutes,
  });

  return durationMinutes > 0 ? null : '마감 요일과 시간은 시작보다 뒤여야 합니다.';
}

export function getWeeklyRepeatDurationMinutes(input: {
  endDayOfWeek: number | string;
  endMinutes: number;
  startDayOfWeek: number | string;
  startMinutes: number;
}) {
  const startTotalMinutes =
    (coerceRepeatDayOfWeek(input.startDayOfWeek) - 1) * minutesInDay + input.startMinutes;
  let endTotalMinutes =
    (coerceRepeatDayOfWeek(input.endDayOfWeek) - 1) * minutesInDay + input.endMinutes;

  if (endTotalMinutes <= startTotalMinutes) {
    endTotalMinutes += minutesInWeek;
  }

  return endTotalMinutes - startTotalMinutes;
}

function coerceRepeatDayOfWeek(value: number | string) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 7 ? parsed : 1;
}

function parseRepeatTimeMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}
