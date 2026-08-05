import {documentMediaApi} from '../media/documentMediaApi';
import type {PdfUploadCandidate, ReadyDocumentAsset} from '../media/documentMediaTypes';
import {runPdfUpload} from '../media/pdfUploadCoordinator';
import {openWeeklyMaterialDocument} from './weeklyMaterialDocument';
import {
  createWeeklyMaterialPdfUploadTransport,
  pickAndPrepareWeeklyMaterialPdf,
} from './weeklyMaterialNativeDocument';
import type {WeeklyMaterial} from './weeklyMaterialTypes';

const WEEKLY_DOCUMENT_CACHE_DIRECTORY = 'faithlog-weekly-material-documents-v1';

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
  const cache = await createNativeDocumentCache();
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

async function createNativeDocumentCache() {
  const {Directory, File, Paths} = await import('expo-file-system');
  const directory = new Directory(Paths.cache, WEEKLY_DOCUMENT_CACHE_DIRECTORY);
  directory.create({idempotent: true, intermediates: true, overwrite: false});
  const file = (cacheKey: string) => new File(directory, `${cacheKey}.pdf`);

  return {
    async download({cacheKey, signedUrl}: {cacheKey: string; signedUrl: string}) {
      const destination = file(cacheKey);
      if (destination.exists) destination.delete();
      const downloaded = await File.downloadFileAsync(signedUrl, destination, {
        idempotent: false,
      });
      return downloaded.uri;
    },
    async exists(cacheKey: string) {
      return file(cacheKey).exists;
    },
    resolveUri(cacheKey: string) {
      return file(cacheKey).uri;
    },
    async touch(_cacheKey: string, _at: number) {
      // The stable cache file is refreshed on access. Shared cache maintenance
      // owns TTL/LRU cleanup and logout removal.
    },
  };
}
