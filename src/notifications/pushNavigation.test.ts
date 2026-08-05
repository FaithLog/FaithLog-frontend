import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
  getPollOpenTarget,
  parsePushNotificationOpenPayload,
  resolveNotificationPollTarget,
} from './pushNavigation';
import {getPollNoticeCapabilities} from '../polls/notice/pollNoticeCapabilities';

const POLL_OPEN_ENABLED = {pollOpenEnabled: true} as const;
const POLL_OPEN_DISABLED = {pollOpenEnabled: false} as const;

const originalAppEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
const originalMockMode = process.env.EXPO_PUBLIC_MOCK_MODE;

afterEach(() => {
  restoreEnvironment('EXPO_PUBLIC_APP_ENV', originalAppEnvironment);
  restoreEnvironment('EXPO_PUBLIC_MOCK_MODE', originalMockMode);
});

describe('push notification route payload validation', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'development');
    vi.stubEnv('EXPO_PUBLIC_MOCK_MODE', 'true');
    vi.stubEnv('EXPO_PUBLIC_WEEKLY_MATERIALS_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps a strict POLL_OPEN event payload to the existing poll detail route', () => {
    const target = parsePushNotificationOpenPayload({
        eventType: 'POLL_OPEN',
        campusId: '1',
        pollId: '100',
      }, POLL_OPEN_ENABLED);
    expect(target).toEqual({
      status: 'valid',
      route: 'polls',
      params: {campusId: 1, pollId: 100},
    });
    expect(target.status === 'valid'
      ? getPollOpenTarget(target, 1, POLL_OPEN_ENABLED)
      : null).toEqual({
      campusId: 1,
      pollId: 100,
    });
  });

  it('accepts POLL_OPEN in production after the final poll notice contract is enabled', () => {
    vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('EXPO_PUBLIC_MOCK_MODE', 'true');
    const productionCapabilities = {
      pollOpenEnabled: getPollNoticeCapabilities().canReadNotice,
    };

    expect(
      parsePushNotificationOpenPayload({
        eventType: 'POLL_OPEN',
        campusId: '1',
        pollId: '100',
      }, productionCapabilities),
    ).toEqual({
      status: 'valid',
      route: 'polls',
      params: {campusId: 1, pollId: 100},
    });
  });

  it('rejects numeric and non-canonical POLL_OPEN identifiers at the original payload boundary', () => {
    for (const payload of [
      {eventType: 'POLL_OPEN', campusId: 1, pollId: '100'},
      {eventType: 'POLL_OPEN', campusId: '1', pollId: 100},
      {eventType: 'POLL_OPEN', campusId: ' 1 ', pollId: '100'},
      {eventType: 'POLL_OPEN', campusId: '1', pollId: '1e2'},
      {eventType: 'POLL_OPEN', campusId: '01', pollId: '100'},
    ]) {
      expect(parsePushNotificationOpenPayload(payload, POLL_OPEN_ENABLED)).toEqual({
        status: 'invalid',
        reason: 'invalidParam',
      });
    }
  });

  it('requires exactly the POLL_OPEN eventType, campusId, and pollId keys', () => {
    expect(
      parsePushNotificationOpenPayload({
        eventType: 'POLL_OPEN',
        campusId: '1',
      }, POLL_OPEN_ENABLED),
    ).toEqual({status: 'invalid', reason: 'invalidParam'});
    expect(
      parsePushNotificationOpenPayload({
        eventType: 'POLL_OPEN',
        campusId: '1',
        pollId: '100',
        targetId: '100',
      }, POLL_OPEN_ENABLED),
    ).toEqual({status: 'invalid', reason: 'unknownParam'});
  });

  it('does not open a poll detail for another campus or a legacy route without a campus id', () => {
    const crossCampus = parsePushNotificationOpenPayload({
      eventType: 'POLL_OPEN',
      campusId: '2',
      pollId: '100',
    }, POLL_OPEN_ENABLED);
    const legacyRoute = parsePushNotificationOpenPayload({
      route: 'polls',
      params: {pollId: '100'},
    });

    expect(crossCampus.status === 'valid'
      ? getPollOpenTarget(crossCampus, 1, POLL_OPEN_ENABLED)
      : null).toBeNull();
    expect(legacyRoute.status === 'valid' ? getPollOpenTarget(legacyRoute, 1) : null).toBeNull();
    expect(legacyRoute.status === 'valid'
      ? resolveNotificationPollTarget(legacyRoute, 1, POLL_OPEN_DISABLED)
      : null).toEqual({status: 'accepted', pollTarget: null});
  });

  it('applies the campus gate only to poll targets and preserves other deep links', () => {
    const crossCampusPoll = parsePushNotificationOpenPayload({
      eventType: 'POLL_OPEN',
      campusId: '2',
      pollId: '100',
    }, POLL_OPEN_ENABLED);
    const campusAdmin = parsePushNotificationOpenPayload({
      route: 'campusAdmin',
      params: {campusId: '1', targetId: '7'},
    });

    expect(crossCampusPoll.status === 'valid'
      ? resolveNotificationPollTarget(crossCampusPoll, 1, POLL_OPEN_ENABLED)
      : null).toEqual({status: 'rejected'});
    expect(campusAdmin.status === 'valid'
      ? resolveNotificationPollTarget(campusAdmin, 1, POLL_OPEN_ENABLED)
      : null).toEqual({status: 'accepted', pollTarget: null});
  });

  it('rejects legacy poll detail resolution while the POLL_OPEN capability is closed', () => {
    const legacyDetail = parsePushNotificationOpenPayload({
      route: 'polls',
      params: {campusId: '1', pollId: '100'},
    });

    expect(legacyDetail.status === 'valid'
      ? resolveNotificationPollTarget(legacyDetail, 1, POLL_OPEN_DISABLED)
      : null).toEqual({status: 'rejected'});
  });

  it('rejects POLL_OPEN content, image URLs, unsafe ids and unknown fields', () => {
    expect(
      parsePushNotificationOpenPayload({
        eventType: 'POLL_OPEN',
        campusId: '1',
        pollId: '100',
        imageUrl: 'https://signed.invalid/private',
      }, POLL_OPEN_ENABLED),
    ).toEqual({status: 'invalid', reason: 'unknownParam'});
    expect(
      parsePushNotificationOpenPayload({
        eventType: 'POLL_OPEN',
        campusId: '1',
        pollId: '0',
      }, POLL_OPEN_ENABLED),
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

  it('routes a weekly sharing-sheet event to its exact week without opening the PDF', () => {
    expect(parsePushNotificationOpenPayload({
      eventType: 'WEEKLY_SHARING_SHEET_PUBLISHED',
      campusId: '1',
      weekStartDate: '2026-08-03',
    })).toEqual({
      status: 'valid',
      route: 'weeklyMaterials',
      params: {campusId: 1, weekStartDate: '2026-08-03'},
    });

    expect(parsePushNotificationOpenPayload({
      eventType: 'WEEKLY_SHARING_SHEET_PUBLISHED',
      weekStartDate: '2026-08-03',
    })).toEqual({
      status: 'valid',
      route: 'weeklyMaterials',
      params: {weekStartDate: '2026-08-03'},
    });
  });

  it('rejects weekly sharing-sheet payload content, invalid dates, and unknown fields', () => {
    expect(parsePushNotificationOpenPayload({
      eventType: 'WEEKLY_SHARING_SHEET_PUBLISHED',
      campusId: '1',
      weekStartDate: '2026-08-04',
    })).toEqual({status: 'invalid', reason: 'invalidParam'});
    expect(parsePushNotificationOpenPayload({
      eventType: 'WEEKLY_SHARING_SHEET_PUBLISHED',
      weekStartDate: '2026-08-03',
      downloadUrl: 'https://signed.invalid/private.pdf',
    })).toEqual({status: 'invalid', reason: 'unknownParam'});
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

  it('enables announcement deep links in production after the REST contract is confirmed', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';

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
    expect(
      parsePushNotificationOpenPayload({
        route: 'announcements',
        params: {announcementId: '100', campusId: '1', categoryId: '12'},
      }),
    ).toEqual({
      status: 'valid',
      route: 'announcements',
      params: {announcementId: 100, campusId: 1, categoryId: 12},
    });
  });

  it('keeps announcement deep links disabled in a local build without an explicit capability', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'local';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';

    expect(parsePushNotificationOpenPayload({
      eventType: 'ANNOUNCEMENT_PUBLISHED',
      campusId: '1',
      announcementId: '100',
      categoryId: '12',
    })).toEqual({status: 'invalid', reason: 'routeNotAllowed'});
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
