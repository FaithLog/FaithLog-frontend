import {readFileSync} from 'node:fs';

import {describe, expect, it} from 'vitest';

const adminScreenSource = readFileSync(new URL('./AdminScreen.tsx', import.meta.url), 'utf8');
const weeklySectionSource = readFileSync(
  new URL('./AdminWeeklyDevotionSection.tsx', import.meta.url),
  'utf8',
);
const shellRoutesSource = readFileSync(new URL('../navigation/shellRoutes.ts', import.meta.url), 'utf8');

describe('admin weekly devotion mobile layout contract', () => {
  it('adds the weekly-status tab only inside the gated campus admin screen', () => {
    expect(adminScreenSource).toContain("{id: 'weekly', label: '주차별 현황'}");
    expect(adminScreenSource).toContain("devotionSection === 'weekly'");
    expect(shellRoutesSource).toContain("routes.push('campusAdmin')");
    expect(shellRoutesSource).toContain("user.role === 'ADMIN'");
  });

  it('shows a range navigator and no top summary card', () => {
    expect(weeklySectionSource).toContain('이전 주 주차별 현황 조회');
    expect(weeklySectionSource).toContain('다음 주 주차별 현황 조회');
    expect(weeklySectionSource).toContain('formatAdminWeekRange');
    expect(weeklySectionSource).not.toContain('요약 카드');
    expect(weeklySectionSource).not.toContain('<Metric');
  });

  it('keeps submitted and missing members in separate accessible regions', () => {
    expect(weeklySectionSource).toContain('제출자 표');
    expect(weeklySectionSource).toContain('미제출자 목록');
    expect(weeklySectionSource).toContain('일별 상세 열기');
    expect(weeklySectionSource).toContain('horizontal');
    expect(weeklySectionSource).toContain('ellipsizeMode="tail"');
  });

  it('provides an icon-only Excel action with label, tooltip, and disabled state', () => {
    expect(weeklySectionSource).toContain('name="download"');
    expect(weeklySectionSource).toContain('accessibilityLabel="주차별 경건 현황 Excel 다운로드"');
    expect(weeklySectionSource).toContain('tooltip="Excel 다운로드"');
    expect(weeklySectionSource).toContain('disabled={exporting}');
  });

  it('renders loading, empty, error, permission, and retry states independently', () => {
    expect(weeklySectionSource).toContain("case 'loading'");
    expect(weeklySectionSource).toContain("case 'empty'");
    expect(weeklySectionSource).toContain("case 'error'");
    expect(weeklySectionSource).toContain("case 'permissionDenied'");
    expect(weeklySectionSource).toContain('onActionPress={onRetry}');
  });
});
