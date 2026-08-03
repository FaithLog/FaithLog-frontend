import {
  buildImageCacheKey,
  planImageCacheCleanup,
  planImageCacheNamespaceCleanup,
  type ImageCacheMetadata,
  type ImageCacheVariant,
} from './announcementImageCache';
import {ANNOUNCEMENT_IMAGE_CACHE_DIRECTORY_NAME} from './announcementImageTemporaryFiles';

export type AnnouncementImageCacheIdentity = {
  assetId: number;
  namespace: string;
  sha256: string;
  variant: ImageCacheVariant;
};

export type AnnouncementImageCacheAssetIdentity = Omit<AnnouncementImageCacheIdentity, 'sha256'>;

export type AnnouncementImageCacheFileInfo = {
  exists: boolean;
  sizeBytes: number;
  uri: string;
};

export type AnnouncementImageCacheStorage = {
  deleteEntry(name: string): Promise<void>;
  ensureDirectory(): Promise<void>;
  fileInfo(name: string): Promise<AnnouncementImageCacheFileInfo>;
  listEntryNames(): Promise<string[]>;
  readText(name: string): Promise<string>;
  writeBytes(name: string, bytes: Uint8Array): Promise<void>;
  writeTextAtomically(name: string, temporaryName: string, text: string): Promise<void>;
};

export type AnnouncementImageCacheAdapter = {
  cleanup(): Promise<{deleteKeys: string[]; keepKeys: string[]}>;
  clearAll(): Promise<{deleteKeys: string[]; keepKeys: string[]}>;
  clearNamespace(namespace: string): Promise<{deleteKeys: string[]; keepKeys: string[]}>;
  clearNamespacePrefix(namespacePrefix: string): Promise<{deleteKeys: string[]; keepKeys: string[]}>;
  getUri(identity: AnnouncementImageCacheIdentity): Promise<string | null>;
  getUriForAsset(identity: AnnouncementImageCacheAssetIdentity): Promise<string | null>;
  putBytes(identity: AnnouncementImageCacheIdentity, bytes: Uint8Array): Promise<string>;
};

type Dependencies = {
  now?: () => number;
  protectedEntryNames?: () => ReadonlySet<string>;
  storage?: AnnouncementImageCacheStorage;
};

type MetadataDocument = {
  entries: ImageCacheMetadata[];
  version: 1;
};

const metadataFileName = 'announcement-image-cache-metadata-v1.json';
const temporaryMetadataFileName = 'announcement-image-cache-metadata-v1.tmp';
const maintenanceFileName = 'announcement-image-cache-maintenance-v1.txt';
const temporaryMaintenanceFileName = 'announcement-image-cache-maintenance-v1.tmp';
const metadataVersion = 1;
const maximumMetadataBytes = 1024 * 1024;
const maximumMetadataEntries = 2048;
const maximumCacheBytes = 200 * 1024 * 1024;
const accessTimestampPersistIntervalMs = 60 * 60 * 1000;
// Crash-orphaned `.image-download` and `.image-upload` files are reclaimed by
// this bounded daily reconciliation (so a valid recent marker permits at most
// a 24-hour orphan window). Explicit logout/capability cleanup remains strict
// and attempts deletion immediately instead of waiting for this window.
const reconciliationIntervalMs = 24 * 60 * 60 * 1000;
const cacheKeyPattern = /^announcement-images\/v1\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/([1-9][0-9]*)\/([a-f0-9]{64})\/(detail|thumbnail)$/;
const accountNamespacePrefixPattern = /^account-[1-9][0-9]*-campus-$/;

