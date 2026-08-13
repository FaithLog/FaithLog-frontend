import {describe, expect, it} from 'vitest';
import {isCampusRequestReady} from './campusRequestGuard';

describe('isCampusRequestReady', () => {
  it.each([null, undefined, 'null', '1', 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'blocks campus-scoped requests while campus identity is not restored: %s',
    (campusId) => expect(isCampusRequestReady(campusId)).toBe(false),
  );

  it('allows a restored positive integer campus identity', () => {
    expect(isCampusRequestReady(108)).toBe(true);
  });
});
