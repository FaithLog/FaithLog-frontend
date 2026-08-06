import type {PdfUploadCandidate, ReadyDocumentAsset} from '../media/documentMediaTypes';
import {openNativePdf} from '../media/nativePdfViewer';
import {runPdfUpload} from '../media/pdfUploadCoordinator';
import {getPrivateDocumentCache} from '../media/privateDocumentCache';
import {openWeeklyMaterialDocument} from './weeklyMaterialDocument';
import {weeklyMaterialDocumentMediaApi} from './weeklyMaterialDocumentMediaApi';
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
    api: weeklyMaterialDocumentMediaApi,
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
    api: weeklyMaterialDocumentMediaApi,
    cache,
    campusId,
    material,
    open: openNativePdf,
  });
}
