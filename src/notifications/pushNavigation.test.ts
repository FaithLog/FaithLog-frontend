import {afterEach, describe, expect, it} from 'vitest';

import {getPollOpenTarget, parsePushNotificationOpenPayload} from './pushNavigation';

const originalAppEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
const originalMockMode = process.env.EXPO_PUBLIC_MOCK_MODE;

afterEach(() => {
  restoreEnvironment('EXPO_PUBLIC_APP_ENV', originalAppEnvironment);
  restoreEnvironment('EXPO_PUBLIC_MOCK_MODE', originalMockMode);
});

describe('push notification route payload validation', () => {
  it('maps a strict POLL_OPEN event payload to the existing poll detail route', () => {
    const target = parsePushNotificationOpenPayload({
        eventType: 'POLL_OPEN',
        campusId: '1',
        pollId: '100',
      });
    expect(target).toEqual({
      status: 'valid',
      route: 'polls',
      params: {campusId: 1, pollId: 100},
    });
    expect(target.status === 'valid' ? getPollOpenTarget(target, 1) : null).toEqual({
      campusId: 1,
      pollId: 100,
    });
  });

  it('does not open a poll detail for another campus or a legacy route without a campus id', () => {
    const crossCampus = parsePushNotificationOpenPayload({
      eventType: 'POLL_OPEN',
      campusId: '2',
      pollId: '100',
    });
    const legacyRoute = parsePushNotificationOpenPayload({
      route: 'polls',
      params: {pollId: '100'},
    });

    expect(crossCampus.status === 'valid' ? getPollOpenTarget(crossCampus, 1) : null).toBeNull();
    expect(legacyRoute.status === 'valid' ? getPollOpenTarget(legacyRoute, 1) : null).toBeNull();
  });

  it('rejects POLL_OPEN content, image URLs, unsafe ids and unknown fields', () => {
    expect(
      parsePushNotificationOpenPayload({
        eventType: 'POLL_OPEN',
        campusId: '1',
        pollId: '100',
        imageUrl: 'https://signed.invalid/private',
      }),
    ).toEqual({status: 'invalid', reason: 'unknownParam'});
    expect(
      parsePushNotificationOpenPayload({
        eventType: 'POLL_OPEN',
        campusId: '1',
        pollId: '0',
      }),
    ).toEqual({status: 'invalid', reason: 'invalidParam'});
  });

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

  it('routes published announcement events to a safe announcement detail target', () => {
    enableAnnouncementMockCapability();

    expect(
      parsePushNotificationOpenPayload({
        eventType: 'ANNOUNCEMENT_PUBLISHED',
        campusId: '1',
        announcementId: '100',
        categoryId: '12',
      }),
    ).toEqual({
      status: 'valid',
      route: 'announcements',
      params: {announcementId: 100, campusId: 1, categoryId: 12},
    });
  });

  it('requires the exact announcement event keys', () => {
    enableAnnouncementMockCapability();

    expect(
      parsePushNotificationOpenPayload({
        eventType: 'ANNOUNCEMENT_PUBLISHED',
        campusId: '1',
        announcementId: '100',
        categoryId: '12',
        title: 'sensitive content',
      }),
    ).toEqual({status: 'invalid', reason: 'unknownParam'});

    expect(
      parsePushNotificationOpenPayload({
        eventType: 'ANNOUNCEMENT_PUBLISHED',
        campusId: '1',
        announcementId: '100',
      }),
    ).toEqual({status: 'invalid', reason: 'invalidParam'});
  });

  it.each([
    {campusId: 1, announcementId: '100', categoryId: '12'},
    {campusId: '1', announcementId: 100, categoryId: '12'},
    {campusId: '1', announcementId: '100', categoryId: 12},
    {campusId: '01', announcementId: '100', categoryId: '12'},
    {campusId: '1', announcementId: '9007199254740992', categoryId: '12'},
    {campusId: '1', announcementId: '100', categoryId: '0'},
  ])('rejects non-canonical announcement identifier strings: %j', (identifiers) => {
    enableAnnouncementMockCapability();

    expect(
      parsePushNotificationOpenPayload({
        eventType: 'ANNOUNCEMENT_PUBLISHED',
        ...identifiers,
      }),
    ).toEqual({status: 'invalid', reason: 'invalidParam'});
  });

  it('disables announcement event and route navigation outside the capability gate', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';

    expect(
      parsePushNotificationOpenPayload({
        eventType: 'ANNOUNCEMENT_PUBLISHED',
        campusId: '1',
        announcementId: '100',
        categoryId: '12',
      }),
    ).toEqual({status: 'invalid', reason: 'routeNotAllowed'});
    expect(
      parsePushNotificationOpenPayload({
        route: 'announcements',
        params: {announcementId: '100', campusId: '1', categoryId: '12'},
      }),
    ).toEqual({status: 'invalid', reason: 'routeNotAllowed'});
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

function enableAnnouncementMockCapability() {
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
}

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
