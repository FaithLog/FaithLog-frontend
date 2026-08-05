import {createNativeAnnouncementBinaryUploader} from '../announcements/announcementNativeMedia';
import type {PdfUploadCandidate} from '../media/documentMediaTypes';
import type {PdfDirectUploadTransport} from '../media/pdfUploadCoordinator';
import {validateWeeklyMaterialPdf} from './weeklyMaterialUpload';

type NativeDocumentSource = {contentType: string; fileName: string; uri: string};

export type WeeklyMaterialNativeDocumentDependencies = {
  getByteSize: (uri: string) => Promise<number>;
  pickDocument: () => Promise<NativeDocumentSource | null>;
  readBytes: (uri: string) => Promise<Uint8Array>;
  sha256: (bytes: Uint8Array) => Promise<string>;
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
  return {
    async pickDocument() {
      const picker = await import('expo-document-picker');
      const result = await picker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: 'application/pdf',
      });
      if (result.canceled || !result.assets[0]) return null;
      const asset = result.assets[0];
      return {contentType: asset.mimeType ?? '', fileName: asset.name, uri: asset.uri};
    },
    async getByteSize(uri) {
      const {File} = await import('expo-file-system');
      return new File(uri).size;
    },
    async readBytes(uri) {
      const {File} = await import('expo-file-system');
      return new File(uri).bytes();
    },
    async sha256(bytes) {
      const crypto = await import('expo-crypto');
      const digest = await crypto.digest(
        crypto.CryptoDigestAlgorithm.SHA256,
        Uint8Array.from(bytes),
      );
      return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
    },
  };
}
