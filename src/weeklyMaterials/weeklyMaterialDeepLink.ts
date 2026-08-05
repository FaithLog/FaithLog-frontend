import {normalizeWeekStartDate} from './weeklyMaterialDate';

export const PROVISIONAL_WEEKLY_SHARING_SHEET_EVENT = 'WEEKLY_SHARING_SHEET_PUBLISHED';

export function parseWeeklySharingSheetNotification(data: Record<string, unknown>) {
  if (data.eventType !== PROVISIONAL_WEEKLY_SHARING_SHEET_EVENT) return null;
  const campusId = parsePositiveId(data.campusId);
  if (campusId === null || typeof data.weekStartDate !== 'string') return null;
  try {
    return {
      campusId,
      highlight: 'SHARING_SHEET' as const,
      openPdf: false as const,
      weekStartDate: normalizeWeekStartDate(data.weekStartDate),
    };
  } catch {
    return null;
  }
}

function parsePositiveId(value: unknown) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