export function createAnnouncementImageCacheAdapter(
  dependencies: Dependencies = {},
): AnnouncementImageCacheAdapter {
  const storagePromise = dependencies.storage
    ? Promise.resolve(dependencies.storage)
    : createExpoFileSystemStorage();
  const currentTime = dependencies.now ?? Date.now;
  const getProtectedEntryNames = dependencies.protectedEntryNames ?? (() => new Set<string>());
  let operationQueue = Promise.resolve();
  let memoryEntries: ImageCacheMetadata[] | null = null;
  let persistedAccessTimes = new Map<string, number>();

  const runExclusive = <T>(operation: () => Promise<T>) => {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  const persist = async (
    storage: AnnouncementImageCacheStorage,
    entries: readonly ImageCacheMetadata[],
  ) => {
    await saveMetadata(storage, entries);
    persistedAccessTimes = new Map(entries.map((entry) => [entry.key, entry.lastAccessedAt]));
  };
  const prepare = async (
    storage: AnnouncementImageCacheStorage,
    now: number,
    forceReconcile = false,
  ) => {
    if (memoryEntries === null || forceReconcile) {
      const recentAccessTimes = memoryEntries === null
        ? undefined
        : new Map(memoryEntries.map((entry) => [entry.key, entry.lastAccessedAt]));
      const prepared = await prepareCache(
        storage,
        now,
        recentAccessTimes,
        forceReconcile,
        getProtectedEntryNames(),
      );
      memoryEntries = prepared.entries;
      persistedAccessTimes = new Map(
        prepared.entries.map((entry) => [entry.key, entry.lastAccessedAt]),
      );
      return prepared;
    }
    const planned = await applyPlans(storage, memoryEntries, now);
    const limited = await enforceMetadataEntryLimit(storage, planned.entries);
    memoryEntries = limited.entries;
    return {
      deleteKeys: unique([...planned.deleteKeys, ...limited.deleteKeys]),
      entries: limited.entries,
      requiresPersist: planned.deleteKeys.length > 0 || limited.deleteKeys.length > 0,
    };
  };

  return {
    cleanup: () => runExclusive(async () => {
      const storage = await storagePromise;
      const prepared = await prepare(storage, safeNow(currentTime()), true);
      memoryEntries = prepared.entries;
      await persist(storage, prepared.entries);
      return {deleteKeys: prepared.deleteKeys, keepKeys: prepared.entries.map((entry) => entry.key)};
    }),

    clearAll: () => runExclusive(async () => {
      const storage = await storagePromise;
      await storage.ensureDirectory();
      const protectedEntryNames = getProtectedEntryNames();
      const names = await storage.listEntryNames();
      assertNoProtectedExplicitCleanupTargets(names, protectedEntryNames);
      const deletion = await deleteEntryNamesStrict(storage, names);
      assertExplicitCleanupSucceeded(deletion.failedNames);
      memoryEntries = [];
      await persist(storage, []);
      return {
        deleteKeys: deletion.deletedNames,
        keepKeys: [],
      };
    }),

    clearNamespace: (namespace) => runExclusive(async () => {
      planImageCacheNamespaceCleanup([], namespace);
      const storage = await storagePromise;
      await storage.ensureDirectory();
      const protectedEntryNames = getProtectedEntryNames();
      const names = await storage.listEntryNames();
      const targets = names.filter((name) =>
        (name.startsWith(`${namespace}--`) &&
          (name.endsWith('.image-cache') || name.endsWith('.image-download'))) ||
        name.endsWith('.image-upload'));
      assertNoProtectedExplicitCleanupTargets(targets, protectedEntryNames);
      const deletion = await deleteEntryNamesStrict(
        storage,
        targets,
      );
      assertExplicitCleanupSucceeded(deletion.failedNames);
      const prepared = await prepare(storage, safeNow(currentTime()), true);
      memoryEntries = prepared.entries;
      await persist(storage, prepared.entries);
      return {
        deleteKeys: prepared.deleteKeys,
        keepKeys: prepared.entries.map((entry) => entry.key),
      };
    }),

    clearNamespacePrefix: (namespacePrefix) => runExclusive(async () => {
      if (!accountNamespacePrefixPattern.test(namespacePrefix)) {
        throw new TypeError('Invalid account cache namespace prefix');
      }
      const storage = await storagePromise;
      await storage.ensureDirectory();
      const protectedEntryNames = getProtectedEntryNames();
      const names = await storage.listEntryNames();
      const targets = names.filter((name) =>
        (name.startsWith(namespacePrefix) &&
          (name.endsWith('.image-cache') || name.endsWith('.image-download'))) ||
        name.endsWith('.image-upload'));
      assertNoProtectedExplicitCleanupTargets(targets, protectedEntryNames);
      // Delete by on-disk namespace first, before TTL/LRU reconciliation can
      // classify a target as stale and accidentally swallow a deletion failure.
      const deletion = await deleteEntryNamesStrict(
        storage,
        targets,
      );
      assertExplicitCleanupSucceeded(deletion.failedNames);
      const prepared = await prepare(storage, safeNow(currentTime()), true);
      memoryEntries = prepared.entries;
      await persist(storage, prepared.entries);
      return {
        deleteKeys: prepared.deleteKeys,
        keepKeys: prepared.entries.map((entry) => entry.key),
      };
    }),

    getUri: (identity) => runExclusive(async () => {
      const storage = await storagePromise;
      const now = safeNow(currentTime());
      const key = buildImageCacheKey(identity);
      const prepared = await prepare(storage, now);
      const hit = prepared.entries.find((entry) => entry.key === key);
      if (!hit) {
        if (prepared.requiresPersist) await persist(storage, prepared.entries);
        return null;
      }

      const info = await storage.fileInfo(fileNameForKey(key));
      if (!info.exists || info.sizeBytes !== hit.sizeBytes) {
        await safelyDelete(storage, fileNameForKey(key));
        const entries = prepared.entries.filter((entry) => entry.key !== key);
        memoryEntries = entries;
        await persist(storage, entries);
        return null;
      }

      const entries = prepared.entries.map((entry) => entry.key === key
        ? {...entry, lastAccessedAt: now}
        : entry);
      memoryEntries = entries;
      if (
        prepared.requiresPersist ||
        now - (persistedAccessTimes.get(key) ?? hit.lastAccessedAt) >=
          accessTimestampPersistIntervalMs
      ) {
        await persist(storage, entries);
      }
      return info.uri;
    }),

    getUriForAsset: (identity) => runExclusive(async () => {
      assertAssetIdentity(identity);
      const storage = await storagePromise;
      const now = safeNow(currentTime());
      const prepared = await prepare(storage, now);
      const matches = prepared.entries.filter((entry) => {
        const parsed = parseCacheKey(entry.key);
        return parsed?.assetId === identity.assetId &&
          parsed.namespace === identity.namespace &&
          parsed.variant === identity.variant;
      });

      if (matches.length === 0) {
        if (prepared.requiresPersist) await persist(storage, prepared.entries);
        return null;
      }

      const newestAccess = Math.max(...matches.map((entry) => entry.lastAccessedAt));
      const newest = matches.filter((entry) => entry.lastAccessedAt === newestAccess);
      if (newest.length !== 1) {
        const ambiguousKeys = matches.map((entry) => entry.key);
        await deleteKeys(storage, prepared.entries, ambiguousKeys);
        await persist(
          storage,
          prepared.entries.filter((entry) => !ambiguousKeys.includes(entry.key)),
        );
        memoryEntries = prepared.entries.filter((entry) => !ambiguousKeys.includes(entry.key));
        return null;
      }

      const selected = newest[0];
      if (!selected) return null;
      const staleKeys = matches
        .filter((entry) => entry.key !== selected.key)
        .map((entry) => entry.key);
      await deleteKeys(storage, prepared.entries, staleKeys);
      const entries = prepared.entries
        .filter((entry) => !staleKeys.includes(entry.key))
        .map((entry) => entry.key === selected.key
          ? {...entry, lastAccessedAt: now}
          : entry);
      const info = await storage.fileInfo(fileNameForKey(selected.key));
      if (!info.exists || info.sizeBytes !== selected.sizeBytes) {
        await safelyDelete(storage, fileNameForKey(selected.key));
        const withoutSelected = entries.filter((entry) => entry.key !== selected.key);
        memoryEntries = withoutSelected;
        await persist(storage, withoutSelected);
        return null;
      }
      memoryEntries = entries;
      if (
        prepared.requiresPersist ||
        staleKeys.length > 0 ||
        now - (persistedAccessTimes.get(selected.key) ?? selected.lastAccessedAt) >=
          accessTimestampPersistIntervalMs
      ) {
        await persist(storage, entries);
      }
      return info.uri;
    }),

    putBytes: (identity, bytes) => runExclusive(async () => {
      if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(bytes.byteLength) || bytes.byteLength <= 0 || bytes.byteLength > maximumCacheBytes) {
        throw new TypeError('Cache bytes must be a non-empty Uint8Array within the cache limit');
      }
      const storage = await storagePromise;
      const now = safeNow(currentTime());
      const key = buildImageCacheKey(identity);
      const prepared = await prepare(storage, now);
      const fileName = fileNameForKey(key);
      await storage.writeBytes(fileName, bytes);

      const withoutPrevious = prepared.entries.filter((entry) => entry.key !== key);
      const candidate = [
        ...withoutPrevious,
        {key, lastAccessedAt: now, namespace: identity.namespace, sizeBytes: bytes.byteLength},
      ];
      const bounded = await applyPlans(storage, candidate, now);
      const limited = await enforceMetadataEntryLimit(storage, bounded.entries);
      memoryEntries = limited.entries;
      await persist(storage, limited.entries);
      if (!limited.entries.some((entry) => entry.key === key)) {
        throw new Error('Cached image exceeded the cache policy');
      }
      return (await storage.fileInfo(fileName)).uri;
    }),
  };
}

