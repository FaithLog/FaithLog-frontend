import {describe, expect, it} from 'vitest';

import {getPollDetailScrollOwner} from './pollScrollOwnership';

describe('Poll detail scroll ownership', () => {
  it.each([
    ['response', 'scrollView'],
    ['comments', 'flatList'],
    ['results', 'sectionList'],
  ] as const)('mounts one %s tab vertical owner: %s', (tab, owner) => {
    expect(getPollDetailScrollOwner(tab)).toBe(owner);
  });
});
