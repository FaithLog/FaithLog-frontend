import {describe, expect, it} from 'vitest';

import {
  createAnnouncementImageCacheAdapter,
  type AnnouncementImageCacheStorage,
} from './announcementImageCacheAdapter';

describe('announcement filesystem image cache adapter', () => {
  it('persists bytes and small JSON metadata, then returns the stable local URI on a hit', async () => {
    const storage = new MemoryCacheStorage();
    const cache = createAnnouncementImageCacheAdapter({now: () => 100, storage});
    const identity = imageIdentity({assetId: 9, namespace: 'account-42'});

    const writtenUri = await cache.putBytes(identity, new Uint8Array([1, 2, 3]));
    await expect(cache.getUri(identity)).resolves.toBe(writtenUri);

    expect(writtenUri).toMatch(/^file:\/\/\/cache\/faithlog-announcement-images-v1\//);
    expect(storage.dataFileNames()).toHaveLength(1);
    const metadata = storage.readMetadata();
    expect(metadata).toMatchObject({
      version: 1,
      entries: [expect.objectContaining({
        key: expect.stringContaining('/account-42/9/'),
        lastAccessedAt: 100,
        namespace: 'account-42',
        sizeBytes: 3,
      })],
    });
    expect(JSON.stringify(metadata)).not.toContain('https://');
  });

  it('expires an entry at seven days and removes both bytes and metadata', async () => {
    const storage = new MemoryCacheStorage();
    let now = 1_000;
    const cache = createAnnouncementImageCacheAdapter({now: () => now, storage});
    const identity = imageIdentity({assetId: 1});
    await cache.putBytes(identity, new Uint8Array([1]));

    now += 7 * day;

    await expect(cache.getUri(identity)).resolves.toBeNull();
    expect(storage.dataFileNames()).toEqual([]);
    expect(storage.readMetadata().entries).toEqual([]);
  });

  it('applies the image half of the shared LRU budget using actual file sizes', async () => {
    const storage = new MemoryCacheStorage();
    let now = 1_000;
    const cache = createAnnouncementImageCacheAdapter({now: () => now, storage});
    const old = imageIdentity({assetId: 1});
    const recent = imageIdentity({assetId: 2});
    await cache.putBytes(old, new Uint8Array([1]));
    now += 1;
    await cache.putBytes(recent, new Uint8Array([2]));
    storage.setStoredSize(1, 60 * megabyte);
    storage.setStoredSize(2, 50 * megabyte);

    const result = await cache.cleanup();

    expect(result.deleteKeys).toHaveLength(1);
    await expect(cache.getUri(old)).resolves.toBeNull();
    await expect(cache.getUri(recent)).resolves.toMatch(/^file:\/\/\/cache\//);
  });

  it('deletes corrupted bytes when actual size no longer matches metadata', async () => {
    const storage = new MemoryCacheStorage();
    const cache = createAnnouncementImageCacheAdapter({now: () => 100, storage});
    const identity = imageIdentity({assetId: 3});
    await cache.putBytes(identity, new Uint8Array([1, 2, 3]));
    storage.corruptActualSize(3, 0);

    await expect(cache.getUri(identity)).resolves.toBeNull();
    expect(storage.dataFileNames()).toEqual([]);
    expect(storage.readMetadata().entries).toEqual([]);
  });

  it('clears only the logging-out user namespace', async () => {
    const storage = new MemoryCacheStorage();
    const cache = createAnnouncementImageCacheAdapter({now: () => 100, storage});
    const signedOut = imageIdentity({assetId: 1, namespace: 'account-42'});
    const retained = imageIdentity({assetId: 2, namespace: 'account-99'});
    await cache.putBytes(signedOut, new Uint8Array([1]));
    await cache.putBytes(retained, new Uint8Array([2]));

    await cache.clearNamespace('account-42');

    await expect(cache.getUri(signedOut)).resolves.toBeNull();
    await expect(cache.getUri(retained)).resolves.toMatch(/^file:\/\/\/cache\//);
    expect(storage.readMetadata().entries).toEqual([
      expect.objectContaining({namespace: 'account-99'}),
    ]);
  });

  it('discovers and clears every campus namespace for an account after a process restart', async () => {
    const storage = new MemoryCacheStorage();
    const writer = createAnnouncementImageCacheAdapter({now: () => 100, storage});
    const firstCampus = imageIdentity({assetId: 1, namespace: 'account-42-campus-1'});
    const removedCampus = imageIdentity({assetId: 2, namespace: 'account-42-campus-2'});
    const otherAccount = imageIdentity({assetId: 3, namespace: 'account-99-campus-1'});
    await writer.putBytes(firstCampus, new Uint8Array([1]));
    await writer.putBytes(removedCampus, new Uint8Array([2]));
    await writer.putBytes(otherAccount, new Uint8Array([3]));
    const restarted = createAnnouncementImageCacheAdapter({now: () => 100, storage});

    await restarted.clearNamespacePrefix('account-42-campus-');

    await expect(restarted.getUri(firstCampus)).resolves.toBeNull();
    await expect(restarted.getUri(removedCampus)).resolves.toBeNull();
    await expect(restarted.getUri(otherAccount)).resolves.toMatch(/^file:\/\/\/cache\//);
    expect(storage.readMetadata().entries).toEqual([
      expect.objectContaining({namespace: 'account-99-campus-1'}),
    ]);
  });

  it('rejects explicit account cleanup and retains retry metadata when file deletion fails', async () => {
    const storage = new MemoryCacheStorage();
    let now = 100;
    const cache = createAnnouncementImageCacheAdapter({now: () => now, storage});
    const signedOut = imageIdentity({assetId: 1, namespace: 'account-42-campus-1'});
    const retained = imageIdentity({assetId: 2, namespace: 'account-99-campus-1'});
    await cache.putBytes(signedOut, new Uint8Array([1]));
    await cache.putBytes(retained, new Uint8Array([2]));
    now += 7 * day;
    storage.setMetadataAccess(2, now);
    storage.failDeletionForAsset(1);

    await expect(cache.clearNamespacePrefix('account-42-campus-')).rejects.toThrow(
      'explicit image cache cleanup failed',
    );
    expect(storage.readMetadata().entries.map((entry) => entry.namespace).sort()).toEqual([
      'account-42-campus-1',
      'account-99-campus-1',
    ]);

    storage.allowDeletionForAsset(1);
    await expect(cache.clearNamespacePrefix('account-42-campus-')).resolves.toMatchObject({
      keepKeys: [expect.stringContaining('/account-99-campus-1/')],
    });
    expect(storage.readMetadata().entries).toEqual([
      expect.objectContaining({namespace: 'account-99-campus-1'}),
    ]);
  });

  it('discovers and clears all namespaces when the capability is disabled', async () => {
    const storage = new MemoryCacheStorage();
    const writer = createAnnouncementImageCacheAdapter({now: () => 100, storage});
    await writer.putBytes(
      imageIdentity({assetId: 1, namespace: 'account-42-campus-1'}),
      new Uint8Array([1]),
    );
    await writer.putBytes(
      imageIdentity({assetId: 2, namespace: 'account-99-campus-2'}),
      new Uint8Array([2]),
    );
    const restarted = createAnnouncementImageCacheAdapter({now: () => 100, storage});

    await restarted.clearAll();

    expect(storage.dataFileNames()).toEqual([]);
    expect(storage.readMetadata()).toEqual({entries: [], version: 1});
  });

  it('rejects clear-all until active download cleanup settles, then clears crash residuals', async () => {
    const storage = new MemoryCacheStorage();
    const activeDownload = 'account-42-campus-1--download-active.image-download';
    const crashedDownload = 'account-42-campus-1--download-crashed.image-download';
    storage.seedEntry(activeDownload);
    storage.seedEntry(crashedDownload);
    const protectedEntryNames = new Set([activeDownload]);
    const cache = createAnnouncementImageCacheAdapter({
      now: () => 100,
      protectedEntryNames: () => protectedEntryNames,
      storage,
    });

    await expect(cache.clearAll()).rejects.toThrow('active download cleanup is still pending');
    expect(storage.temporaryDownloadFileNames()).toEqual([activeDownload, crashedDownload]);

    protectedEntryNames.clear();
    await cache.clearAll();
    expect(storage.temporaryDownloadFileNames()).toEqual([]);
  });

  it('rejects account cleanup until its active download settles without blocking another account', async () => {
    const storage = new MemoryCacheStorage();
    const activeDownload = 'account-42-campus-1--download-active.image-download';
    const crashedDownload = 'account-42-campus-2--download-crashed.image-download';
    const otherAccountDownload = 'account-99-campus-1--download-crashed.image-download';
    const activePrepared = 'prepared-active.image-upload';
    const crashedPrepared = 'prepared-crashed.image-upload';
    storage.seedEntry(activeDownload);
    storage.seedEntry(crashedDownload);
    storage.seedEntry(otherAccountDownload);
    storage.seedEntry(activePrepared);
    storage.seedEntry(crashedPrepared);
    const protectedEntryNames = new Set([
      activeDownload,
      activePrepared,
      otherAccountDownload,
    ]);
    const cache = createAnnouncementImageCacheAdapter({
      now: () => 100,
      protectedEntryNames: () => protectedEntryNames,
      storage,
    });

    await expect(cache.clearNamespacePrefix('account-42-campus-')).rejects.toThrow(
      'active download cleanup is still pending',
    );
    expect(storage.temporaryDownloadFileNames()).toEqual([
      activeDownload,
      crashedDownload,
      otherAccountDownload,
    ]);
    expect(storage.preparedUploadFileNames()).toEqual([activePrepared, crashedPrepared]);

    protectedEntryNames.delete(activeDownload);
    protectedEntryNames.delete(activePrepared);
    await cache.clearNamespacePrefix('account-42-campus-');

    expect(storage.temporaryDownloadFileNames()).toEqual([otherAccountDownload]);
    expect(storage.preparedUploadFileNames()).toEqual([]);
  });

  it('surfaces explicit temp cleanup failure and leaves the orphan retryable', async () => {
    const storage = new MemoryCacheStorage();
    const crashedDownload = 'account-42-campus-1--download-crashed.image-download';
    storage.seedEntry(crashedDownload);
    storage.failDeletionForName(crashedDownload);
    const cache = createAnnouncementImageCacheAdapter({now: () => 100, storage});

    await expect(cache.clearNamespacePrefix('account-42-campus-')).rejects.toThrow(
      'explicit image cache cleanup failed',
    );
    expect(storage.temporaryDownloadFileNames()).toEqual([crashedDownload]);

    storage.allowDeletionForName(crashedDownload);
    await expect(cache.clearNamespacePrefix('account-42-campus-')).resolves.toBeDefined();
    expect(storage.temporaryDownloadFileNames()).toEqual([]);
  });

  it('strictly clears owned prepared JPEGs on an account cleanup and retries deletion failure', async () => {
    const storage = new MemoryCacheStorage();
    const preparedJpeg = 'prepared-crashed.image-upload';
    storage.seedEntry(preparedJpeg);
    storage.failDeletionForName(preparedJpeg);
    const cache = createAnnouncementImageCacheAdapter({now: () => 100, storage});

    await expect(cache.clearNamespacePrefix('account-42-campus-')).rejects.toThrow(
      'explicit image cache cleanup failed',
    );
    expect(storage.preparedUploadFileNames()).toEqual([preparedJpeg]);

    storage.allowDeletionForName(preparedJpeg);
    await cache.clearNamespacePrefix('account-42-campus-');
    expect(storage.preparedUploadFileNames()).toEqual([]);
  });

  it('fails closed on corrupted JSON metadata and deletes orphaned cached images', async () => {
    const storage = new MemoryCacheStorage();
    const cache = createAnnouncementImageCacheAdapter({now: () => 100, storage});
    const identity = imageIdentity({assetId: 4});
    await cache.putBytes(identity, new Uint8Array([1, 2]));
    storage.corruptMetadata('{not-json');
    const restartedCache = createAnnouncementImageCacheAdapter({now: () => 100, storage});

    await expect(restartedCache.getUri(identity)).resolves.toBeNull();
    expect(storage.dataFileNames()).toEqual([]);
    expect(storage.readMetadata()).toEqual({entries: [], version: 1});
  });

  it('repairs partially invalid metadata even when the requested valid entry is a hit', async () => {
    const storage = new MemoryCacheStorage();
    const identity = imageIdentity({assetId: 5});
    const writer = createAnnouncementImageCacheAdapter({now: () => 100, storage});
    await writer.putBytes(identity, new Uint8Array([1, 2]));
    const metadata = storage.readMetadata();
    storage.corruptMetadata(JSON.stringify({
      ...metadata,
      entries: [...metadata.entries, {broken: true}],
    }));
    const restartedCache = createAnnouncementImageCacheAdapter({now: () => 100, storage});

    await expect(restartedCache.getUri(identity)).resolves.toMatch(/^file:\/\/\/cache\//);
    expect(storage.readMetadata().entries).toEqual([
      expect.objectContaining({key: expect.stringContaining('/5/')}),
    ]);
  });

  it('serializes concurrent writes so metadata never drops a completed entry', async () => {
    const storage = new MemoryCacheStorage();
    const cache = createAnnouncementImageCacheAdapter({now: () => 100, storage});

    await Promise.all([
      cache.putBytes(imageIdentity({assetId: 1}), new Uint8Array([1])),
      cache.putBytes(imageIdentity({assetId: 2}), new Uint8Array([2])),
    ]);

    expect(storage.readMetadata().entries).toHaveLength(2);
    expect(storage.dataFileNames()).toHaveLength(2);
  });

  it('selects the uniquely newest hash for an immutable asset and deletes stale hash entries', async () => {
    const storage = new MemoryCacheStorage();
    let now = 100;
    const cache = createAnnouncementImageCacheAdapter({now: () => now, storage});
    await cache.putBytes(imageIdentity({assetId: 7, sha256: 'a'.repeat(64)}), new Uint8Array([1]));
    now = 200;
    await cache.putBytes(imageIdentity({assetId: 7, sha256: 'b'.repeat(64)}), new Uint8Array([2]));

    const uri = await cache.getUriForAsset({
      assetId: 7,
      namespace: 'account-42',
      variant: 'thumbnail',
    });

    expect(uri).toContain('b'.repeat(64));
    expect(storage.dataFileNames()).toEqual([
      expect.stringContaining(`--7--${'b'.repeat(64)}--thumbnail.image-cache`),
    ]);
    expect(storage.readMetadata().entries).toEqual([
      expect.objectContaining({key: expect.stringContaining(`/7/${'b'.repeat(64)}/thumbnail`)}),
    ]);
  });

  it('fails closed when competing hashes have no uniquely newest metadata entry', async () => {
    const storage = new MemoryCacheStorage();
    const cache = createAnnouncementImageCacheAdapter({now: () => 100, storage});
    await cache.putBytes(imageIdentity({assetId: 8, sha256: 'a'.repeat(64)}), new Uint8Array([1]));
    await cache.putBytes(imageIdentity({assetId: 8, sha256: 'b'.repeat(64)}), new Uint8Array([2]));

    await expect(cache.getUriForAsset({
      assetId: 8,
      namespace: 'account-42',
      variant: 'thumbnail',
    })).resolves.toBeNull();
    expect(storage.dataFileNames()).toEqual([]);
  });

  it('reuses reconciled metadata in memory instead of rescanning every rendered image hit', async () => {
    const storage = new MemoryCacheStorage();
    const cache = createAnnouncementImageCacheAdapter({now: () => 100, storage});
    await cache.putBytes(imageIdentity({assetId: 9}), new Uint8Array([1, 2, 3]));

    for (let index = 0; index < 10; index += 1) {
      await expect(cache.getUriForAsset({
        assetId: 9,
        namespace: 'account-42',
        variant: 'thumbnail',
      })).resolves.toMatch(/^file:\/\/\/cache\//);
    }

    expect(storage.listEntryNamesCalls).toBe(1);
    expect(storage.metadataWriteCalls).toBe(1);
  });

  it('does not serialize unchanged metadata again for repeated cache misses', async () => {
    const storage = new MemoryCacheStorage();
    const cache = createAnnouncementImageCacheAdapter({now: () => 100, storage});
    await cache.putBytes(imageIdentity({assetId: 9}), new Uint8Array([1, 2, 3]));
    const writesAfterWarmup = storage.metadataWriteCalls;

    for (let index = 0; index < 10; index += 1) {
      const assetId = 100 + index;
      await expect(cache.getUri(imageIdentity({assetId}))).resolves.toBeNull();
      await expect(cache.getUriForAsset({
        assetId,
        namespace: 'account-42',
        variant: 'thumbnail',
      })).resolves.toBeNull();
    }

    expect(storage.metadataWriteCalls).toBe(writesAfterWarmup);
    expect(storage.readMetadata().entries).toHaveLength(1);
  });

  it('uses valid recent metadata after restart and performs a full reconciliation at most daily', async () => {
    const storage = new MemoryCacheStorage();
    let now = 100;
    const identity = imageIdentity({assetId: 11});
    const writer = createAnnouncementImageCacheAdapter({now: () => now, storage});
    await writer.putBytes(identity, new Uint8Array([1, 2, 3]));
    expect(storage.listEntryNamesCalls).toBe(1);
    const activeDownload = 'account-42-campus-1--download-active.image-download';
    const crashedDownload = 'account-42-campus-1--download-crashed.image-download';
    const activePrepared = 'prepared-active.image-upload';
    const crashedPrepared = 'prepared-crashed.image-upload';
    storage.seedEntry(activeDownload);
    storage.seedEntry(crashedDownload);
    storage.seedEntry(activePrepared);
    storage.seedEntry(crashedPrepared);

    const recentRestart = createAnnouncementImageCacheAdapter({now: () => now, storage});
    await expect(recentRestart.getUri(identity)).resolves.toMatch(/^file:\/\/\/cache\//);
    expect(storage.listEntryNamesCalls).toBe(1);
    expect(storage.temporaryDownloadFileNames()).toEqual([activeDownload, crashedDownload]);
    expect(storage.preparedUploadFileNames()).toEqual([activePrepared, crashedPrepared]);

    now += day;
    const dailyRestart = createAnnouncementImageCacheAdapter({
      now: () => now,
      protectedEntryNames: () => new Set([activeDownload, activePrepared]),
      storage,
    });
    await expect(dailyRestart.getUri(identity)).resolves.toMatch(/^file:\/\/\/cache\//);
    expect(storage.listEntryNamesCalls).toBe(2);
    expect(storage.temporaryDownloadFileNames()).toEqual([activeDownload]);
    expect(storage.preparedUploadFileNames()).toEqual([activePrepared]);
  });

  it('periodically persists hot-hit access time so an active cache survives restart', async () => {
    const storage = new MemoryCacheStorage();
    let now = 100;
    const cache = createAnnouncementImageCacheAdapter({now: () => now, storage});
    const identity = imageIdentity({assetId: 10});
    await cache.putBytes(identity, new Uint8Array([1, 2, 3]));

    for (let hit = 0; hit < 8 * 24 * 2; hit += 1) {
      now += 30 * 60 * 1000;
      await expect(cache.getUri(identity)).resolves.toMatch(/^file:\/\/\/cache\//);
    }
    expect(storage.metadataWriteCalls).toBeGreaterThan(1);

    const restarted = createAnnouncementImageCacheAdapter({now: () => now, storage});
    await expect(restarted.getUri(identity)).resolves.toMatch(/^file:\/\/\/cache\//);
  });
});

const day = 24 * 60 * 60 * 1000;
const megabyte = 1024 * 1024;

function imageIdentity(overrides: Partial<{assetId: number; namespace: string; sha256: string}> = {}) {
  return {
    assetId: overrides.assetId ?? 1,
    namespace: overrides.namespace ?? 'account-42',
    sha256: overrides.sha256 ?? 'a'.repeat(64),
    variant: 'thumbnail' as const,
  };
}

type StoredValue = {actualSize: number; bytes?: Uint8Array; text?: string};

class MemoryCacheStorage implements AnnouncementImageCacheStorage {
  private readonly values = new Map<string, StoredValue>();
  private readonly failedDeletionAssetIds = new Set<number>();
  private readonly failedDeletionNames = new Set<string>();
  listEntryNamesCalls = 0;
  metadataWriteCalls = 0;

  async deleteEntry(name: string) {
    if (this.failedDeletionNames.has(name)) throw new Error('simulated delete failure');
    if ([...this.failedDeletionAssetIds].some((assetId) => name.includes(`--${assetId}--`))) {
      throw new Error('simulated delete failure');
    }
    this.values.delete(name);
  }

  async ensureDirectory() {}

  async fileInfo(name: string) {
    const value = this.values.get(name);
    return {
      exists: Boolean(value),
      sizeBytes: value?.actualSize ?? 0,
      uri: `file:///cache/faithlog-announcement-images-v1/${name}`,
    };
  }

  async listEntryNames() {
    this.listEntryNamesCalls += 1;
    return [...this.values.keys()];
  }

  async readText(name: string) {
    const value = this.values.get(name);
    if (!value || value.text === undefined) throw new Error('missing text file');
    return value.text;
  }

  async writeBytes(name: string, bytes: Uint8Array) {
    this.values.set(name, {actualSize: bytes.byteLength, bytes: bytes.slice()});
  }

  async writeTextAtomically(name: string, temporaryName: string, text: string) {
    if (name.endsWith('.json')) this.metadataWriteCalls += 1;
    this.values.set(temporaryName, {actualSize: text.length, text});
    this.values.set(name, {actualSize: text.length, text});
    this.values.delete(temporaryName);
  }

  corruptActualSize(assetId: number, sizeBytes: number) {
    const [name] = this.dataFileNames().filter((candidate) => candidate.includes(`--${assetId}--`));
    if (!name) throw new Error('missing data file');
    const value = this.values.get(name);
    if (!value) throw new Error('missing data file');
    value.actualSize = sizeBytes;
  }

  corruptMetadata(text: string) {
    const name = this.metadataFileName();
    this.values.set(name, {actualSize: text.length, text});
  }

  dataFileNames() {
    return [...this.values.keys()].filter((name) => name.endsWith('.image-cache')).sort();
  }

  temporaryDownloadFileNames() {
    return [...this.values.keys()].filter((name) => name.endsWith('.image-download')).sort();
  }

  preparedUploadFileNames() {
    return [...this.values.keys()].filter((name) => name.endsWith('.image-upload')).sort();
  }

  seedEntry(name: string) {
    this.values.set(name, {actualSize: 1, bytes: new Uint8Array([1])});
  }

  failDeletionForName(name: string) {
    this.failedDeletionNames.add(name);
  }

  allowDeletionForName(name: string) {
    this.failedDeletionNames.delete(name);
  }

  failDeletionForAsset(assetId: number) {
    this.failedDeletionAssetIds.add(assetId);
  }

  allowDeletionForAsset(assetId: number) {
    this.failedDeletionAssetIds.delete(assetId);
  }

  readMetadata(): {entries: Array<{key: string; lastAccessedAt: number; namespace: string; sizeBytes: number}>; version: number} {
    return JSON.parse(this.values.get(this.metadataFileName())?.text ?? '') as ReturnType<MemoryCacheStorage['readMetadata']>;
  }

  setStoredSize(assetId: number, sizeBytes: number) {
    this.corruptActualSize(assetId, sizeBytes);
    const metadata = this.readMetadata();
    const entry = metadata.entries.find((candidate) => candidate.key.includes(`/${assetId}/`));
    if (!entry) throw new Error('missing metadata entry');
    entry.sizeBytes = sizeBytes;
    const text = JSON.stringify(metadata);
    this.values.set(this.metadataFileName(), {actualSize: text.length, text});
  }

  setMetadataAccess(assetId: number, lastAccessedAt: number) {
    const metadata = this.readMetadata();
    const entry = metadata.entries.find((candidate) => candidate.key.includes(`/${assetId}/`));
    if (!entry) throw new Error('missing metadata entry');
    entry.lastAccessedAt = lastAccessedAt;
    const text = JSON.stringify(metadata);
    this.values.set(this.metadataFileName(), {actualSize: text.length, text});
  }

  private metadataFileName() {
    const name = [...this.values.keys()].find((candidate) => candidate.endsWith('.json'));
    if (!name) throw new Error('missing metadata file');
    return name;
  }
}
