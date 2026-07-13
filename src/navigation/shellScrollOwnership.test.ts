import {describe, expect, it} from 'vitest';

import {getShellScrollOwner} from './shellScrollOwnership';

describe('authenticated shell scroll ownership', () => {
  it('keeps the Poll route out of the shell ScrollView', () => {
    expect(getShellScrollOwner('polls', false)).toBe('route');
  });

  it('keeps ordinary routes and authenticated entry flows in the shell ScrollView', () => {
    expect(getShellScrollOwner('userHome', false)).toBe('shell');
    expect(getShellScrollOwner('polls', true)).toBe('shell');
  });
});
