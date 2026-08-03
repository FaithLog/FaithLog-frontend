import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'root/FaithLogApp.tsx'), 'utf8');
const adminSource = fs.readFileSync(path.join(root, 'admin/AdminScreen.tsx'), 'utf8');
const surfaceSource = fs.readFileSync(
  path.join(root, 'announcements/AnnouncementCapabilitySurfaces.tsx'),
  'utf8',
);

describe('announcement capability surface wiring', () => {
  it('keeps both member and administrator entry points behind the single capability gate', () => {
    expect(appSource).toContain('<HomeAnnouncementCapabilitySection');
    expect(appSource).toContain('<MemberAnnouncementCapabilityRoute');
    expect(appSource).toContain('key={`announcement-route-campus-${state.selectedCampus.campusId}`}');
    expect(appSource).toContain('key={`home-announcements-campus-${campusId}`}');
    expect(appSource).toContain('userId={state.user.id}');
    expect(appSource).toContain('clearAnnouncementImageCacheForUser(');
    expect(appSource).toContain('trackLocalSessionCleanup(clearAnnouncementImageCacheForUser(');
    expect(appSource).toContain('trackLocalSessionCleanup(clearAllAnnouncementImageCaches());');
    expect(adminSource).toContain('const announcementCapabilityEnabled = isAnnouncementCapabilityEnabled();');
    expect(adminSource).toContain('...(announcementCapabilityEnabled');
    expect(adminSource).toContain("? {onOpenAnnouncements: () => setTab('announcements')}");
    expect(adminSource).toContain("if (tab === 'announcements')");
    expect(adminSource.indexOf("if (tab === 'announcements')"))
      .toBeLessThan(adminSource.indexOf("if (loadState.status === 'loading')"));
    expect(adminSource).toContain('<AdminAnnouncementCapabilityRoute');
    expect(adminSource).toContain('accessibilityLabel="관리자 공지 스크롤 영역"');
    expect(adminSource.indexOf('accessibilityLabel="관리자 공지 스크롤 영역"'))
      .toBeLessThan(adminSource.indexOf('<AdminAnnouncementCapabilityRoute'));
    expect(adminSource).toContain('userId={state.user.id}');
    expect(adminSource).toContain('key={`admin-announcements-campus-${campusId}`}');
    expect(surfaceSource.match(/<AnnouncementCapabilityGate>/g)).toHaveLength(3);
  });
});
