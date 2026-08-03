export type ImageCacheVariant = 'detail' | 'thumbnail';
export type ImageCacheMetadata = {key: string; lastAccessedAt: number; sizeBytes: number};
const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
const maxBytes = 200 * 1024 * 1024;

export function buildImageCacheKey({assetId, sha256, variant}: {assetId: number; sha256: string; variant: ImageCacheVariant}) {
  if (!Number.isSafeInteger(assetId) || assetId <= 0 || !/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('Invalid cache identity');
  return `${assetId}-${sha256.toLowerCase()}-${variant}`;
}

export function planImageCacheCleanup(entries: readonly ImageCacheMetadata[], now: number) {
  const deleteKeys: string[] = [];
  const active = entries.filter((entry) => {
    const expired = entry.lastAccessedAt > now || now - entry.lastAccessedAt >= maxAgeMs;
    if (expired) deleteKeys.push(entry.key);
    return !expired;
  }).sort((left, right) => left.lastAccessedAt - right.lastAccessedAt);
  let total = active.reduce((sum, entry) => sum + Math.max(0, entry.sizeBytes), 0);
  while (total > maxBytes && active.length) {
    const removed = active.shift();
    if (!removed) break;
    total -= Math.max(0, removed.sizeBytes);
    deleteKeys.push(removed.key);
  }
  return {deleteKeys, keepKeys: active.map((entry) => entry.key)};
}
