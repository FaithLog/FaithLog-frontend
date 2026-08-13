import {afterEach, describe, expect, it} from 'vitest';

import {
  isAnnouncementCapabilityEnabled,
  isAnnouncementMockModeEnabled,
  isAnnouncementPdfCapabilityEnabled,
} from './announcementEnvironment';

const originalAppEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
const originalMockMode = process.env.EXPO_PUBLIC_MOCK_MODE;
const originalAnnouncementCapability = process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED;
const originalPdfCapability = process.env.EXPO_PUBLIC_ANNOUNCEMENT_PDF_ENABLED;

afterEach(() => {
  restoreEnvironment('EXPO_PUBLIC_APP_ENV', originalAppEnvironment);
  restoreEnvironment('EXPO_PUBLIC_MOCK_MODE', originalMockMode);
  restoreEnvironment('EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED', originalAnnouncementCapability);
  restoreEnvironment('EXPO_PUBLIC_ANNOUNCEMENT_PDF_ENABLED', originalPdfCapability);
});

describe('announcement runtime capability', () => {
  it('exposes the confirmed PDF UI anywhere the live announcement capability is enabled', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
    process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED = 'true';
    expect(isAnnouncementPdfCapabilityEnabled()).toBe(true);

    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    expect(isAnnouncementPdfCapabilityEnabled()).toBe(true);
  });

  it('enables the confirmed announcement and PDF capability by default in development', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
    delete process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED;
    delete process.env.EXPO_PUBLIC_ANNOUNCEMENT_PDF_ENABLED;
    expect(isAnnouncementCapabilityEnabled()).toBe(true);
    expect(isAnnouncementPdfCapabilityEnabled()).toBe(true);
  });

  it('still supports an explicit local kill switch', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
    process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED = 'false';
    expect(isAnnouncementCapabilityEnabled()).toBe(false);
  });

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

  it.each(['preview', 'production'])(
    'enables the confirmed live announcement contract in %s builds',
    (appEnvironment) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnvironment;
      process.env.EXPO_PUBLIC_MOCK_MODE = 'false';

      expect(isAnnouncementCapabilityEnabled()).toBe(true);
    },
  );

  it.each(['preview', 'production'])(
    'does not let an invalid mock request expose announcements in %s',
    (appEnvironment) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnvironment;
      process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
      process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED = 'true';

      expect(isAnnouncementMockModeEnabled()).toBe(false);
      expect(isAnnouncementCapabilityEnabled()).toBe(true);
    },
  );

  it.each([undefined, '', 'qa', 'prod'])(
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