async function prepareCache(
  storage: AnnouncementImageCacheStorage,
  now: number,
  recentAccessTimes?: ReadonlyMap<string, number>,
  forceReconcile = false,
  protectedEntryNames: ReadonlySet<string> = new Set(),
) {
  await storage.ensureDirectory();
  const metadata = await loadMetadataDocument(storage);
  const duplicateKeys = duplicateValues(metadata.parsed.entries.map((entry) => entry.key));
  const canUseRecentMetadata = !forceReconcile &&
    metadata.info.exists &&
    metadata.parsed.valid &&
    duplicateKeys.size === 0 &&
    await wasReconciledRecently(storage, now);
  const loaded = canUseRecentMetadata
    ? {deleteKeys: [] as string[], entries: metadata.parsed.entries}
    : await loadMetadataAndReconcile(storage, metadata, protectedEntryNames);
  if (!canUseRecentMetadata) await recordReconciliation(storage, now);
  const entries = loaded.entries.map((entry) => {
    const recentAccess = recentAccessTimes?.get(entry.key);
    return recentAccess !== undefined && recentAccess > entry.lastAccessedAt
      ? {...entry, lastAccessedAt: recentAccess}
      : entry;
  });
  const planned = await applyPlans(storage, entries, now);
  const limited = await enforceMetadataEntryLimit(storage, planned.entries);
  const deleteKeys = unique([...loaded.deleteKeys, ...planned.deleteKeys, ...limited.deleteKeys]);
  return {
    deleteKeys,
    entries: limited.entries,
    requiresPersist: !metadata.info.exists || !metadata.parsed.valid || deleteKeys.length > 0,
  };
}

