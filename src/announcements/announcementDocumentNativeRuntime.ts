import {documentMediaApi} from '../media/documentMediaApi';
import {openNativePdf} from '../media/nativePdfViewer';
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
    open: openNativePdf,
  });
}
