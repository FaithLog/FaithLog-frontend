import {describe, expect, it, vi} from 'vitest';

import {resolveCachedDocument, type DocumentCacheAdapter} from './documentCacheCoordinator';

function createAdapter(existing: boolean): DocumentCacheAdapter {
  return {
    download: vi.fn(async ({cacheKey}) => `file:///cache/${cacheKey}.pdf`),
    exists: vi.fn(async () => existing),
    resolveUri: (cacheKey) => `file:///cache/${cacheKey}.pdf`,
    touch: vi.fn(async () => undefined),
  };
}

describe('PDF local cache coordinator', () => {
  it('reuses the stable asset/hash key when a signed URL rotates', async () => {
    const adapter = createAdapter(true);
    const input = {adapter, assetId: 31, sha256: 'a'.repeat(64)};
    const first = await resolveCachedDocument({...input, signedUrl: 'https://signed.example/old'});
    const second = await resolveCachedDocument({...input, signedUrl: 'https://signed.example/new'});
    expect(first.cacheKey).toBe(second.cacheKey);
    expect(first.downloaded).toBe(false);
    expect(adapter.download).not.toHaveBeenCalled();
  });

  it('redownloads after the OS removes the cached file', async () => {
    const adapter = createAdapter(false);
    const result = await resolveCachedDocument({adapter, assetId: 31, sha256: 'b'.repeat(64), signedUrl: 'https://signed.example/current'});
    expect(result.downloaded).toBe(true);
    expect(adapter.download).toHaveBeenCalledWith({cacheKey: `31-${'b'.repeat(64)}-document`, signedUrl: 'https://signed.example/current'});
  });
});
