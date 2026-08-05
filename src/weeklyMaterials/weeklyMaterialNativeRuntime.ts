import {documentMediaApi} from '../media/documentMediaApi';
import type {PdfUploadCandidate, ReadyDocumentAsset} from '../media/documentMediaTypes';
import {runPdfUpload} from '../media/pdfUploadCoordinator';
import {getPrivateDocumentCache} from '../media/privateDocumentCache';
import {openWeeklyMaterialDocument} from './weeklyMaterialDocument';
import {
  createWeeklyMaterialPdfUploadTransport,
  pickAndPrepareWeeklyMaterialPdf,
} from './weeklyMaterialNativeDocument';
import type {WeeklyMaterial} from './weeklyMaterialTypes';

export async function pickWeeklyMaterialPdf() {
  return pickAndPrepareWeeklyMaterialPdf();
}

export async function uploadWeeklyMaterialPdf({
  accessToken,
  campusId,
  file,
  onProgress,
  signal,
}: {
  accessToken: string;
  campusId: number;
  file: PdfUploadCandidate;
  onProgress: (progress: number) => void;
  signal: AbortSignal;
}): Promise<ReadyDocumentAsset> {
  return runPdfUpload({
    accessToken,
    api: documentMediaApi,
    campusId,
    file,
    maxPdfBytes: 30 * 1024 * 1024,
    onProgress,
    signal,
    transport: createWeeklyMaterialPdfUploadTransport(),
  });
}

export async function openWeeklyMaterialPdf({
  accessToken,
  campusId,
  material,
}: {
  accessToken: string;
  campusId: number;
  material: WeeklyMaterial;
}) {
  const cache = getPrivateDocumentCache();
  await openWeeklyMaterialDocument({
    accessToken,
    api: documentMediaApi,
    cache,
    campusId,
    material,
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
