import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'root/FaithLogApp.tsx'), 'utf8');

describe('weekly material home wiring', () => {
  it('keeps announcements visible and places the weekly material entry after the calendar', () => {
    const announcementIndex = appSource.indexOf('<HomeAnnouncementCapabilitySection');
    const calendarIndex = appSource.indexOf('<HomeCalendarEntryCard');
    const weeklyMaterialIndex = appSource.indexOf('<HomeWeeklyMaterialsEntryCard');

    expect(announcementIndex).toBeGreaterThan(-1);
    expect(calendarIndex).toBeGreaterThan(announcementIndex);
    expect(weeklyMaterialIndex).toBeGreaterThan(calendarIndex);
  });

  it('renders the weekly material entry with the shared home-card visual contract', () => {
    expect(appSource).toContain('function HomeWeeklyMaterialsEntryCard');
    expect(appSource).toContain('accessibilityLabel="이번 주 자료 보기"');
    expect(appSource).toContain('name="document"');
    expect(appSource).toContain('목자지침·주일·토목모 나눔지 PDF');
    expect(appSource).toContain('<Text style={styles.homeCalendarButtonText}>보기</Text>');
  });
});
