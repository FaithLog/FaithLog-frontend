import {documentMediaApi} from '../media/documentMediaApi';
import {getPrivateDocumentCache} from '../media/privateDocumentCache';
import {openAnnouncementDocument} from './announcementDocumentOpen';

export async function openAnnouncementPdf({
  accessToken,
  assetId,
  campusId,
}: {
  accessToken: string;
  assetId: number;
  campusId: number;
}) {
  const cache = getPrivateDocumentCache();
  await openAnnouncementDocument({
    accessToken,
    api: documentMediaApi,
    assetId,
    cache,
    campusId,
    open: async (uri) => {
      const Sharing = await import('expo-sharing');
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('PDF viewer is unavailable');
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
    },
  });
}
