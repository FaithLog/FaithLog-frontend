import type {MediaVariant} from './mediaTypes';

export const MEDIA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const MEDIA_CACHE_MAX_BYTES = 200 * 1024 * 1024;

export type MediaCacheIdentity = {
  assetId: number;
  sha256: string;
  variant: MediaVariant;
};

export type MediaCacheEntry = {
  key: string;
  byteSize: number;
  lastAccessedAt: number;
};

export function buildMediaCacheKey(identity: MediaCacheIdentity) {
  if (
    !Number.isSafeInteger(identity.assetId) || identity.assetId <= 0 ||
    !/^[a-f0-9]{64}$/i.test(identity.sha256)
  ) {
    throw new Error('Invalid media cache identity');
  }
  return `${identity.assetId}-${identity.sha256.toLowerCase()}-${identity.variant}`;
}
export function selectMediaCacheEntriesToDelete(entries: MediaCacheEntry[], now: number) {
  const expired = entries.filter((entry) => now - entry.lastAccessedAt > MEDIA_CACHE_TTL_MS);
  const expiredKeys = new Set(expired.map((entry) => entry.key));
  let remainingBytes = entries.reduce(
    (total, entry) => expiredKeys.has(entry.key) ? total : total + Math.max(0, entry.byteSize),
    0,
  );
  const deletions = expired.map((entry) => entry.key);
  const survivors = entries
    .filter((entry) => !expiredKeys.has(entry.key))
    .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt);
  for (const entry of survivors) {
    if (remainingBytes <= MEDIA_CACHE_MAX_BYTES) break;
    deletions.push(entry.key);
    remainingBytes -= Math.max(0, entry.byteSize);
  }
  return deletions;
}
