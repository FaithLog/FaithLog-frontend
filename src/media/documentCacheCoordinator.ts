import {buildMediaCacheKey} from './mediaCachePolicy';

export type DocumentCacheAdapter = {
  download(input: {cacheKey: string; signedUrl: string}): Promise<string>;
  exists(cacheKey: string): Promise<boolean>;
  resolveUri(cacheKey: string): string;
  touch(cacheKey: string, at: number): Promise<void>;
};

export async function resolveCachedDocument({
  adapter,
  assetId,
  now = Date.now(),
  sha256,
  signedUrl,
}: {
  adapter: DocumentCacheAdapter;
  assetId: number;
  now?: number;
  sha256: string;
  signedUrl: string;
}) {
  const cacheKey = buildMediaCacheKey({assetId, sha256, variant: 'document'});
  if (await adapter.exists(cacheKey)) {
    await adapter.touch(cacheKey, now);
    return {cacheKey, downloaded: false, uri: adapter.resolveUri(cacheKey)};
  }
  const uri = await adapter.download({cacheKey, signedUrl});
  await adapter.touch(cacheKey, now);
  return {cacheKey, downloaded: true, uri};
}
