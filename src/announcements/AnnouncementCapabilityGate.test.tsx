import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, describe, expect, it} from 'vitest';

import {AnnouncementCapabilityGate} from './AnnouncementCapabilityGate';

describe('AnnouncementCapabilityGate rendered exposure', () => {
  const originalAppEnv = process.env.EXPO_PUBLIC_APP_ENV;
  const originalMockMode = process.env.EXPO_PUBLIC_MOCK_MODE;
  const originalAnnouncementCapability = process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED;

  afterEach(() => {
    restoreEnvironment('EXPO_PUBLIC_APP_ENV', originalAppEnv);
    restoreEnvironment('EXPO_PUBLIC_MOCK_MODE', originalMockMode);
    restoreEnvironment('EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED', originalAnnouncementCapability);
  });

  it.each(['production', 'preview'])('renders the confirmed live surface in %s', async (appEnv) => {
    process.env.EXPO_PUBLIC_APP_ENV = appEnv;
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
    process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED = 'true';

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AnnouncementCapabilityGate>
          <MemberAnnouncementEntry />
          <AdminAnnouncementEntry />
        </AnnouncementCapabilityGate>,
      );
    });

    expect(renderer.root.findAllByType('MemberAnnouncementEntry' as never)).toHaveLength(1);
    expect(renderer.root.findAllByType('AdminAnnouncementEntry' as never)).toHaveLength(1);
  });

  it('renders both surfaces only for an explicitly requested local mock build', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'local';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AnnouncementCapabilityGate>
          <MemberAnnouncementEntry />
          <AdminAnnouncementEntry />
        </AnnouncementCapabilityGate>,
      );
    });

    expect(renderer.root.findAllByType('MemberAnnouncementEntry' as never)).toHaveLength(1);
    expect(renderer.root.findAllByType('AdminAnnouncementEntry' as never)).toHaveLength(1);
  });

  it('renders an explicitly enabled local integration surface while mock transport stays disabled', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'local';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
    process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED = 'true';

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AnnouncementCapabilityGate>
          <AdminAnnouncementEntry />
        </AnnouncementCapabilityGate>,
      );
    });

    expect(renderer.root.findAllByType('AdminAnnouncementEntry' as never)).toHaveLength(1);
  });
});

function MemberAnnouncementEntry() {
  return React.createElement('MemberAnnouncementEntry');
}

function AdminAnnouncementEntry() {
  return React.createElement('AdminAnnouncementEntry');
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
