import {describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => {
  class TestFaithLogApiError extends Error {
    readonly detail: {code?: string; kind: string; message: string};

    constructor(detail: {code?: string; kind: string; message: string}) {
      super(detail.message);
      this.detail = detail;
    }
  }

  return {
    apiRequest: vi.fn(),
    FaithLogApiError: TestFaithLogApiError,
    isMockModeEnabled: vi.fn(() => false),
  };
});

import {
  createDutyChargeReminderApi,
  type DutyChargeReminderRequestDispatcher,
} from './dutyChargeReminderApi';

describe('duty charge reminder API', () => {
  it.each([
    ['COFFEE', '/api/v1/campuses/3/coffee/charge-reminders'],
    ['MEAL', '/api/v1/campuses/3/meal/charge-reminders'],
  ] as const)('sends a bodyless %s POST and parses the accepted result', async (dutyType, path) => {
    const result = {
      notificationRequestId: `request-${dutyType.toLowerCase()}`,
      queuedCount: 4,
      skippedCount: 2,
    };
    const {request, spy} = createRequestHarness(result);
    const api = createDutyChargeReminderApi({isMockMode: () => true, request});

    await api.send('token', 3, dutyType);

    expect(spy).toHaveBeenCalledWith(
      path,
      expect.objectContaining({accessToken: 'token', expectedStatuses: [202], method: 'POST'}),
    );
    expect(spy.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('rejects malformed queued/skipped counts at the runtime boundary', async () => {
    const {request} = createRequestHarness({
      notificationRequestId: 'request-1',
      queuedCount: -1,
      skippedCount: 0,
    });
    const api = createDutyChargeReminderApi({isMockMode: () => true, request});

    await expect(api.send('token', 1, 'COFFEE')).rejects.toThrow('Invalid API response.');
  });

  it('dispatches production requests after the canonical REST Docs contract is confirmed', async () => {
    const {request, spy} = createRequestHarness({
      notificationRequestId: 'request-production',
      queuedCount: 1,
      skippedCount: 0,
    });
    const api = createDutyChargeReminderApi({isMockMode: () => false, request});

    await api.send('token', 1, 'MEAL');
    expect(spy).toHaveBeenCalledWith('/api/v1/campuses/1/meal/charge-reminders', expect.objectContaining({
      expectedStatuses: [202],
      method: 'POST',
    }));
    expect(spy.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });
});

function createRequestHarness(response: unknown) {
  const spy = vi.fn();
  const request: DutyChargeReminderRequestDispatcher = async (path, options) => {
    spy(path, options);
    return options.responseParser(response);
  };
  return {request, spy};
}
