import type {DocumentCacheAdapter} from './documentCacheCoordinator';
import {
  MEDIA_DOCUMENT_CACHE_MAX_BYTES,
  selectMediaCacheEntriesToDelete,
  type MediaCacheEntry,
} from './mediaCachePolicy';

export type PrivateDocumentCacheStorage = {
  deleteEntry(name: string): Promise<void>;
  download(name: string, signedUrl: string): Promise<{sizeBytes: number; uri: string}>;
  ensureDirectory(): Promise<void>;
  fileInfo(name: string): Promise<{exists: boolean; sizeBytes: number; uri: string}>;
  listEntryNames(): Promise<string[]>;
  readText(name: string): Promise<string>;
  writeTextAtomically(name: string, temporaryName: string, text: string): Promise<void>;
};

export type PrivateDocumentCache = DocumentCacheAdapter & {
  clearAll(): Promise<void>;
};

const metadataFileName = 'private-document-cache-metadata-v1.json';
const temporaryMetadataFileName = 'private-document-cache-metadata-v1.tmp';
const cacheKeyPattern = /^[1-9]\d*-[a-f0-9]{64}-document$/;
const pdfNamePattern = /^([1-9]\d*-[a-f0-9]{64}-document)\.pdf$/;

export function createPrivateDocumentCache({
  now = Date.now,
  storage,
}: {
  now?: () => number;
  storage: PrivateDocumentCacheStorage;
}): PrivateDocumentCache {
  let initialized = false;
  let entries: MediaCacheEntry[] = [];
  let queue = Promise.resolve();
  const uriByKey = new Map<string, string>();

  const serialize = <T>(operation: () => Promise<T>) => {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };

  const initialize = async () => {
    if (initialized) return;
    await storage.ensureDirectory();
    const names = await storage.listEntryNames();
    let parsed: MediaCacheEntry[] = [];
    let metadataValid = false;
    try {
      parsed = parseMetadata(await storage.readText(metadataFileName));
      metadataValid = true;
    } catch {
      parsed = [];
    }

    const filesByKey = new Map<string, string>();
    for (const name of names) {
      const match = pdfNamePattern.exec(name);
      if (match) filesByKey.set(match[1]!, name);
    }

    const reconciled: MediaCacheEntry[] = [];
    for (const entry of parsed) {
      const name = filesByKey.get(entry.key);
      if (!name) continue;
      const info = await storage.fileInfo(name);
      if (!info.exists || !Number.isSafeInteger(info.sizeBytes) || info.sizeBytes <= 0) continue;
      reconciled.push({...entry, byteSize: info.sizeBytes});
      uriByKey.set(entry.key, info.uri);
      filesByKey.delete(entry.key);
    }
    for (const orphanName of filesByKey.values()) await safelyDelete(storage, orphanName);
    if (!metadataValid) await safelyDelete(storage, metadataFileName);
    entries = reconciled;
    await cleanup(now());
    initialized = true;
  };

  const cleanup = async (at: number) => {
    const deleteKeys = selectMediaCacheEntriesToDelete(
      entries,
      at,
      MEDIA_DOCUMENT_CACHE_MAX_BYTES,
    );
    if (deleteKeys.length === 0) return;
    const deleting = new Set(deleteKeys);
    for (const key of deleteKeys) {
      await safelyDelete(storage, fileName(key));
      uriByKey.delete(key);
    }
    entries = entries.filter((entry) => !deleting.has(entry.key));
  };

  const persist = () => storage.writeTextAtomically(
    metadataFileName,
    temporaryMetadataFileName,
    JSON.stringify({entries: [...entries].sort((a, b) => a.key.localeCompare(b.key)), version: 1}),
  );

  return {
    clearAll: () => serialize(async () => {
      await storage.ensureDirectory();
      for (const name of await storage.listEntryNames()) await storage.deleteEntry(name);
      entries = [];
      uriByKey.clear();
      initialized = true;
    }),
    download: ({cacheKey, signedUrl}) => serialize(async () => {
      assertCacheKey(cacheKey);
      assertSignedUrl(signedUrl);
      await initialize();
      const downloaded = await storage.download(fileName(cacheKey), signedUrl);
      if (!Number.isSafeInteger(downloaded.sizeBytes) || downloaded.sizeBytes <= 0) {
        await safelyDelete(storage, fileName(cacheKey));
        throw new Error('Invalid downloaded document size');
      }
      entries = entries.filter((entry) => entry.key !== cacheKey);
      entries.push({key: cacheKey, byteSize: downloaded.sizeBytes, lastAccessedAt: now()});
      uriByKey.set(cacheKey, downloaded.uri);
      await cleanup(now());
      if (!entries.some((entry) => entry.key === cacheKey)) {
        throw new Error('Downloaded document exceeded cache capacity');
      }
      await persist();
      return downloaded.uri;
    }),
    exists: (cacheKey) => serialize(async () => {
      assertCacheKey(cacheKey);
      await initialize();
      const entry = entries.find((candidate) => candidate.key === cacheKey);
      if (!entry) return false;
      const info = await storage.fileInfo(fileName(cacheKey));
      if (info.exists && Number.isSafeInteger(info.sizeBytes) && info.sizeBytes > 0) {
        uriByKey.set(cacheKey, info.uri);
        return true;
      }
      entries = entries.filter((candidate) => candidate.key !== cacheKey);
      uriByKey.delete(cacheKey);
      await persist();
      return false;
    }),
    resolveUri(cacheKey) {
      assertCacheKey(cacheKey);
      const uri = uriByKey.get(cacheKey);
      if (!uri) throw new Error('Document cache entry is unavailable');
      return uri;
    },
    touch: (cacheKey, at) => serialize(async () => {
      assertCacheKey(cacheKey);
      await initialize();
      if (!Number.isSafeInteger(at) || at < 0) throw new Error('Invalid document access time');
      entries = entries.map((entry) => entry.key === cacheKey
        ? {...entry, lastAccessedAt: at}
        : entry);
      await cleanup(at);
      await persist();
    }),
  };
}

function parseMetadata(text: string) {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) {
    throw new Error('Invalid document cache metadata');
  }
  const entries: MediaCacheEntry[] = [];
  const seen = new Set<string>();
  for (const entry of value.entries) {
    if (
      !isRecord(entry) || typeof entry.key !== 'string' ||
      !cacheKeyPattern.test(entry.key) || seen.has(entry.key) ||
      !Number.isSafeInteger(entry.byteSize) || Number(entry.byteSize) <= 0 ||
      !Number.isSafeInteger(entry.lastAccessedAt) || Number(entry.lastAccessedAt) < 0
    ) throw new Error('Invalid document cache metadata entry');
    seen.add(entry.key);
    entries.push({
      key: entry.key,
      byteSize: Number(entry.byteSize),
      lastAccessedAt: Number(entry.lastAccessedAt),
    });
  }
  return entries;
}

function fileName(cacheKey: string) {
  return `${cacheKey}.pdf`;
}

function assertCacheKey(cacheKey: string) {
  if (!cacheKeyPattern.test(cacheKey)) throw new Error('Invalid document cache key');
}

function assertSignedUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid signed document URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Invalid signed document URL');
  }
}

async function safelyDelete(storage: PrivateDocumentCacheStorage, name: string) {
  try {
    await storage.deleteEntry(name);
  } catch {
    // Cache cleanup is retried when the cache is next reconciled.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
