import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));
const rootSource = fs.readFileSync(path.join(directory, 'FaithLogApp.tsx'), 'utf8');
const screenSource = fs.readFileSync(
  path.join(directory, '../profile/ProfilePasswordChangeScreen.tsx'),
  'utf8',
);

describe('profile password-change production wiring', () => {
  it('uses credential-only clear and returns an optional cleanup warning to signed-out UI', () => {
    expect(screenSource).toContain('clearPasswordChangedSession(requestGeneration)');
    expect(screenSource).not.toContain('expireAuthSession(requestGeneration)');
    expect(rootSource).toContain('onPasswordChanged={(warning) => setAuthState({');
    expect(rootSource).toContain("status: 'signedOut'");
    expect(rootSource).toContain('...(warning ? {warning} : {})');
  });
});
