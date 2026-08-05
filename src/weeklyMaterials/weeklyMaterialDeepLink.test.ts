import {describe, expect, it} from 'vitest';

import {parseWeeklySharingSheetNotification} from './weeklyMaterialDeepLink';

describe('weekly sharing sheet notification boundary', () => {
  it('selects the exact campus and Monday without opening the PDF automatically', () => {
    expect(parseWeeklySharingSheetNotification({
      eventType: 'WEEKLY_SHARING_SHEET_PUBLISHED',
      campusId: '7',
      weekStartDate: '2026-08-03',
    })).toEqual({
      campusId: 7,
      highlight: 'SHARING_SHEET',
      openPdf: false,
      weekStartDate: '2026-08-03',
    });
  });

  it('fails closed for another event, invalid campus, or non-Monday date', () => {
    expect(parseWeeklySharingSheetNotification({eventType: 'OTHER'})).toBeNull();
    expect(parseWeeklySharingSheetNotification({eventType: 'WEEKLY_SHARING_SHEET_PUBLISHED', campusId: '0', weekStartDate: '2026-08-03'})).toBeNull();
    expect(parseWeeklySharingSheetNotification({eventType: 'WEEKLY_SHARING_SHEET_PUBLISHED', campusId: '7', weekStartDate: '2026-08-04'})).toBeNull();
  });
});
