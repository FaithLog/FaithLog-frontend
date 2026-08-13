import fs from 'node:fs';

import {describe, expect, it} from 'vitest';

const appConfig = fs.readFileSync(new URL('../../app.config.js', import.meta.url), 'utf8');
const plugin = fs.readFileSync(new URL('../../plugins/withTossRemittance.js', import.meta.url), 'utf8');

describe('Toss remittance native configuration', () => {
  it('registers the outgoing supertoss query scheme for iOS and Android', () => {
    expect(appConfig).toContain("'./plugins/withTossRemittance'");
    expect(plugin).toContain('LSApplicationQueriesSchemes');
    expect(plugin).toContain('android.intent.action.VIEW');
    expect(plugin).toContain('android.intent.category.BROWSABLE');
    expect(plugin).toContain("const TOSS_SCHEME = 'supertoss'");
  });
});
