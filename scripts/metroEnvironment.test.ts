import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {normalizeAppEnvironment} = require('./metroEnvironment') as {
  normalizeAppEnvironment: (value?: string) => string;
};

describe('Metro production environment normalization', () => {
  it.each(['production', 'Production', ' production '])(
    'normalizes %j to production',
    (value) => expect(normalizeAppEnvironment(value)).toBe('production'),
  );

  it('defaults missing values to local', () => {
    expect(normalizeAppEnvironment()).toBe('local');
  });
});
