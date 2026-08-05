import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'root/FaithLogApp.tsx'), 'utf8');

describe('campus navigation intent wiring', () => {
  it('validates notification payloads before superseding an active campus intent', () => {
    const handler = appSource.match(
      /const handlePayload = async \(payload: unknown\) => \{([\s\S]*?)\n    \};\n\n    if \(!initialNotificationOpenHandledRef/,
    )?.[1] ?? '';

    const parseCall = 'parsePushNotificationOpenPayload(payload, pushCapabilities)';
    expect(handler.indexOf(parseCall)).toBeGreaterThan(-1);
    expect(handler.indexOf(parseCall))
      .toBeLessThan(handler.indexOf('++notificationOpenSequenceRef.current'));
    expect(handler.indexOf('++notificationOpenSequenceRef.current'))
      .toBeLessThan(handler.indexOf('campusNavigationIntentRef.current.begin()'));
  });

  it('settles failed notification and initial-reservation intents through recovery', () => {
    const notification = appSource.match(
      /const handlePayload = async \(payload: unknown\) => \{([\s\S]*?)\n    \};\n\n    if \(!initialNotificationOpenHandledRef/,
    )?.[1] ?? '';
    const initialReservation = appSource.match(
      /const initialCampusIntent = campusNavigationIntentRef\.current\.begin\(\);([\s\S]*?)\n    \}\n\n    const unsubscribe/,
    )?.[1] ?? '';

    expect(notification).toContain('let navigationCommitted = false');
    expect(notification).toContain('} finally {');
    expect(notification).toContain('recoverCampusNavigation(');
    expect(initialReservation).toContain('.finally(async () => {');
    expect(initialReservation).toContain('recoverCampusNavigation(');
  });

  it('queues a same-current manual campus selection instead of only invalidating older work', () => {
    const branch = appSource.match(
      /if \(campus\.campusId === state\.selectedCampus\.campusId\) \{([\s\S]*?)\n    \}/,
    );

    expect(branch?.[1]).toContain('campusNavigation.enqueue');
    expect(branch?.[1]).toContain('saveSelectedCampusId');
    expect(branch?.[1]).toContain('setAuthState');
  });

  it('restores navigation when a sheet refresh follows an already-started notification commit', () => {
    const refresh = appSource.match(
      /const refreshCampuses = async \(\) => \{([\s\S]*?)\n  \};\n\n  const openCampusSwitch/,
    );

    expect(refresh?.[1]).toContain('const returnRoute = route');
    expect(refresh?.[1]).toContain('const returnAnnouncementId = announcementInitialId');
    expect(refresh?.[1]).toContain('setAnnouncementInitialId(returnAnnouncementId)');
    expect(refresh?.[1]).toContain('setRoute(returnRoute)');
    expect(refresh?.[1]).toContain('let campusIntentCommitted = false');
    expect(refresh?.[1]).toContain('recoverCampusNavigation(campusIntent, requestGeneration)');
  });

  it('settles both same-current and cross-campus selection failures', () => {
    const selection = appSource.match(
      /const selectCampus = async \(campus: CampusMembershipSummary\) => \{([\s\S]*?)\n  \};\n\n  const completeLogout/,
    )?.[1] ?? '';

    expect(selection).toContain('let campusIntentCommitted = false');
    expect(selection.match(/recoverCampusNavigation\(campusIntent, requestGeneration\)/g))
      .toHaveLength(2);
  });

  it('persists authoritative campus state for every successful queued intent', () => {
    expect(appSource).toContain('persist: () => saveSelectedCampusId(refreshed.selectedCampus.campusId)');
    expect(appSource.match(/nextState\.status === 'authenticated' \? nextState\.selectedCampus\.campusId : null/g))
      .toHaveLength(2);
  });
});
