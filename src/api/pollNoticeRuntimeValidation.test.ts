import {describe, expect, it} from 'vitest';

import {parsePollDetail, parsePollSummaryList} from './runtimeValidation';

describe('poll notice runtime validation', () => {
  it('maps list hasNotice without accepting notice body in summary', () => {
    const summary = pollSummary({hasNotice: true});
    expect(parsePollSummaryList([summary])[0]).toMatchObject({hasNotice: true});
    expect(() => parsePollSummaryList([{...summary, notice: 'summary leak'}])).toThrow();
  });

  it('maps detail notice and ordered image asset ids', () => {
    const detail = pollDetail({notice: '  장소 안내  ', imageAssetIds: [5, 2]});
    expect(parsePollDetail(detail)).toMatchObject({
      notice: '장소 안내',
      imageAssetIds: [5, 2],
    });
  });

  it('safely hides the pending capability for legacy responses', () => {
    expect(parsePollSummaryList([pollSummary()])[0]?.hasNotice).toBeUndefined();
    const legacyDetail = parsePollDetail(pollDetail());
    expect(legacyDetail.notice).toBeUndefined();
    expect(legacyDetail.imageAssetIds).toBeUndefined();
  });

  it('rejects a non-boolean hasNotice capability instead of treating it as false', () => {
    expect(() => parsePollSummaryList([pollSummary({hasNotice: 'true'})])).toThrow();
  });

  it('rejects duplicate or invalid image ids in detail', () => {
    expect(() => parsePollDetail(pollDetail({imageAssetIds: [1, 1]}))).toThrow();
    expect(() => parsePollDetail(pollDetail({imageAssetIds: [0]}))).toThrow();
  });
});

function pollSummary(patch: Record<string, unknown> = {}) {
  return {
    id: 1,
    campusId: 1,
    title: '테스트',
    pollType: 'CUSTOM',
    selectionType: 'SINGLE',
    isAnonymous: false,
    allowUserOptionAdd: true,
    startsAt: '2026-08-03T00:00:00Z',
    endsAt: '2026-08-04T00:00:00Z',
    status: 'OPEN',
    responded: false,
    manageableByMe: true,
    ...patch,
  };
}

function pollDetail(patch: Record<string, unknown> = {}) {
  return {
    ...pollSummary(),
    templateId: null,
    chargeGenerationType: 'NONE',
    paymentCategory: null,
    paymentAccountId: null,
    options: [{id: 1, content: 'A', composeMenuCode: null, priceAmount: 0, sortOrder: 1}],
    myResponse: null,
    ...patch,
  };
}
