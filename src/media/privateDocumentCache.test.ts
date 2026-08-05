import {describe, expect, it, vi} from 'vitest';

import {
  MEDIA_CACHE_MAX_BYTES,
  MEDIA_CACHE_TTL_MS,
  MEDIA_DOCUMENT_CACHE_MAX_BYTES,
} from './mediaCachePolicy';
import {
  createPrivateDocumentCache,
  type PrivateDocumentCacheStorage,
} from './privateDocumentCacheCore';

describe('private document cache', () => {
  it('stores a downloaded PDF, reuses it, and persists last access metadata', async () => {
    const storage = createStorage();
    const cache = createPrivateDocumentCache({now: () => 1_000, storage});
    const key = cacheKey(1, 'a');

    await expect(cache.exists(key)).resolves.toBe(false);
    await expect(cache.download({cacheKey: key, signedUrl: 'https://signed.example/a'}))
      .resolves.toBe(`file:///cache/${key}.pdf`);
    await expect(cache.exists(key)).resolves.toBe(true);
    await cache.touch(key, 2_000);

    expect(storage.download).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.text.get('private-document-cache-metadata-v1.json') ?? '{}'))
      .toMatchObject({entries: [{key, byteSize: 1024, lastAccessedAt: 2_000}], version: 1});
  });

  it('removes expired files and least-recently-used files above the shared 200MB limit', async () => {
    const now = MEDIA_CACHE_TTL_MS + 10_000;
    const storage = createStorage();
    const expired = cacheKey(1, 'a');
    const oldest = cacheKey(2, 'b');
    const newest = cacheKey(3, 'c');
    storage.files.set(`${expired}.pdf`, 10);
    storage.files.set(`${oldest}.pdf`, 60 * 1024 * 1024);
    storage.files.set(`${newest}.pdf`, 50 * 1024 * 1024);
    storage.text.set('private-document-cache-metadata-v1.json', JSON.stringify({
      entries: [
        {key: expired, byteSize: 10, lastAccessedAt: 0},
        {key: oldest, byteSize: 60 * 1024 * 1024, lastAccessedAt: now - 2_000},
        {key: newest, byteSize: 50 * 1024 * 1024, lastAccessedAt: now - 1_000},
      ],
      version: 1,
    }));

    const cache = createPrivateDocumentCache({now: () => now, storage});
    await expect(cache.exists(newest)).resolves.toBe(true);

    expect(MEDIA_CACHE_MAX_BYTES).toBe(200 * 1024 * 1024);
    expect(MEDIA_DOCUMENT_CACHE_MAX_BYTES).toBe(100 * 1024 * 1024);
    expect(storage.files.has(`${expired}.pdf`)).toBe(false);
    expect(storage.files.has(`${oldest}.pdf`)).toBe(false);
    expect(storage.files.has(`${newest}.pdf`)).toBe(true);
  });

  it('drops corrupt metadata/files and clears every private PDF on logout', async () => {
    const storage = createStorage();
    const key = cacheKey(4, 'd');
    storage.files.set(`${key}.pdf`, 200);
    storage.text.set('private-document-cache-metadata-v1.json', '{broken');
    const cache = createPrivateDocumentCache({storage});

    await expect(cache.exists(key)).resolves.toBe(false);
    await cache.download({cacheKey: key, signedUrl: 'https://signed.example/d'});
    await cache.clearAll();

    expect(storage.files.size).toBe(0);
    expect(storage.text.size).toBe(0);
  });

  it('fails closed for an unsafe cache key or non-HTTPS signed URL', async () => {
    const cache = createPrivateDocumentCache({storage: createStorage()});
    await expect(cache.exists('../secret')).rejects.toThrow('Invalid document cache key');
    await expect(cache.download({cacheKey: cacheKey(1, 'a'), signedUrl: 'http://signed.example/a'}))
      .rejects.toThrow('Invalid signed document URL');
  });
});

function cacheKey(assetId: number, character: string) {
  return `${assetId}-${character.repeat(64)}-document`;
}

function createStorage(): PrivateDocumentCacheStorage & {
  files: Map<string, number>;
  text: Map<string, string>;
  download: ReturnType<typeof vi.fn>;
} {
  const files = new Map<string, number>();
  const text = new Map<string, string>();
  const download = vi.fn(async (name: string) => {
    files.set(name, 1024);
    return {sizeBytes: 1024, uri: `file:///cache/${name}`};
  });
  return {
    files,
    text,
    download,
    async deleteEntry(name) {
      files.delete(name);
      text.delete(name);
    },
    async ensureDirectory() {},
    async fileInfo(name) {
      return {exists: files.has(name), sizeBytes: files.get(name) ?? 0, uri: `file:///cache/${name}`};
    },
    async listEntryNames() {
      return [...files.keys(), ...text.keys()];
    },
    async readText(name) {
      const value = text.get(name);
      if (value === undefined) throw new Error('missing text');
      return value;
    },
    async writeTextAtomically(name, _temporaryName, value) {
      text.set(name, value);
    },
  };
}
