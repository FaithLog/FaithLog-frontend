import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(directory, 'FaithLogApp.tsx'), 'utf8');

describe('home duty management wiring', () => {
  it('renders the server-authorized duty block with selected campus and user identity', () => {
    expect(source).toContain('<HomeDutyManagementCards');
    expect(source).toMatch(
      /<HomeDutyManagementCards[\s\S]*?campusId=\{campusId\}[\s\S]*?userId=\{state\.user\.id\}/,
    );
  });

  it('opens the existing coffee and meal profile routes from home', () => {
    expect(source).toMatch(
      /onOpenCoffeeDuty=\{\(\) => \{\s*setProfileView\('coffee'\);\s*setRoute\('profile'\);\s*\}\}/,
    );
    expect(source).toMatch(
      /onOpenMealDuty=\{\(\) => \{\s*setProfileView\('meal'\);\s*setRoute\('profile'\);\s*\}\}/,
    );
  });
});
