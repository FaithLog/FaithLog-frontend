import {describe, expect, it, vi} from 'vitest';

import {saveAndShareAdminWeeklyDevotionExport} from './adminWeeklyDevotionFile';

const EXPORTED = {
  bytes: new Uint8Array([80, 75, 3, 4]),
  fileName: 'faithlog-devotion-1-2026-07-13.xlsx',
};

const SECOND_EXPORT = {
  bytes: new Uint8Array([80, 75, 9, 9]),
  fileName: EXPORTED.fileName,
};

describe('saveAndShareAdminWeeklyDevotionExport', () => {
  it('deletes its exact temporary file and directory after successful sharing', async () => {
    const harness = createHarness();

    await expect(
      saveAndShareAdminWeeklyDevotionExport(EXPORTED, harness.dependencies),
    ).resolves.toBeUndefined();

    expect(harness.share).toHaveBeenCalledWith(
      `file:///cache/test-operation/${EXPORTED.fileName}`,
      expect.any(Object),
    );
    expect(harness.createDirectory).toHaveBeenCalledWith('test-operation');
    expect(harness.directoryCreateOptions).toEqual([
      {idempotent: false, intermediates: false, overwrite: false},
    ]);
    expect(harness.fileCreateOptions).toEqual([{overwrite: false}]);
    expect(harness.fileDeleteUris).toEqual([
      `file:///cache/test-operation/${EXPORTED.fileName}`,
    ]);
    expect(harness.directoryDeleteIds).toEqual(['test-operation']);
  });

  it('deletes the temporary workspace when sharing rejects without masking that error', async () => {
    const shareError = new Error('share rejected');
    const harness = createHarness({shareError});

    await expect(
      saveAndShareAdminWeeklyDevotionExport(EXPORTED, harness.dependencies),
    ).rejects.toBe(shareError);
    expect(harness.fileDeleteUris).toHaveLength(1);
    expect(harness.directoryDeleteIds).toEqual(['test-operation']);
  });

  it.each(['create', 'write'] as const)(
    'attempts owned partial-workspace cleanup when file %s fails',
    async (failurePoint) => {
      const operationError = new Error(`${failurePoint} failed`);
      const harness = createHarness({failurePoint, operationError});

      await expect(
        saveAndShareAdminWeeklyDevotionExport(EXPORTED, harness.dependencies),
      ).rejects.toBe(operationError);
      expect(harness.fileDeleteUris).toHaveLength(1);
      expect(harness.directoryDeleteIds).toEqual(['test-operation']);
      expect(harness.share).not.toHaveBeenCalled();
      expect(harness.storage).toHaveLength(0);
    },
  );

  it('does not turn a successful share into failure when best-effort cleanup fails', async () => {
    const observeCleanupFailure = vi.fn();
    const harness = createHarness({fileDeleteFailureIdentities: ['test-operation']});

    await expect(
      saveAndShareAdminWeeklyDevotionExport(EXPORTED, {
        ...harness.dependencies,
        observeCleanupFailure,
      }),
    ).resolves.toBeUndefined();
    expect(observeCleanupFailure).toHaveBeenCalledOnce();
    expect(observeCleanupFailure).toHaveBeenCalledWith();
    expect(harness.directoryDeleteIds).toEqual(['test-operation']);
    expect(harness.storage).toHaveLength(0);
  });

  it('isolates simultaneous exports that receive the same server file name', async () => {
    const firstShare = deferred<void>();
    const harness = createHarness({identities: ['operation-a', 'operation-b']});
    harness.share.mockImplementation(async (uri) => {
      harness.shareSnapshots.push({
        bytes: harness.read(uri),
        uri,
      });
      if (uri.includes('operation-a')) {
        await firstShare.promise;
      }
    });

    const firstResult = saveAndShareAdminWeeklyDevotionExport(
      EXPORTED,
      harness.dependencies,
    );
    await vi.waitFor(() => expect(harness.share).toHaveBeenCalledOnce());

    const secondResult = saveAndShareAdminWeeklyDevotionExport(
      SECOND_EXPORT,
      harness.dependencies,
    );
    await expect(secondResult).resolves.toBeUndefined();

    const firstUri = harness.share.mock.calls[0]?.[0];
    const secondUri = harness.share.mock.calls[1]?.[0];
    expect(firstUri).toBe(`file:///cache/operation-a/${EXPORTED.fileName}`);
    expect(secondUri).toBe(`file:///cache/operation-b/${EXPORTED.fileName}`);
    expect(firstUri).not.toBe(secondUri);
    expect(harness.read(firstUri!)).toEqual(EXPORTED.bytes);

    firstShare.resolve();
    await expect(firstResult).resolves.toBeUndefined();

    expect(harness.shareSnapshots).toEqual([
      {bytes: EXPORTED.bytes, uri: firstUri},
      {bytes: SECOND_EXPORT.bytes, uri: secondUri},
    ]);
    expect(harness.fileDeleteUris).toEqual([secondUri, firstUri]);
    expect(harness.directoryDeleteIds).toEqual(['operation-b', 'operation-a']);
  });

  it('keeps another export isolated when one share rejects', async () => {
    const firstShare = deferred<void>();
    const shareError = new Error('first share rejected');
    const harness = createHarness({identities: ['operation-a', 'operation-b']});
    harness.share.mockImplementation(async (uri) => {
      if (uri.includes('operation-a')) {
        await firstShare.promise;
      }
    });

    const firstResult = saveAndShareAdminWeeklyDevotionExport(
      EXPORTED,
      harness.dependencies,
    );
    await vi.waitFor(() => expect(harness.share).toHaveBeenCalledOnce());
    const secondResult = saveAndShareAdminWeeklyDevotionExport(
      SECOND_EXPORT,
      harness.dependencies,
    );

    await expect(secondResult).resolves.toBeUndefined();
    firstShare.reject(shareError);
    await expect(firstResult).rejects.toBe(shareError);

    expect(harness.fileDeleteUris).toEqual([
      `file:///cache/operation-b/${EXPORTED.fileName}`,
      `file:///cache/operation-a/${EXPORTED.fileName}`,
    ]);
    expect(harness.directoryDeleteIds).toEqual(['operation-b', 'operation-a']);
  });

  it('keeps another export isolated when one file cleanup fails', async () => {
    const firstShare = deferred<void>();
    const observeCleanupFailure = vi.fn();
    const harness = createHarness({
      fileDeleteFailureIdentities: ['operation-a'],
      identities: ['operation-a', 'operation-b'],
    });
    const dependencies = {...harness.dependencies, observeCleanupFailure};
    harness.share.mockImplementation(async (uri) => {
      if (uri.includes('operation-a')) {
        await firstShare.promise;
      }
    });

    const firstResult = saveAndShareAdminWeeklyDevotionExport(EXPORTED, dependencies);
    await vi.waitFor(() => expect(harness.share).toHaveBeenCalledOnce());
    const secondResult = saveAndShareAdminWeeklyDevotionExport(
      SECOND_EXPORT,
      dependencies,
    );

    await expect(secondResult).resolves.toBeUndefined();
    firstShare.resolve();
    await expect(firstResult).resolves.toBeUndefined();

    expect(observeCleanupFailure).toHaveBeenCalledOnce();
    expect(harness.directoryDeleteIds).toEqual(['operation-b', 'operation-a']);
    expect(harness.storage).toHaveLength(0);
  });

  it('fails closed on a unique-workspace collision without overwriting or deleting it', async () => {
    const collisionError = new Error('workspace already exists');
    const harness = createHarness({
      collisionError,
      existingIdentities: ['collision'],
      identities: ['collision'],
    });
    const existingUri = `file:///cache/collision/${EXPORTED.fileName}`;
    const existingBytes = new Uint8Array([1, 2, 3]);
    harness.seed(existingUri, existingBytes);

    await expect(
      saveAndShareAdminWeeklyDevotionExport(EXPORTED, harness.dependencies),
    ).rejects.toBe(collisionError);

    expect(harness.read(existingUri)).toEqual(existingBytes);
    expect(harness.fileDeleteUris).toHaveLength(0);
    expect(harness.directoryDeleteIds).toHaveLength(0);
    expect(harness.share).not.toHaveBeenCalled();
  });

  it('rejects unsafe file names before creating a cache workspace', async () => {
    const harness = createHarness();

    await expect(
      saveAndShareAdminWeeklyDevotionExport(
        {...EXPORTED, fileName: '../private.xlsx'},
        harness.dependencies,
      ),
    ).rejects.toThrow('파일 이름');
    expect(harness.createDirectory).not.toHaveBeenCalled();
    expect(harness.legacyCreateFile).not.toHaveBeenCalled();
  });
});

