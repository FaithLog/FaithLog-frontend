import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'root/FaithLogApp.tsx'), 'utf8');

describe('shepherd attendance home wiring', () => {
  it('places the Sunday shepherd-attendance card immediately before announcements', () => {
    const shepherdIndex = appSource.indexOf('<HomeShepherdAttendanceSection');
    const announcementIndex = appSource.indexOf('<HomeAnnouncementCapabilitySection');

    expect(shepherdIndex).toBeGreaterThan(-1);
    expect(announcementIndex).toBeGreaterThan(shepherdIndex);
  });
});
