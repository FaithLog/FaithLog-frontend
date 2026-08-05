import {normalizeWeekStartDate} from './weeklyMaterialDate';

export const WEEKLY_SHARING_SHEET_EVENT = 'WEEKLY_SHARING_SHEET_PUBLISHED';

export function parseWeeklySharingSheetNotification(data: Record<string, unknown>) {
  if (data.eventType !== WEEKLY_SHARING_SHEET_EVENT) return null;
  const campusId = data.campusId === undefined ? null : parsePositiveId(data.campusId);
  if (data.campusId !== undefined && campusId === null) return null;
  if (typeof data.weekStartDate !== 'string') return null;
  try {
    return {
      campusId,
      highlight: 'SUNDAY_SHARING_SHEET' as const,
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
