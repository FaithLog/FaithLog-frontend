import {describe, expect, it} from 'vitest';
import {shouldHandleRequestError} from './requestErrorLineage';

describe('request error lineage', () => {
  it('handles refresh expiry after clearTokens advances generation', () => {
    expect(shouldHandleRequestError({
      kind: 'sessionExpired', code: 'AUTH_REFRESH_EXPIRED', message: 'expired',
      authSessionGeneration: 4,
    }, 4, 5)).toBe(true);
  });

  it.each(['Home', 'Payment', 'Poll'])(
    'routes %s sessionExpired from the original lineage after generation bump',
    () => {
      let generation = 8;
      const requestGeneration = generation;
      generation += 1; // mirrors client clearTokens(requestGeneration)
      const error = {
        kind: 'sessionExpired' as const,
        code: 'AUTH_REFRESH_EXPIRED',
        message: 'expired',
        authSessionGeneration: requestGeneration,
      };
      expect(shouldHandleRequestError(error, requestGeneration, generation)).toBe(true);
    },
  );

  it('drops an actual account/session replacement', () => {
    expect(shouldHandleRequestError({
      kind: 'error', code: 'AUTH_SESSION_CHANGED', message: 'changed',
      authSessionGeneration: 4,
    }, 4, 5)).toBe(false);
  });
});
