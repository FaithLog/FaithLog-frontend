import {FaithLogApiError} from '../api/apiError';

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export function getSeoulCurrentWeekStartDate(now = new Date()) {
  const seoul = new Date(now.getTime() + SEOUL_OFFSET_MS);
  const day = seoul.getUTCDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = Date.UTC(
    seoul.getUTCFullYear(),
    seoul.getUTCMonth(),
    seoul.getUTCDate() - daysFromMonday,
  );
  return toIsoDate(new Date(monday));
}

export function normalizeWeekStartDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalidWeek();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || toIsoDate(parsed) !== value || parsed.getUTCDay() !== 1) {
    return invalidWeek();
  }
  return value;
}

export function moveWeekStartDate(value: string, distance: number) {
  const normalized = normalizeWeekStartDate(value);
  if (!Number.isSafeInteger(distance)) return invalidWeek();
  const next = new Date(`${normalized}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + distance * 7);
  return toIsoDate(next);
}

export function formatWeeklyMaterialHeader(value: string) {
  const normalized = normalizeWeekStartDate(value);
  const start = new Date(`${normalized}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const month = start.getUTCMonth() + 1;
  const weekOfMonth = Math.floor((start.getUTCDate() - 1) / 7) + 1;
  return {
    weekLabel: `${month}월 ${weekOfMonth}주`,
    rangeLabel: `${formatYearMonthDay(start)} - ${pad(end.getUTCMonth() + 1)}.${pad(end.getUTCDate())}`,
  };
}

export function formatWeeklyMaterialDeletionDate(value: string) {
  const date = new Date(`${normalizeWeekStartDate(value)}T00:00:00.000Z`);
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 주차`;
}

function formatYearMonthDay(value: Date) {
  return `${value.getUTCFullYear()}.${pad(value.getUTCMonth() + 1)}.${pad(value.getUTCDate())}`;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function invalidWeek(): never {
  throw new FaithLogApiError({
    kind: 'error',
    code: 'WEEKLY_MATERIAL_WEEK_INVALID',
    message: '주차 정보를 확인해 주세요.',
  });
}
