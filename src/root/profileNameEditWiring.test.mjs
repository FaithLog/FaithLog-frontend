import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));
const rootSource = fs.readFileSync(path.join(directory, 'FaithLogApp.tsx'), 'utf8');

describe('profile name edit wiring', () => {
  it('applies the full updated user through the authenticated root state boundary', () => {
    expect(rootSource).toContain('<ProfileNameEditor');
    expect(rootSource).toContain('subscribeCurrentUserCache(({generation, user})');
    expect(rootSource).toContain('applyProfileUserUpdate(');
    expect(rootSource).toContain('readCurrentUserCache(generation, user.id) ?? user');
  });
});
