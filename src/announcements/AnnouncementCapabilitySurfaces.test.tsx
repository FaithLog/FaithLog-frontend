import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, describe, expect, it, vi} from 'vitest';

const renderedChildren = vi.hoisted(() => ({admin: vi.fn(), home: vi.fn(), member: vi.fn()}));

vi.mock('./AdminAnnouncementScreen', () => ({
  AdminAnnouncementScreen: () => {
    renderedChildren.admin();
    return null;
  },
}));
vi.mock('./AnnouncementRouteScreen', () => ({
  AnnouncementRouteScreen: () => {
    renderedChildren.member();
    return null;
  },
}));
vi.mock('./HomeAnnouncementSection', () => ({
  HomeAnnouncementSection: () => {
    renderedChildren.home();
    return null;
  },
}));

import {
  AdminAnnouncementCapabilityRoute,
  HomeAnnouncementCapabilitySection,
  MemberAnnouncementCapabilityRoute,
} from './AnnouncementCapabilitySurfaces';

describe('actual announcement capability surfaces', () => {
  const originalAppEnv = process.env.EXPO_PUBLIC_APP_ENV;
  const originalMockMode = process.env.EXPO_PUBLIC_MOCK_MODE;
  const originalAnnouncementCapability = process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED;

  afterEach(() => {
    renderedChildren.admin.mockClear();
    renderedChildren.home.mockClear();
    renderedChildren.member.mockClear();
    restoreEnvironment('EXPO_PUBLIC_APP_ENV', originalAppEnv);
    restoreEnvironment('EXPO_PUBLIC_MOCK_MODE', originalMockMode);
    restoreEnvironment('EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED', originalAnnouncementCapability);
  });

  it.each(['production', 'preview'])(
    'mounts the confirmed live entry surfaces in %s',
    async (appEnvironment) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnvironment;
      process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
      process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED = 'true';

      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(
          <>
            <HomeAnnouncementCapabilitySection
              campusId={1}
              onOpenAll={vi.fn()}
              onOpenAnnouncement={vi.fn()}
            />
            <MemberAnnouncementCapabilityRoute campusId={1} onBack={vi.fn()} />
            <AdminAnnouncementCapabilityRoute campusId={1} onBack={vi.fn()} />
          </>,
        );
      });

      expect(renderer.toJSON()).toBeNull();
      expect(renderedChildren.home).toHaveBeenCalledTimes(1);
      expect(renderedChildren.member).toHaveBeenCalledTimes(1);
      expect(renderedChildren.admin).toHaveBeenCalledTimes(1);
    },
  );

  it('mounts the actual admin route in an explicit local live-transport integration build', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'local';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
    process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED = 'true';

    await act(async () => {
      create(<AdminAnnouncementCapabilityRoute campusId={1} onBack={vi.fn()} />);
    });

    expect(renderedChildren.admin).toHaveBeenCalledTimes(1);
  });
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
