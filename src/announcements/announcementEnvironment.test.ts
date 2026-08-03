import {afterEach, describe, expect, it} from 'vitest';

import {
  isAnnouncementCapabilityEnabled,
  isAnnouncementMockModeEnabled,
} from './announcementEnvironment';

const originalAppEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
const originalMockMode = process.env.EXPO_PUBLIC_MOCK_MODE;
const originalAnnouncementCapability = process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED;

afterEach(() => {
  restoreEnvironment('EXPO_PUBLIC_APP_ENV', originalAppEnvironment);
  restoreEnvironment('EXPO_PUBLIC_MOCK_MODE', originalMockMode);
  restoreEnvironment('EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED', originalAnnouncementCapability);
});

describe('announcement runtime capability', () => {
  it.each(['local', 'development'])('enables announcements only for mock %s runs', (appEnvironment) => {
    process.env.EXPO_PUBLIC_APP_ENV = appEnvironment;
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    expect(isAnnouncementMockModeEnabled()).toBe(true);
    expect(isAnnouncementCapabilityEnabled()).toBe(true);
  });

  it.each(['local', 'development'])(
    'allows an explicit %s integration build to exercise native media with the live transport',
    (appEnvironment) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnvironment;
      process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
      process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED = 'true';

      expect(isAnnouncementMockModeEnabled()).toBe(false);
      expect(isAnnouncementCapabilityEnabled()).toBe(true);
    },
  );

  it.each(['local', 'development', 'preview', 'prod', 'production'])(
    'keeps announcements hidden from non-mock %s runs pending live approval',
    (appEnvironment) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnvironment;
      process.env.EXPO_PUBLIC_MOCK_MODE = 'false';

      expect(isAnnouncementCapabilityEnabled()).toBe(false);
    },
  );

  it.each(['preview', 'prod', 'production'])(
    'does not let an invalid mock request expose announcements in %s',
    (appEnvironment) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnvironment;
      process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
      process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED = 'true';

      expect(isAnnouncementMockModeEnabled()).toBe(false);
      expect(isAnnouncementCapabilityEnabled()).toBe(false);
    },
  );

  it.each([undefined, '', 'qa'])(
    'fails closed when the app environment is missing, blank, or unknown (%s)',
    (appEnvironment) => {
      if (appEnvironment === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
      else process.env.EXPO_PUBLIC_APP_ENV = appEnvironment;
      process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
      process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED = 'true';

      expect(isAnnouncementMockModeEnabled()).toBe(false);
      expect(isAnnouncementCapabilityEnabled()).toBe(false);
    },
  );
});

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
