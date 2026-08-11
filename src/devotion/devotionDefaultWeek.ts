import type {WeeklyDevotionSummary} from '../api/types';

export type InitialDevotionWeekReason = 'current' | 'explicit' | 'previousUnsubmitted';

export type InitialDevotionWeekSelection = {
  currentWeekStart: string;
  preloadedWeekly: WeeklyDevotionSummary | null;
  reason: InitialDevotionWeekReason;
  selectedWeekStart: string;
};

type ResolveInitialDevotionWeekInput = {
  explicitSelectedDate: string | null;
  loadWeek: (weekStartDate: string) => Promise<WeeklyDevotionSummary>;
  now?: Date;
};

const SEOUL_TIME_ZONE = 'Asia/Seoul';

export async function resolveInitialDevotionWeek({
  explicitSelectedDate,
  loadWeek,
  now = new Date(),
}: ResolveInitialDevotionWeekInput): Promise<InitialDevotionWeekSelection> {
  const {currentWeekStart, previousWeekStart} = getSeoulDevotionWeekContext(now);

  if (explicitSelectedDate) {
    return {
      currentWeekStart,
      preloadedWeekly: null,
      reason: 'explicit',
      selectedWeekStart: getMondayForDate(explicitSelectedDate),
    };
  }

  const previousWeekly = await loadWeek(previousWeekStart);

  if (previousWeekly.weekStartDate !== previousWeekStart) {
    throw new Error('Unexpected weekly devotion response.');
  }

  if (previousWeekly.submittedAt === null) {
    return {
      currentWeekStart,
      preloadedWeekly: previousWeekly,
      reason: 'previousUnsubmitted',
      selectedWeekStart: previousWeekStart,
    };
  }

  return {
    currentWeekStart,
    preloadedWeekly: null,
    reason: 'current',
    selectedWeekStart: currentWeekStart,
  };
}

export function getSeoulDevotionWeekContext(now: Date) {
  const currentDate = getDateInTimeZone(now, SEOUL_TIME_ZONE);
  const currentWeekStart = getMondayForDate(currentDate);

  return {
    currentWeekStart,
    previousWeekStart: addCalendarDays(currentWeekStart, -7),
  };
}

export function getMondayForDate(value: string) {
  const date = parseCalendarDate(value);
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return formatCalendarDate(date);
}

function getDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = byType.get('year');
  const month = byType.get('month');
  const day = byType.get('day');

  if (!year || !month || !day) {
    throw new Error('Unable to resolve the current calendar date.');
  }

  return `${year}-${month}-${day}`;
}

function addCalendarDays(value: string, amount: number) {
  const date = parseCalendarDate(value);
  date.setUTCDate(date.getUTCDate() + amount);

  return formatCalendarDate(date);
}

function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new Error('Invalid calendar date.');
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));

  if (formatCalendarDate(date) !== value) {
    throw new Error('Invalid calendar date.');
  }

  return date;
}

function formatCalendarDate(date: Date) {
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}
