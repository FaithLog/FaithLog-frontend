import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'root/FaithLogApp.tsx'), 'utf8');

describe('campus navigation intent wiring', () => {
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
  });
});
