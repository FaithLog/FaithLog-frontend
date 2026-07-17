import {readFileSync} from 'node:fs';

import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL('./AdminScreen.tsx', import.meta.url), 'utf8');

describe('admin notification navigation', () => {
  it('exposes only the send section and does not preload hidden notification logs', () => {
    expect(source).toContain("const notificationSections: Array<{id: AdminNotificationSection; label: string}> = [\n  {id: 'send', label: '발송'},\n];");
    expect(source).not.toContain("tab === 'notificationLogs' && notificationLogState.status === 'idle'");
  });
});
