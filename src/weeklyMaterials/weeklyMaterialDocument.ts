import type {DocumentCacheAdapter} from '../media/documentCacheCoordinator';
import {resolveCachedDocument} from '../media/documentCacheCoordinator';
import type {DocumentMediaApi} from '../media/documentMediaApi';
import type {WeeklyMaterial} from './weeklyMaterialTypes';

export async function openWeeklyMaterialDocument({
  accessToken,
  api,
  cache,
  campusId,
  material,
  open,
  shouldOpen = () => true,
}: {
  accessToken: string;
  api: Pick<DocumentMediaApi, 'getAccessUrls'>;
  cache: DocumentCacheAdapter;
  campusId: number;
  material: WeeklyMaterial;
  open: (uri: string) => Promise<void> | void;
  shouldOpen?: () => boolean;
}) {
  if (!shouldOpen()) return;
  const [access] = await api.getAccessUrls(accessToken, campusId, [material.mediaAssetId]);
  if (
    !access || access.assetId !== material.mediaAssetId ||
    access.sha256 !== material.sha256 || access.byteSize !== material.byteSize
  ) {
    throw new Error('Weekly material metadata mismatch');
  }
  if (!shouldOpen()) return;
  const resolved = await resolveCachedDocument({
    adapter: cache,
    assetId: material.mediaAssetId,
    sha256: material.sha256,
    signedUrl: access.downloadUrl,
  });
  if (!shouldOpen()) return;
  await open(resolved.uri);
}