function createHarness({
  collisionError = new Error('workspace collision'),
  existingIdentities = [],
  failurePoint,
  fileDeleteFailureIdentities = [],
  identities = ['test-operation'],
  operationError = new Error('operation failed'),
  shareError,
}: {
  collisionError?: Error;
  existingIdentities?: string[];
  failurePoint?: 'create' | 'write';
  fileDeleteFailureIdentities?: string[];
  identities?: string[];
  operationError?: Error;
  shareError?: Error;
} = {}) {
  const activeDirectories = new Set(existingIdentities);
  const directoryCreateOptions: Array<{
    idempotent: boolean;
    intermediates: boolean;
    overwrite: boolean;
  }> = [];
  const directoryDeleteIds: string[] = [];
  const fileCreateOptions: Array<{overwrite: boolean}> = [];
  const fileDeleteFailures = new Set(fileDeleteFailureIdentities);
  const fileDeleteUris: string[] = [];
  const storage = new Map<string, Uint8Array>();
  const shareSnapshots: Array<{bytes: Uint8Array | undefined; uri: string}> = [];
  let identityIndex = 0;

  const createStorageIdentity = vi.fn(() => {
    const identity = identities[identityIndex];
    identityIndex += 1;
    return identity ?? `test-operation-${identityIndex}`;
  });
  const createDirectory = vi.fn((identity: string) => ({
    create: vi.fn((options: {
      idempotent: boolean;
      intermediates: boolean;
      overwrite: boolean;
    }) => {
      directoryCreateOptions.push(options);
      if (activeDirectories.has(identity)) {
        throw collisionError;
      }
      activeDirectories.add(identity);
    }),
    createFile: vi.fn((fileName: string) => {
      const uri = `file:///cache/${identity}/${fileName}`;
      return {
        create: vi.fn((options: {overwrite: boolean}) => {
          fileCreateOptions.push(options);
          if (!options.overwrite && storage.has(uri)) {
            throw collisionError;
          }
          storage.set(uri, new Uint8Array());
          if (failurePoint === 'create') {
            throw operationError;
          }
        }),
        delete: vi.fn(() => {
          fileDeleteUris.push(uri);
          if (fileDeleteFailures.has(identity)) {
            throw new Error('file cleanup failed');
          }
          storage.delete(uri);
        }),
        uri,
        write: vi.fn((bytes: Uint8Array) => {
          storage.set(uri, new Uint8Array(bytes));
          if (failurePoint === 'write') {
            throw operationError;
          }
        }),
      };
    }),
    delete: vi.fn(() => {
      directoryDeleteIds.push(identity);
      activeDirectories.delete(identity);
      const prefix = `file:///cache/${identity}/`;
      for (const uri of storage.keys()) {
        if (uri.startsWith(prefix)) {
          storage.delete(uri);
        }
      }
    }),
  }));

  // The legacy primitive deliberately points every operation at one path. It keeps
  // this RED test executable against the pre-fix implementation.
  const legacyUri = `file:///cache/${EXPORTED.fileName}`;
  const legacyCreateFile = vi.fn(() => ({
    create: vi.fn((options: {overwrite: boolean}) => {
      fileCreateOptions.push(options);
      storage.set(legacyUri, new Uint8Array());
      if (failurePoint === 'create') {
        throw operationError;
      }
    }),
    delete: vi.fn(() => {
      fileDeleteUris.push(legacyUri);
      storage.delete(legacyUri);
    }),
    uri: legacyUri,
    write: vi.fn((bytes: Uint8Array) => {
      storage.set(legacyUri, new Uint8Array(bytes));
      if (failurePoint === 'write') {
        throw operationError;
      }
    }),
  }));
  const share = vi.fn(async (_uri: string, _options: unknown) => {
    if (shareError) {
      throw shareError;
    }
  });

  return {
    createDirectory,
    dependencies: {
      createDirectory,
      createFile: legacyCreateFile,
      createStorageIdentity,
      isSharingAvailable: async () => true,
      observeCleanupFailure: vi.fn(),
      share,
    },
    directoryCreateOptions,
    directoryDeleteIds,
    fileCreateOptions,
    fileDeleteUris,
    legacyCreateFile,
    read: (uri: string) => storage.get(uri),
    seed: (uri: string, bytes: Uint8Array) => storage.set(uri, new Uint8Array(bytes)),
    share,
    shareSnapshots,
    storage: {
      get length() {
        return storage.size;
      },
    },
  };
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, reject, resolve};
}
