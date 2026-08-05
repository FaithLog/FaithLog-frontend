import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const home = readFileSync(new URL('./HomeAnnouncementSection.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('./AdminAnnouncementScreen.tsx', import.meta.url), 'utf8');

describe('announcement screen structure', () => {
  it('keeps the home announcement action visually compact with a 44pt touch target', () => {
    expect(home).toContain('accessibilityLabel="캠퍼스 공지 전체 보기"');
    expect(home).toMatch(/allButtonTouch:[\s\S]*?minHeight: 44/);
    expect(home).toMatch(/allButtonVisual:[\s\S]*?height: 30/);
  });

  it('keeps admin list, editor, and category screens as separate components', () => {
    expect(admin).toContain('export function AdminAnnouncementListScreen');
    expect(admin).toContain('export function AnnouncementEditorScreen');
    expect(admin).toContain('export function AnnouncementCategoryScreen');
  });
});
