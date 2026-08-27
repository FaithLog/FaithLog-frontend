import {readFileSync} from 'node:fs';

import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL('./AdminScreen.tsx', import.meta.url), 'utf8');

describe('admin notification navigation', () => {
  it('exposes only the send section and does not preload hidden notification logs', () => {
    expect(source).toContain("const notificationSections: Array<{id: AdminNotificationSection; label: string}> = [\n  {id: 'send', label: '발송'},\n];");
    expect(source).not.toContain("tab === 'notificationLogs' && notificationLogState.status === 'idle'");
  });

  it('renders skipped recipients as delivery information instead of a state conflict', () => {
    const sentSheetStart = source.indexOf('function NotificationSentSheet(');
    const sentSheetEnd = source.indexOf('\nfunction PollCloseConfirmSheet(', sentSheetStart);
    const sentSheetSource = source.slice(sentSheetStart, sentSheetEnd);

    expect(sentSheetSource).toContain('{skippedCount}명은 알림 수신 정보가 없어 제외되었습니다.');
    expect(sentSheetSource).not.toContain('<AdminInlineError');
    expect(sentSheetSource).not.toContain("kind: 'conflict'");
  });

  it('keeps notification confirmation and result sheets above Android button navigation', () => {
    const screenWiringStart = source.indexOf('<NotificationConfirmSheet');
    const screenWiringEnd = source.indexOf('<ChargeStatusConfirmSheet', screenWiringStart);
    const screenWiring = source.slice(screenWiringStart, screenWiringEnd);
    const confirmSheetStart = source.indexOf('function NotificationConfirmSheet(');
    const confirmSheetEnd = source.indexOf('\nfunction NotificationSentSheet(', confirmSheetStart);
    const confirmSheetSource = source.slice(confirmSheetStart, confirmSheetEnd);
    const sentSheetStart = source.indexOf('function NotificationSentSheet(');
    const sentSheetEnd = source.indexOf('\nfunction PollCloseConfirmSheet(', sentSheetStart);
    const sentSheetSource = source.slice(sentSheetStart, sentSheetEnd);

    expect(screenWiring.match(/bottomInset=\{androidShellInsets\.bottomNavInset\}/g)).toHaveLength(2);
    expect(confirmSheetSource).toContain('bottomInset: number;');
    expect(confirmSheetSource).toContain('paddingBottom: spacing.card + bottomInset');
    expect(sentSheetSource).toContain('bottomInset: number;');
    expect(sentSheetSource).toContain('marginBottom: bottomInset');
  });
});
