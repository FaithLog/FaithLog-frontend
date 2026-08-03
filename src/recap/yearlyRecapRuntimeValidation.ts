import {FaithLogApiError} from '../api/apiError';
import type {
  YearlyRecap,
  YearlyRecapCampus,
  YearlyRecapDevotion,
  YearlyRecapPollActivity,
  YearlyRecapPrayerActivity,
} from './yearlyRecapTypes';

type UnknownRecord = Record<string, unknown>;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseYearlyRecapEnvelope(value: unknown): YearlyRecap {
  try {
    const envelope = record(value);
    if (envelope.success !== true || envelope.code !== 'SUCCESS') throw new Error();
    requireString(envelope.message);
    requireDateTime(envelope.timestamp);
    return parseYearlyRecapData(envelope.data);
  } catch {
    throw invalidResponse();
  }
}

export function parseYearlyRecapData(value: unknown): YearlyRecap {
  try {
    const data = record(value);
    const recapYear = positiveSafeInteger(data.recapYear);
    const presentation = record(data.presentation);
    const campusJourney = record(data.campusJourney);
    const campuses = array(campusJourney.campuses).map(parseCampus);
    assertUnique(campuses.map((campus) => campus.campusId));

    const recap: YearlyRecap = {
      recapYear,
      hasRecapData: boolean(data.hasRecapData),
      presentation: {
        shouldAutoPresent: boolean(presentation.shouldAutoPresent),
        homeCardVisible: boolean(presentation.homeCardVisible),
        homeCardVisibleUntil: requireDateTime(presentation.homeCardVisibleUntil),
        firstPresentedAt:
          presentation.firstPresentedAt === null
            ? null
            : requireDateTime(presentation.firstPresentedAt),
      },
      campusJourney: {campuses},
      devotion: parseDevotion(data.devotion),
      prayerActivity: parsePrayerActivity(data.prayerActivity),
      pollActivity: parsePollActivity(data.pollActivity),
    };
    assertRecapConsistency(recap);
    return recap;
  } catch (error) {
    if (error instanceof FaithLogApiError) throw error;
    throw invalidResponse();
  }
}

function parseCampus(value: unknown): YearlyRecapCampus {
  const campus = record(value);
  return {
    campusId: positiveSafeInteger(campus.campusId),
    campusName: requireString(campus.campusName),
    joinedDate: requireCalendarDate(campus.joinedDate),
    joinedDuringRecapYear: boolean(campus.joinedDuringRecapYear),
  };
}

function parseDevotion(value: unknown): YearlyRecapDevotion {
  const devotion = record(value);
  const mostActiveMonth = nonNegativeSafeInteger(devotion.mostActiveMonth);
  if (mostActiveMonth > 12) throw new Error();
  return {
    quietTimeCount: nonNegativeSafeInteger(devotion.quietTimeCount),
    bibleReadingCount: nonNegativeSafeInteger(devotion.bibleReadingCount),
    prayerCount: nonNegativeSafeInteger(devotion.prayerCount),
    allCompletedDayCount: nonNegativeSafeInteger(devotion.allCompletedDayCount),
    submittedWeekCount: nonNegativeSafeInteger(devotion.submittedWeekCount),
    longestStreakDays: nonNegativeSafeInteger(devotion.longestStreakDays),
    mostActiveMonth,
  };
}

function parsePrayerActivity(value: unknown): YearlyRecapPrayerActivity {
  const activity = record(value);
  return {
    submittedWeekCount: nonNegativeSafeInteger(activity.submittedWeekCount),
    participatedSeasonCount: nonNegativeSafeInteger(activity.participatedSeasonCount),
  };
}

function parsePollActivity(value: unknown): YearlyRecapPollActivity {
  const activity = record(value);
  return {
    participatedCount: nonNegativeSafeInteger(activity.participatedCount),
    wedServicePollCount: nonNegativeSafeInteger(activity.wedServicePollCount),
    saturdayLeaderPollCount: nonNegativeSafeInteger(activity.saturdayLeaderPollCount),
    coffeePollCount: nonNegativeSafeInteger(activity.coffeePollCount),
    mealPollCount: nonNegativeSafeInteger(activity.mealPollCount),
    customPollCount: nonNegativeSafeInteger(activity.customPollCount),
    commentCount: nonNegativeSafeInteger(activity.commentCount),
  };
}

function record(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
  return value as UnknownRecord;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error();
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error();
  return value;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error();
  return value;
}

function requireCalendarDate(value: unknown): string {
  const candidate = requireString(value);
  const match = DATE_PATTERN.exec(candidate);
  if (!match) throw new Error();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new Error();
  return candidate;
}

function requireDateTime(value: unknown): string {
  const candidate = requireString(value);
  if (!Number.isFinite(Date.parse(candidate))) throw new Error();
  return candidate;
}

function nonNegativeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error();
  return value as number;
}

function positiveSafeInteger(value: unknown): number {
  const parsed = nonNegativeSafeInteger(value);
  if (parsed === 0) throw new Error();
  return parsed;
}

function assertUnique(values: number[]) {
  if (new Set(values).size !== values.length) throw new Error();
}

function assertRecapConsistency(recap: YearlyRecap) {
  if (recap.recapYear < 2000 || recap.recapYear > 9999) throw new Error();
  for (const campus of recap.campusJourney.campuses) {
    const joinedYear = Number(campus.joinedDate.slice(0, 4));
    if (
      joinedYear > recap.recapYear ||
      campus.joinedDuringRecapYear !== (joinedYear === recap.recapYear)
    ) throw new Error();
  }
  const devotion = recap.devotion;
  if (
    devotion.allCompletedDayCount > devotion.quietTimeCount ||
    devotion.allCompletedDayCount > devotion.bibleReadingCount ||
    devotion.allCompletedDayCount > devotion.prayerCount
  ) throw new Error();
  const poll = recap.pollActivity;
  const typeTotal =
    poll.wedServicePollCount +
    poll.saturdayLeaderPollCount +
    poll.coffeePollCount +
    poll.mealPollCount +
    poll.customPollCount;
  if (typeTotal !== poll.participatedCount) throw new Error();
}

function invalidResponse() {
  return new FaithLogApiError({
    kind: 'error',
    status: 200,
    code: 'INVALID_SERVER_RESPONSE',
    message: '서버 응답 형식이 올바르지 않습니다.',
  });
}
