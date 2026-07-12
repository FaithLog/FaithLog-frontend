import {describe, expect, it, vi} from 'vitest';

vi.mock('../api/tokenStorage', () => ({
  clearTokens: vi.fn(),
  getAuthSessionGeneration: vi.fn(() => 0),
}));
import {createSessionExpirationHandler, isExpirationEventCurrent} from './sessionExpiration';

describe('central session expiration lineage', () => {
  const event = {expiredGeneration: 4 as never, clearedGeneration: 5 as never};
  it('accepts only the exact clear transition', () => {
    expect(isExpirationEventCurrent(event, 5)).toBe(true);
    expect(isExpirationEventCurrent(event, 6)).toBe(false);
    expect(isExpirationEventCurrent(event, 7)).toBe(false);
  });

  it('expires globally when AUTH_SESSION_CHANGED rejects first and expiry arrives later', async () => {
    let finishExpiry!: () => void;
    const laterExpiry = new Promise<void>((resolve) => { finishExpiry = resolve; });
    let expired = false;
    const handler = createSessionExpirationHandler(() => 5, () => { expired = true; });
    const aggregate = Promise.all([
      Promise.reject(new Error('AUTH_SESSION_CHANGED')),
      laterExpiry.then(() => handler(event)),
    ]).catch(() => undefined);
    await aggregate;
    expect(expired).toBe(false);
    finishExpiry();
    await laterExpiry;
    await Promise.resolve();
    expect(expired).toBe(true);
  });

  it.each(['Home unmounted', 'Poll navigated from A to B'])(
    'expires at root even when %s',
    () => {
      let rootState = 'authenticated';
      const handler = createSessionExpirationHandler(() => 5, () => {
        rootState = 'sessionExpired';
      });
      handler(event);
      expect(rootState).toBe('sessionExpired');
    },
  );
});