async function loadMetadataDocument(storage: AnnouncementImageCacheStorage) {
  const info = await storage.fileInfo(metadataFileName);
  let parsed: {entries: ImageCacheMetadata[]; valid: boolean} = {entries: [], valid: true};

  if (info.exists) {
    if (!Number.isSafeInteger(info.sizeBytes) || info.sizeBytes <= 0 || info.sizeBytes > maximumMetadataBytes) {
      parsed = {entries: [], valid: false};
    } else {
      try {
        parsed = parseMetadata(await storage.readText(metadataFileName));
      } catch {
        parsed = {entries: [], valid: false};
      }
    }
  }

  return {info, parsed};
}

async function loadMetadataAndReconcile(
  storage: AnnouncementImageCacheStorage,
  providedMetadata?: Awaited<ReturnType<typeof loadMetadataDocument>>,
  protectedEntryNames: ReadonlySet<string> = new Set(),
) {
  const metadata = providedMetadata ?? await loadMetadataDocument(storage);
  const names = await storage.listEntryNames();
  const duplicateKeys = duplicateValues(metadata.parsed.entries.map((entry) => entry.key));
  const entries = metadata.parsed.entries.filter((entry) => !duplicateKeys.has(entry.key));
  const referencedNames = new Set(entries.map((entry) => fileNameForKey(entry.key)));
  const reservedNames = new Set([
    maintenanceFileName,
    metadataFileName,
    temporaryMaintenanceFileName,
    temporaryMetadataFileName,
    ...protectedEntryNames,
  ]);
  for (const name of names) {
    if (!reservedNames.has(name) && !referencedNames.has(name)) await safelyDelete(storage, name);
  }
  if (names.includes(temporaryMetadataFileName)) await safelyDelete(storage, temporaryMetadataFileName);
  if (names.includes(temporaryMaintenanceFileName)) {
    await safelyDelete(storage, temporaryMaintenanceFileName);
  }

  const reconciled: ImageCacheMetadata[] = [];
  const deleteKeys = [...duplicateKeys];
  for (const entry of entries) {
    const info = await storage.fileInfo(fileNameForKey(entry.key));
    if (!info.exists) {
      deleteKeys.push(entry.key);
      continue;
    }
    if (
      !Number.isSafeInteger(info.sizeBytes) ||
      info.sizeBytes <= 0 ||
      info.sizeBytes !== entry.sizeBytes
    ) {
      reconciled.push({...entry, sizeBytes: Number.NaN});
      continue;
    }
    reconciled.push(entry);
  }

  if (!metadata.parsed.valid && metadata.info.exists) await safelyDelete(storage, metadataFileName);
  return {deleteKeys, entries: reconciled};
}

