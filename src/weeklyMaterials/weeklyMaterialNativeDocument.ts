import {createNativeAnnouncementBinaryUploader} from '../announcements/announcementNativeMedia';
import type {PdfUploadCandidate} from '../media/documentMediaTypes';
import {
  createNativePdfDocumentDependencies,
  type NativePdfDocumentDependencies,
} from '../media/nativePdfDocumentDependencies';
import type {PdfDirectUploadTransport} from '../media/pdfUploadCoordinator';
import {validateWeeklyMaterialPdf} from './weeklyMaterialUpload';

type NativeDocumentSource = {contentType: string; fileName: string; uri: string};

export type WeeklyMaterialNativeDocumentDependencies = Omit<NativePdfDocumentDependencies, 'pickDocuments'> & {
  pickDocument: () => Promise<NativeDocumentSource | null>;
};

export async function pickAndPrepareWeeklyMaterialPdf(
  dependencies: WeeklyMaterialNativeDocumentDependencies = createNativeDependencies(),
): Promise<PdfUploadCandidate | null> {
  const source = await dependencies.pickDocument();
  if (!source) return null;
  const byteSize = await dependencies.getByteSize(source.uri);
  const checked = validateWeeklyMaterialPdf({
    byteSize,
    contentType: source.contentType,
    fileName: source.fileName,
  });
  if (!checked.ok) {
    const sizeMessage = checked.reason === 'tooLarge' ? 'PDF는 30MB 이하여야 합니다.' : 'PDF 파일을 확인해 주세요.';
    throw new Error(sizeMessage);
  }
  const bytes = await dependencies.readBytes(source.uri);
  if (bytes.byteLength !== byteSize) throw new Error('PDF 파일 크기가 변경되었습니다.');
  const sha256 = (await dependencies.sha256(bytes)).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('PDF 파일을 확인해 주세요.');
  return {
    byteSize,
    contentType: 'application/pdf',
    fileName: checked.fileName,
    sha256,
    uri: source.uri,
  };
}

export function createWeeklyMaterialPdfUploadTransport(): PdfDirectUploadTransport {
  const uploadBinary = createNativeAnnouncementBinaryUploader();
  return {
    upload: ({headers, onProgress, signal, uploadUrl, uri}) =>
      uploadBinary({headers, localUri: uri, uploadUrl}, onProgress, signal),
  };
}

function createNativeDependencies(): WeeklyMaterialNativeDocumentDependencies {
  const dependencies = createNativePdfDocumentDependencies({multiple: false});
  return {
    async pickDocument() {
      return (await dependencies.pickDocuments())[0] ?? null;
    },
    getByteSize: dependencies.getByteSize,
    readBytes: dependencies.readBytes,
    sha256: dependencies.sha256,
  };
}
