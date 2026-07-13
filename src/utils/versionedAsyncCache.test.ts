import {describe, expect, it} from 'vitest';
import {VersionedAsyncCache} from './versionedAsyncCache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return {promise, resolve};
}

describe('VersionedAsyncCache', () => {
  it('does not let an invalidated old request repopulate a key', async () => {
    const cache = new VersionedAsyncCache<string, string>();
    const old = deferred<string>();
    const oldRequest = cache.getOrLoad('week', () => old.promise);
    cache.invalidate('week');
    const fresh = deferred<string>();
    const freshRequest = cache.getOrLoad('week', () => fresh.promise);
    fresh.resolve('fresh');
    await freshRequest;
    old.resolve('stale');
    await oldRequest;
    expect(cache.get('week')).toBe('fresh');
  });

  it('retries a rejected missing key', async () => {
    const cache = new VersionedAsyncCache<string, string>();
    await expect(cache.getOrLoad('missing', async () => { throw new Error('offline'); }))
      .rejects.toThrow('offline');
    await cache.getOrLoad('missing', async () => 'recovered');
    expect(cache.get('missing')).toBe('recovered');
  });
});
