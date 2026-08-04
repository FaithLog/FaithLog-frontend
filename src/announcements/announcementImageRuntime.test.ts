import {describe, expect, it, vi} from 'vitest';

import {
  buildAnnouncementImageCacheNamespace,
  createAnnouncementImageDownloadGuard,
  createAnnouncementImageRuntime,
} from './announcementImageRuntime';
import {createAnnouncementImageTemporaryFileRegistry} from './announcementImageTemporaryFiles';

describe('announcement image runtime resolver', () => {
  it('builds a strict account and campus cache namespace', () => {
    expect(buildAnnouncementImageCacheNamespace({campusId: 9, userId: 42})).toBe(
      'account-42-campus-9',
    );
    expect(() => buildAnnouncementImageCacheNamespace({campusId: Number.NaN, userId: 42})).toThrow();
    expect(() => buildAnnouncementImageCacheNamespace({campusId: 9, userId: 1.5})).toThrow();
  });

  it('returns an existing immutable-asset cache hit without downloading again', async () => {
    const dependencies = runtimeDependencies();
    dependencies.cache.getUriForAsset.mockResolvedValue('file:///cached-thumbnail');
    const runtime = createAnnouncementImageRuntime(dependencies);

    await expect(runtime.resolveAnnouncementImageSource(sourceInput())).resolves.toBe(
      'file:///cached-thumbnail',
    );
    expect(dependencies.cache.getUriForAsset).toHaveBeenCalledWith({
      assetId: 7,
      namespace: 'account-42-campus-9',
      variant: 'thumbnail',
    });
    expect(dependencies.downloadBytes).not.toHaveBeenCalled();
  });

  it('bypasses a cached URI on rendered image retry and replaces it from the signed URL', async () => {
    const dependencies = runtimeDependencies();
    dependencies.cache.getUriForAsset.mockResolvedValue('file:///cached-corrupt-thumbnail');
    dependencies.cache.putBytes.mockResolvedValue('file:///cached-refreshed-thumbnail');
    const runtime = createAnnouncementImageRuntime(dependencies);

    await expect(runtime.resolveAnnouncementImageSource({
      ...sourceInput(),
      bypassCache: true,
    })).resolves.toBe('file:///cached-refreshed-thumbnail');
    expect(dependencies.cache.getUriForAsset).not.toHaveBeenCalled();
    expect(dependencies.downloadBytes).toHaveBeenCalledTimes(1);
    expect(dependencies.cache.putBytes).toHaveBeenCalledTimes(1);
  });

  it('downloads, validates, hashes, and stores a cache miss under the strict identity', async () => {
    const dependencies = runtimeDependencies();
    const bytes = new Uint8Array([1, 2, 3]);
    dependencies.downloadBytes.mockResolvedValue(bytes);
    dependencies.sha256.mockResolvedValue('b'.repeat(64));
    dependencies.cache.putBytes.mockResolvedValue('file:///cached-downloaded-thumbnail');
    const runtime = createAnnouncementImageRuntime(dependencies);
    const signal = new AbortController().signal;

    await expect(runtime.resolveAnnouncementImageSource({
      ...sourceInput(),
      signal,
    })).resolves.toBe('file:///cached-downloaded-thumbnail');
    expect(dependencies.downloadBytes).toHaveBeenCalledWith(
      'https://signed.example/thumbnail',
      expect.objectContaining({aborted: false}),
      'account-42-campus-9',
    );
    expect(dependencies.sha256).toHaveBeenCalledWith(bytes);
    expect(dependencies.cache.putBytes).toHaveBeenCalledWith({
      assetId: 7,
      namespace: 'account-42-campus-9',
      sha256: 'b'.repeat(64),
      variant: 'thumbnail',
    }, bytes);
  });

  it.each([
    ['empty', new Uint8Array(0)],
    ['fractional', {byteLength: 1.5}],
    ['infinite', {byteLength: Number.POSITIVE_INFINITY}],
  ])('fails closed for %s downloaded bytes instead of bypassing finite validation', async (_label, bytes) => {
    const dependencies = runtimeDependencies();
    dependencies.downloadBytes.mockResolvedValue(bytes as Uint8Array);
    const runtime = createAnnouncementImageRuntime(dependencies);

    await expect(runtime.resolveAnnouncementImageSource(sourceInput()))
      .rejects.toMatchObject({name: 'AnnouncementImagePolicyError'});
    expect(dependencies.sha256).not.toHaveBeenCalled();
    expect(dependencies.cache.putBytes).not.toHaveBeenCalled();
  });

  it('fails closed instead of handing an oversized signed URL to the native Image loader', async () => {
    const dependencies = runtimeDependencies();
    dependencies.downloadBytes.mockResolvedValue({
      byteLength: 5 * 1024 * 1024 + 1,
    } as Uint8Array);
    const runtime = createAnnouncementImageRuntime(dependencies);

    await expect(runtime.resolveAnnouncementImageSource(sourceInput()))
      .rejects.toMatchObject({name: 'AnnouncementImagePolicyError'});
    expect(dependencies.sha256).not.toHaveBeenCalled();
    expect(dependencies.cache.putBytes).not.toHaveBeenCalled();
  });

  it('fails open to the signed URL when cache, download, digest, or persistence fails', async () => {
    for (const configure of [
      (dependencies: ReturnType<typeof runtimeDependencies>) => dependencies.cache.getUriForAsset.mockRejectedValue(new Error('cache read failed')),
      (dependencies: ReturnType<typeof runtimeDependencies>) => dependencies.downloadBytes.mockRejectedValue(new Error('download failed')),
      (dependencies: ReturnType<typeof runtimeDependencies>) => dependencies.sha256.mockResolvedValue('invalid'),
      (dependencies: ReturnType<typeof runtimeDependencies>) => dependencies.cache.putBytes.mockRejectedValue(new Error('cache write failed')),
    ]) {
      const dependencies = runtimeDependencies();
      configure(dependencies);
      const runtime = createAnnouncementImageRuntime(dependencies);
      await expect(runtime.resolveAnnouncementImageSource(sourceInput())).resolves.toBe(
        'https://signed.example/thumbnail',
      );
    }
  });

  it('clears every discoverable campus namespace for a user by account prefix', async () => {
    const dependencies = runtimeDependencies();
    const runtime = createAnnouncementImageRuntime(dependencies);

    await expect(runtime.clearAnnouncementImageCacheForUser(42)).resolves.toBeUndefined();
    expect(dependencies.cache.clearNamespacePrefix).toHaveBeenCalledWith('account-42-campus-');
  });

  it('surfaces explicit logout cleanup failure to the local cleanup barrier', async () => {
    const dependencies = runtimeDependencies();
    dependencies.cache.clearNamespacePrefix.mockRejectedValueOnce(new Error('delete failed'));
    const runtime = createAnnouncementImageRuntime(dependencies);

    await expect(runtime.clearAnnouncementImageCacheForUser(42)).rejects.toThrow('delete failed');
  });

  it('does not resurrect a previous account cache after logout cleanup wins a delayed download race', async () => {
    const dependencies = runtimeDependencies();
    const download = deferred<Uint8Array>();
    dependencies.downloadBytes.mockReturnValue(download.promise);
    const runtime = createAnnouncementImageRuntime(dependencies);

    const resolving = runtime.resolveAnnouncementImageSource(sourceInput());
    await Promise.resolve();
    const cleanup = runtime.clearAnnouncementImageCacheForUser(42);
    await Promise.resolve();
    expect((dependencies.downloadBytes.mock.calls[0]?.[1] as AbortSignal).aborted).toBe(true);
    expect(dependencies.cache.clearNamespacePrefix).not.toHaveBeenCalled();
    download.resolve(new Uint8Array([1, 2, 3]));
    await cleanup;

    await expect(resolving).resolves.toBe('https://signed.example/thumbnail');
    expect(dependencies.sha256).not.toHaveBeenCalled();
    expect(dependencies.cache.putBytes).not.toHaveBeenCalled();
  });

  it('does not resurrect any cache after capability-wide cleanup wins a delayed download race', async () => {
    const dependencies = runtimeDependencies();
    const download = deferred<Uint8Array>();
    dependencies.downloadBytes.mockReturnValue(download.promise);
    const runtime = createAnnouncementImageRuntime(dependencies);

    const resolving = runtime.resolveAnnouncementImageSource(sourceInput());
    await Promise.resolve();
    const cleanup = runtime.clearAllAnnouncementImageCaches();
    await Promise.resolve();
    expect((dependencies.downloadBytes.mock.calls[0]?.[1] as AbortSignal).aborted).toBe(true);
    expect(dependencies.cache.clearAll).not.toHaveBeenCalled();
    download.resolve(new Uint8Array([1, 2, 3]));
    await cleanup;

    await expect(resolving).resolves.toBe('https://signed.example/thumbnail');
    expect(dependencies.cache.clearAll).toHaveBeenCalledTimes(1);
    expect(dependencies.sha256).not.toHaveBeenCalled();
    expect(dependencies.cache.putBytes).not.toHaveBeenCalled();
  });

  it('waits for active preparation and releases draft protection before strict logout cleanup', async () => {
    const dependencies = runtimeDependencies();
    const temporaryFiles = createAnnouncementImageTemporaryFileRegistry();
    const session = temporaryFiles.createPreparedSession();
    const preparation = temporaryFiles.beginPreparedOperation(session);
    temporaryFiles.protectPreparedFile(
      'file:///cache/prepared-active.image-upload',
      'prepared-active.image-upload',
    );
    const runtime = createAnnouncementImageRuntime({...dependencies, temporaryFiles});

    const cleanup = runtime.clearAnnouncementImageCacheForUser(42);
    await Promise.resolve();
    expect(() => preparation.assertValid()).toThrow('invalidated');
    expect(dependencies.cache.clearNamespacePrefix).not.toHaveBeenCalled();

    preparation.finish();
    await cleanup;
    expect(dependencies.cache.clearNamespacePrefix).toHaveBeenCalledWith('account-42-campus-');
    expect(temporaryFiles.getProtectedEntryNames()).toEqual(new Set());
  });

  it('aborts an Expo download as soon as finite progress exceeds 5 MiB', () => {
    const guard = createAnnouncementImageDownloadGuard();

    guard.onProgress({bytesWritten: 5 * 1024 * 1024 + 1, totalBytes: -1});

    expect(guard.signal.aborted).toBe(true);
    expect(() => guard.assertValid()).toThrow('byte size');
    guard.dispose();
  });

  it('preserves an oversize policy error when temporary-file cleanup also throws', async () => {
    vi.doMock('expo-file-system', () => {
      class TestDirectory {
        create() {}
      }
      class TestFile {
        static async downloadFileAsync(
          _url: string,
          _destination: TestFile,
          options: {onProgress: (progress: {bytesWritten: number; totalBytes: number}) => void},
        ) {
          options.onProgress({bytesWritten: 5 * 1024 * 1024 + 1, totalBytes: -1});
          throw new Error('native download aborted');
        }

        get exists() {
          throw new Error('temporary cleanup failed');
        }
      }
      return {Directory: TestDirectory, File: TestFile, Paths: {cache: 'cache'}};
    });
    const dependencies = runtimeDependencies();
    const runtime = createAnnouncementImageRuntime({
      cache: dependencies.cache,
      sha256: dependencies.sha256,
    });

    try {
      await expect(runtime.resolveAnnouncementImageSource(sourceInput()))
        .rejects.toMatchObject({name: 'AnnouncementImagePolicyError'});
    } finally {
      vi.doUnmock('expo-file-system');
    }
  });
});

function sourceInput() {
  return {
    assetId: 7,
    campusId: 9,
    signedUrl: 'https://signed.example/thumbnail',
    userId: 42,
    variant: 'thumbnail' as const,
  };
}

function runtimeDependencies() {
  return {
    cache: {
      clearAll: vi.fn().mockResolvedValue({deleteKeys: [], keepKeys: []}),
      clearNamespacePrefix: vi.fn().mockResolvedValue({deleteKeys: [], keepKeys: []}),
      getUriForAsset: vi.fn().mockResolvedValue(null),
      putBytes: vi.fn().mockResolvedValue('file:///cached-thumbnail'),
    },
    downloadBytes: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    sha256: vi.fn().mockResolvedValue('a'.repeat(64)),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}