async function wasReconciledRecently(storage: AnnouncementImageCacheStorage, now: number) {
  const info = await storage.fileInfo(maintenanceFileName);
  if (!info.exists || !Number.isSafeInteger(info.sizeBytes) || info.sizeBytes <= 0 || info.sizeBytes > 32) {
    return false;
  }
  try {
    const timestamp = Number(await storage.readText(maintenanceFileName));
    return Number.isSafeInteger(timestamp) &&
      timestamp >= 0 &&
      timestamp <= now &&
      now - timestamp < reconciliationIntervalMs;
  } catch {
    return false;
  }
}

async function recordReconciliation(storage: AnnouncementImageCacheStorage, now: number) {
  try {
    await storage.writeTextAtomically(
      maintenanceFileName,
      temporaryMaintenanceFileName,
      String(now),
    );
  } catch {
    await safelyDelete(storage, temporaryMaintenanceFileName);
    // The marker is only an optimization. A failed write triggers a safe full
    // reconciliation on the next process start.
  }
}

async function applyPlans(
  storage: AnnouncementImageCacheStorage,
  entries: readonly ImageCacheMetadata[],
  now: number,
) {
  const plan = planImageCacheCleanup(entries, now);
  await deleteKeys(storage, entries, plan.deleteKeys);
  return {deleteKeys: plan.deleteKeys, entries: entriesForKeys(entries, plan.keepKeys)};
}

async function enforceMetadataEntryLimit(
  storage: AnnouncementImageCacheStorage,
  entries: readonly ImageCacheMetadata[],
) {
  if (entries.length <= maximumMetadataEntries) return {deleteKeys: [], entries: [...entries]};
  const ordered = [...entries].sort((left, right) =>
    left.lastAccessedAt - right.lastAccessedAt || left.key.localeCompare(right.key));
  const removed = ordered.slice(0, ordered.length - maximumMetadataEntries);
  const kept = ordered.slice(-maximumMetadataEntries);
  const deleteKeysToApply = removed.map((entry) => entry.key);
  await deleteKeys(storage, entries, deleteKeysToApply);
  return {deleteKeys: deleteKeysToApply, entries: kept};
}

async function deleteKeys(
  storage: AnnouncementImageCacheStorage,
  entries: readonly ImageCacheMetadata[],
  keys: readonly string[],
) {
  const known = new Set(entries.map((entry) => entry.key));
  for (const key of unique(keys)) {
    if (known.has(key)) await safelyDelete(storage, fileNameForKey(key));
  }
}

async function deleteEntryNamesStrict(
  storage: AnnouncementImageCacheStorage,
  names: readonly string[],
) {
  const deletedNames: string[] = [];
  const failedNames: string[] = [];
  for (const name of unique(names)) {
    try {
      await storage.deleteEntry(name);
      deletedNames.push(name);
    } catch {
      failedNames.push(name);
    }
  }
  return {deletedNames, failedNames};
}

function assertExplicitCleanupSucceeded(failedNames: readonly string[]) {
  if (failedNames.length > 0) {
    throw new Error('explicit image cache cleanup failed; retry is required');
  }
}

function assertNoProtectedExplicitCleanupTargets(
  targetNames: readonly string[],
  protectedEntryNames: ReadonlySet<string>,
) {
  if (targetNames.some((name) => protectedEntryNames.has(name))) {
    throw new Error('explicit image cache cleanup failed; active download cleanup is still pending');
  }
}

