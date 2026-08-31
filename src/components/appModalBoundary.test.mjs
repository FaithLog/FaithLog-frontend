import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const sourceRoot = path.resolve(import.meta.dirname, '..');

function collectTsxFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [absolutePath] : [];
  });
}

describe('app modal safe-area boundary', () => {
  it('routes every rendered modal through AppModal', () => {
    const rawModalFiles = collectTsxFiles(sourceRoot)
      .filter((file) => path.basename(file) !== 'AppModal.tsx')
      .filter((file) => fs.readFileSync(file, 'utf8').includes('<Modal'))
      .map((file) => path.relative(sourceRoot, file));

    expect(rawModalFiles).toEqual([]);
  });
});
