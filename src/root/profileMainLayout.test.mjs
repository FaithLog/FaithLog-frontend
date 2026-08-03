import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(directory, 'FaithLogApp.tsx'), 'utf8');

describe('profile main layout', () => {
  it('keeps identity metadata in one readable column without a duplicate role chip', () => {
    const profileStart = source.indexOf('function ProfileScreen(');
    const profileEnd = source.indexOf('\nfunction CoffeeDutyProfileRow(', profileStart);
    const profileSource = source.slice(profileStart, profileEnd);

    expect(profileSource).not.toContain('styles.profileRoleChip');
    expect(profileSource).toContain('styles.profileCampusText');
  });

  it('groups compact action rows into calm section surfaces', () => {
    expect(source).toMatch(/profileRowList:\s*\{\s*backgroundColor: colors\.borderSoft,/);
    expect(source).toMatch(/profileRowList:\s*\{[\s\S]*?overflow: 'hidden'/);
    expect(source).toMatch(/profileActionRow:\s*\{[\s\S]*?backgroundColor: colors\.surface/);
    expect(source).toMatch(/profileActionRow:\s*\{[\s\S]*?minHeight: 72/);
    expect(source).toMatch(/profileActionRow:\s*\{[\s\S]*?paddingHorizontal: 16/);
  });
});
