import {createNativeAnnouncementBinaryUploader} from '../announcements/announcementNativeMedia';
import type {PdfUploadCandidate} from './documentMediaTypes';
import {
  createNativePdfDocumentDependencies,
  type NativePdfDocumentDependencies,
  type NativePdfDocumentSource,
} from './nativePdfDocumentDependencies';
import type {PdfDirectUploadTransport} from './pdfUploadCoordinator';
import {MAX_WEEKLY_MATERIAL_PDF_BYTES, validatePdfCandidate} from './pdfAttachmentPolicy';

export type AnnouncementNativeDocumentSource = NativePdfDocumentSource;
export type AnnouncementNativeDocumentDependencies = NativePdfDocumentDependencies;
export type PreparedAnnouncementPdf = PdfUploadCandidate & {sourceIndex: number};

export async function pickAndPrepareAnnouncementPdfs(
  dependencies: AnnouncementNativeDocumentDependencies = createNativePdfDocumentDependencies({multiple: true}),
): Promise<{
  failures: Array<{sourceIndex: number; userMessage: string}>;
  prepared: PreparedAnnouncementPdf[];
}> {
  const sources = await dependencies.pickDocuments();
  const failures: Array<{sourceIndex: number; userMessage: string}> = [];
  const prepared: PreparedAnnouncementPdf[] = [];

  // Process sequentially so selecting several large PDFs does not retain all
  // binary buffers in memory at the same time.
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    const source = sources[sourceIndex];
    if (!source) continue;
    try {
      const byteSize = await dependencies.getByteSize(source.uri);
      const checked = validatePdfCandidate({
        byteSize,
        contentType: source.contentType,
        fileName: source.fileName,
      }, MAX_WEEKLY_MATERIAL_PDF_BYTES);
      if (!checked.ok) throw new Error('invalid PDF metadata');
      const bytes = await dependencies.readBytes(source.uri);
      if (bytes.byteLength !== byteSize) throw new Error('PDF size changed during preflight');
      const sha256 = (await dependencies.sha256(bytes)).toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('invalid PDF digest');
      prepared.push({
        byteSize,
        contentType: 'application/pdf',
        fileName: checked.fileName,
        sha256,
        sourceIndex,
        uri: source.uri,
      });
    } catch {
      failures.push({sourceIndex, userMessage: 'PDF 파일을 확인해 주세요.'});
    }
  }
  return {failures, prepared};
}

export function createNativePdfDirectUploadTransport(): PdfDirectUploadTransport {
  const uploadBinary = createNativeAnnouncementBinaryUploader();
  return {
    upload: ({headers, onProgress, signal, uploadUrl, uri}) => uploadBinary(
      {headers, localUri: uri, uploadUrl},
      onProgress,
      signal,
    ),
  };
}
