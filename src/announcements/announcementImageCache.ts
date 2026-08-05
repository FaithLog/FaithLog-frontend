export type ImageCacheVariant = 'detail' | 'thumbnail';
export type ImageCacheMetadata = {key: string; lastAccessedAt: number; namespace: string; sizeBytes: number};
const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
const maxBytes = MEDIA_IMAGE_CACHE_MAX_BYTES;
const namespacePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function buildImageCacheKey({assetId, namespace, sha256, variant}: {assetId: number; namespace: string; sha256: string; variant: ImageCacheVariant}) {
  if (
    !Number.isSafeInteger(assetId) ||
    assetId <= 0 ||
    !namespacePattern.test(namespace) ||
    !/^[a-f0-9]{64}$/i.test(sha256) ||
    (variant !== 'detail' && variant !== 'thumbnail')
  ) {
    throw new Error('Invalid cache identity');
  }
  return `announcement-images/v1/${namespace}/${assetId}/${sha256.toLowerCase()}/${variant}`;
}

export function planImageCacheCleanup(entries: readonly ImageCacheMetadata[], now: number) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid cache clock');
  const deleteKeys: string[] = [];
  const active = entries.filter((entry) => {
    if (!isValidMetadata(entry)) {
      deleteKeys.push(entry.key);
      return false;
    }
    const expired = entry.lastAccessedAt > now || now - entry.lastAccessedAt >= maxAgeMs;
    if (expired) deleteKeys.push(entry.key);
    return !expired;
  }).sort((left, right) => left.lastAccessedAt - right.lastAccessedAt || left.key.localeCompare(right.key));
  let total = active.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  while (total > maxBytes && active.length) {
    const removed = active.shift();
    if (!removed) break;
    total -= removed.sizeBytes;
    deleteKeys.push(removed.key);
  }
  return {deleteKeys, keepKeys: active.map((entry) => entry.key)};
}

export function planImageCacheNamespaceCleanup(
  entries: readonly ImageCacheMetadata[],
  namespace: string,
) {
  if (!namespacePattern.test(namespace)) throw new Error('Invalid cache namespace');
  return {
    deleteKeys: entries.filter((entry) => entry.namespace === namespace).map((entry) => entry.key),
    keepKeys: entries.filter((entry) => entry.namespace !== namespace).map((entry) => entry.key),
  };
}

export const planImageCacheLogoutCleanup = planImageCacheNamespaceCleanup;

function isValidMetadata(entry: ImageCacheMetadata) {
  return (
    Boolean(entry.key.trim()) &&
    namespacePattern.test(entry.namespace) &&
    Number.isSafeInteger(entry.lastAccessedAt) &&
    entry.lastAccessedAt >= 0 &&
    Number.isSafeInteger(entry.sizeBytes) &&
    entry.sizeBytes >= 0
  );
}
import {MEDIA_IMAGE_CACHE_MAX_BYTES} from '../media/mediaCachePolicy';
