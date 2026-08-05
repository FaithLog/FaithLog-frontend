import type {DocumentCacheAdapter} from '../media/documentCacheCoordinator';
import {resolveCachedDocument} from '../media/documentCacheCoordinator';
import type {DocumentMediaApi} from '../media/documentMediaApi';

export async function openAnnouncementDocument({
  accessToken,
  api,
  assetId,
  cache,
  campusId,
  open,
}: {
  accessToken: string;
  api: Pick<DocumentMediaApi, 'getAccessUrls'>;
  assetId: number;
  cache: DocumentCacheAdapter;
  campusId: number;
  open: (uri: string) => Promise<void> | void;
}) {
  const [access] = await api.getAccessUrls(accessToken, campusId, [assetId]);
  if (!access || access.assetId !== assetId) {
    throw new Error('Announcement document metadata mismatch');
  }
  const resolved = await resolveCachedDocument({
    adapter: cache,
    assetId,
    sha256: access.sha256,
    signedUrl: access.downloadUrl,
  });
  await open(resolved.uri);
}