async function saveMetadata(
  storage: AnnouncementImageCacheStorage,
  entries: readonly ImageCacheMetadata[],
) {
  const document: MetadataDocument = {
    entries: [...entries].sort((left, right) => left.key.localeCompare(right.key)),
    version: metadataVersion,
  };
  const text = JSON.stringify(document);
  if (text.length > maximumMetadataBytes) throw new Error('Image cache metadata exceeded its limit');
  await storage.writeTextAtomically(metadataFileName, temporaryMetadataFileName, text);
}

function parseMetadata(text: string): {entries: ImageCacheMetadata[]; valid: boolean} {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.version !== metadataVersion || !Array.isArray(value.entries)) {
    return {entries: [], valid: false};
  }

  const entries: ImageCacheMetadata[] = [];
  for (const item of value.entries) {
    if (
      !isRecord(item) ||
      typeof item.key !== 'string' ||
      typeof item.namespace !== 'string' ||
      typeof item.lastAccessedAt !== 'number' ||
      typeof item.sizeBytes !== 'number'
    ) {
      continue;
    }
    const parsedKey = parseCacheKey(item.key);
    if (!parsedKey || parsedKey.namespace !== item.namespace) continue;
    entries.push({
      key: item.key,
      lastAccessedAt: item.lastAccessedAt,
      namespace: item.namespace,
      sizeBytes: item.sizeBytes,
    });
  }
  return {entries, valid: entries.length === value.entries.length};
}

function fileNameForKey(key: string) {
  const parsed = parseCacheKey(key);
  if (!parsed) throw new Error('Invalid image cache key');
  return `${parsed.namespace}--${parsed.assetId}--${parsed.sha256}--${parsed.variant}.image-cache`;
}

function parseCacheKey(key: string) {
  const match = cacheKeyPattern.exec(key);
  if (!match) return null;
  const [, namespace, assetIdString, sha256, variant] = match;
  const assetId = Number(assetIdString);
  if (
    namespace === undefined ||
    sha256 === undefined ||
    (variant !== 'detail' && variant !== 'thumbnail') ||
    !Number.isSafeInteger(assetId) ||
    assetId <= 0
  ) {
    return null;
  }
  return {assetId, namespace, sha256, variant};
}

function entriesForKeys(entries: readonly ImageCacheMetadata[], keys: readonly string[]) {
  const keep = new Set(keys);
  return entries.filter((entry) => keep.has(entry.key));
}

function duplicateValues(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates;
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function safeNow(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid image cache clock');
  return value;
}

function assertAssetIdentity(identity: AnnouncementImageCacheAssetIdentity) {
  buildImageCacheKey({...identity, sha256: '0'.repeat(64)});
}

async function safelyDelete(storage: AnnouncementImageCacheStorage, name: string) {
  try {
    await storage.deleteEntry(name);
  } catch {
    // Cache cleanup is best-effort. An orphan is reconciled again on the next operation.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function createExpoFileSystemStorage(): Promise<AnnouncementImageCacheStorage> {
  const {Directory, File, Paths} = await import('expo-file-system');
  const directory = new Directory(Paths.cache, ANNOUNCEMENT_IMAGE_CACHE_DIRECTORY_NAME);
  const file = (name: string) => new File(directory, name);

  return {
    async deleteEntry(name) {
      if (!directory.exists) return;
      const entry = directory.list().find((candidate) => candidate.name === name);
      if (entry) entry.delete();
    },
    async ensureDirectory() {
      directory.create({idempotent: true, intermediates: true, overwrite: false});
    },
    async fileInfo(name) {
      const target = file(name);
      return {exists: target.exists, sizeBytes: target.size, uri: target.uri};
    },
    async listEntryNames() {
      return directory.exists ? directory.list().map((entry) => entry.name) : [];
    },
    async readText(name) {
      return file(name).text();
    },
    async writeBytes(name, bytes) {
      const target = file(name);
      target.create({intermediates: false, overwrite: true});
      target.write(bytes);
    },
    async writeTextAtomically(name, temporaryName, text) {
      const temporary = file(temporaryName);
      temporary.create({intermediates: false, overwrite: true});
      temporary.write(text);
      await temporary.move(file(name), {overwrite: true});
    },
  };
}
