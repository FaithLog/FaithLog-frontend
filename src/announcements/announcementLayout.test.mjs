import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const root = readFileSync(new URL('../root/FaithLogApp.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('./AdminAnnouncementScreen.tsx', import.meta.url), 'utf8');

describe('announcement screen structure', () => {
  it('keeps the home announcement action visually compact with a 44pt touch target', () => {
    expect(root).toContain('accessibilityLabel="캠퍼스 공지 전체 보기"');
    expect(root).toMatch(/homeAnnouncementButtonTouch:[\s\S]*?minHeight: 44/);
    expect(root).toMatch(/homeAnnouncementButtonVisual:[\s\S]*?height: 30/);
  });

  it('keeps admin list, editor, and category screens as separate components', () => {
    expect(admin).toContain('export function AdminAnnouncementListScreen');
    expect(admin).toContain('export function AnnouncementEditorScreen');
    expect(admin).toContain('export function AnnouncementCategoryScreen');
  });
});
