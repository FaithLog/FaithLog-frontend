import {describe, expect, it} from 'vitest';

import {parsePushNotificationOpenPayload} from './pushNavigation';

describe('push notification route payload validation', () => {
  it('accepts only the route/params shape and normalizes allowed params', () => {
    expect(
      parsePushNotificationOpenPayload({
        route: 'polls',
        params: {
          pollId: '42',
          targetId: 7,
        },
      }),
    ).toEqual({
      status: 'valid',
      route: 'polls',
      params: {
        pollId: 42,
        targetId: 7,
      },
    });
  });

  it('keeps routes without params on their safe route state', () => {
    expect(parsePushNotificationOpenPayload({route: 'userHome'})).toEqual({
      status: 'valid',
      route: 'userHome',
      params: {},
    });
  });

  it('rejects arbitrary deep links, paths, and unknown routes', () => {
    expect(parsePushNotificationOpenPayload('faithlog://polls/1')).toEqual({
      status: 'invalid',
      reason: 'payloadNotObject',
    });
    expect(parsePushNotificationOpenPayload({route: '/polls/1', params: {}})).toEqual({
      status: 'invalid',
      reason: 'routeNotAllowed',
    });
    expect(parsePushNotificationOpenPayload({route: 'unknown', params: {}})).toEqual({
      status: 'invalid',
      reason: 'routeNotAllowed',
    });
  });

  it('rejects unknown param fields before navigation', () => {
    expect(
      parsePushNotificationOpenPayload({
        route: 'polls',
        params: {
          pollId: 1,
          rawUrl: 'https://faithlog.test/polls/1',
        },
      }),
    ).toEqual({
      status: 'invalid',
      reason: 'unknownParam',
    });
  });

  it('rejects invalid identifiers and invalid dates', () => {
    expect(
      parsePushNotificationOpenPayload({
        route: 'polls',
        params: {pollId: '0'},
      }),
    ).toEqual({
      status: 'invalid',
      reason: 'invalidParam',
    });

    expect(
      parsePushNotificationOpenPayload({
        route: 'devotion',
        params: {weekStartDate: '2026-02-30'},
      }),
    ).toEqual({
      status: 'invalid',
      reason: 'invalidParam',
    });
  });
});
