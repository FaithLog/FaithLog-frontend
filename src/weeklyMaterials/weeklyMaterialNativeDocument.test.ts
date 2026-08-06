import {describe, expect, it, vi} from 'vitest';

import {MAX_WEEKLY_MATERIAL_PDF_BYTES} from '../media/pdfAttachmentPolicy';
import {
  createAndroidWeeklyMaterialBinaryUploader,
  createWeeklyMaterialPdfUploadTransport,
  pickAndPrepareWeeklyMaterialPdf,
} from './weeklyMaterialNativeDocument';

vi.mock('../announcements/announcementNativeMedia', () => ({
  createNativeAnnouncementBinaryUploader: () => vi.fn(),
}));

describe('weekly material native PDF selection', () => {
  it('uses the Android legacy upload task with exact R2 headers and progress', async () => {
    const uploadAsync = vi.fn(async () => ({status: 200}));
    const createUploadTask = vi.fn((_url, _uri, _options, onProgress) => {
      onProgress?.({totalBytesExpectedToSend: 4, totalBytesSent: 2});
      return {cancelAsync: vi.fn(), uploadAsync};
    });
    const uploader = createAndroidWeeklyMaterialBinaryUploader({
      binaryUploadType: 0,
      createUploadTask,
    });
    const onProgress = vi.fn();

    await uploader({
      headers: {'Content-Type': 'application/pdf'},
      localUri: 'file:///cache/weekly.pdf',
      uploadUrl: 'https://upload.example/signed',
    }, onProgress);

    expect(createUploadTask).toHaveBeenCalledWith(
      'https://upload.example/signed',
      'file:///cache/weekly.pdf',
      {
        headers: {'Content-Type': 'application/pdf'},
        httpMethod: 'PUT',
        uploadType: 0,
      },
      expect.any(Function),
    );
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(uploadAsync).toHaveBeenCalledOnce();
  });

  it('uploads when the Android AbortSignal shim has no EventTarget methods', async () => {
    const uploadAsync = vi.fn(async () => ({status: 200}));
    const uploader = createAndroidWeeklyMaterialBinaryUploader({
      binaryUploadType: 0,
      createUploadTask: vi.fn(() => ({cancelAsync: vi.fn(), uploadAsync})),
    });

    await expect(uploader({
      headers: {'Content-Type': 'application/pdf'},
      localUri: 'file:///cache/weekly.pdf',
      uploadUrl: 'https://upload.example/signed',
    }, vi.fn(), {aborted: false} as AbortSignal)).resolves.toBeUndefined();

    expect(uploadAsync).toHaveBeenCalledOnce();
  });

  it('contains a rejected native cancel request when an Android upload is aborted', async () => {
    let onAbort!: () => void;
    const removeEventListener = vi.fn();
    const signal = {
      aborted: false,
      addEventListener: vi.fn((_event: string, listener: () => void) => { onAbort = listener; }),
      removeEventListener,
    } as unknown as AbortSignal;
    const cancelAsync = vi.fn(async () => { throw new Error('native cancel failed'); });
    let finishUpload!: () => void;
    const uploadAsync = vi.fn(() => new Promise<{status: number}>((resolve) => {
      finishUpload = () => resolve({status: 200});
    }));
    const uploader = createAndroidWeeklyMaterialBinaryUploader({
      binaryUploadType: 0,
      createUploadTask: vi.fn(() => ({cancelAsync, uploadAsync})),
    });
    const pending = uploader({
      headers: {'Content-Type': 'application/pdf'},
      localUri: 'file:///cache/weekly.pdf',
      uploadUrl: 'https://upload.example/signed',
    }, vi.fn(), signal);

    onAbort();
    finishUpload();
    await expect(pending).resolves.toBeUndefined();
    await Promise.resolve();
    expect(cancelAsync).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith('abort', onAbort);
  });

  it('selects the legacy uploader only on Android', async () => {
    const androidUploader = vi.fn(async () => undefined);
    const nativeUploader = vi.fn(async () => undefined);
    const request = {
      headers: {'Content-Type': 'application/pdf'},
      onProgress: vi.fn(),
      uploadUrl: 'https://upload.example/signed',
      uri: 'file:///cache/weekly.pdf',
    };

    await createWeeklyMaterialPdfUploadTransport({
      androidUploader,
      nativeUploader,
      platform: 'android',
    }).upload(request);

    expect(androidUploader).toHaveBeenCalledOnce();
    expect(nativeUploader).not.toHaveBeenCalled();
  });

  it('hashes one selected PDF only after the 30 MiB preflight succeeds', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = await pickAndPrepareWeeklyMaterialPdf({
      getByteSize: vi.fn(async () => 3),
      pickDocument: vi.fn(async () => ({contentType: 'application/pdf', fileName: '목자지침.pdf', uri: 'file:///guide.pdf'})),
      readBytes: vi.fn(async () => bytes),
      sha256: vi.fn(async () => 'a'.repeat(64)),
    });
    expect(result).toEqual({
      byteSize: 3,
      contentType: 'application/pdf',
      fileName: '목자지침.pdf',
      sha256: 'a'.repeat(64),
      uri: 'file:///guide.pdf',
    });
  });

  it.each(['', 'application/octet-stream', 'application/x-pdf'])(
    'accepts a PDF signature from an Android provider that reports %j',
    async (contentType) => {
      const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
      const result = await pickAndPrepareWeeklyMaterialPdf({
        getByteSize: vi.fn(async () => bytes.byteLength),
        pickDocument: vi.fn(async () => ({
          contentType,
          fileName: '주간자료.pdf',
          uri: 'file:///weekly.pdf',
        })),
        readBytes: vi.fn(async () => bytes),
        sha256: vi.fn(async () => 'b'.repeat(64)),
      });

      expect(result).toMatchObject({
        contentType: 'application/pdf',
        fileName: '주간자료.pdf',
      });
    },
  );

  it('rejects generic Android MIME metadata when the selected bytes are not a PDF', async () => {
    const sha256 = vi.fn();
    await expect(pickAndPrepareWeeklyMaterialPdf({
      getByteSize: vi.fn(async () => 4),
      pickDocument: vi.fn(async () => ({
        contentType: 'application/octet-stream',
        fileName: '가짜자료.pdf',
        uri: 'file:///not-pdf.pdf',
      })),
      readBytes: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
      sha256,
    })).rejects.toThrow('PDF 파일을 확인해 주세요.');
    expect(sha256).not.toHaveBeenCalled();
  });

  it('does not override a concrete non-PDF MIME type even when the bytes contain a PDF header', async () => {
    const readBytes = vi.fn();
    await expect(pickAndPrepareWeeklyMaterialPdf({
      getByteSize: vi.fn(async () => 8),
      pickDocument: vi.fn(async () => ({
        contentType: 'image/jpeg',
        fileName: '이미지.pdf',
        uri: 'file:///image.pdf',
      })),
      readBytes,
      sha256: vi.fn(),
    })).rejects.toThrow('PDF 파일을 확인해 주세요.');
    expect(readBytes).not.toHaveBeenCalled();
  });

  it('rejects an oversized PDF without reading or hashing its binary', async () => {
    const readBytes = vi.fn();
    const sha256 = vi.fn();
    await expect(pickAndPrepareWeeklyMaterialPdf({
      getByteSize: vi.fn(async () => MAX_WEEKLY_MATERIAL_PDF_BYTES + 1),
      pickDocument: vi.fn(async () => ({contentType: 'application/pdf', fileName: 'large.pdf', uri: 'file:///large.pdf'})),
      readBytes,
      sha256,
    })).rejects.toThrow('30MB');
    expect(readBytes).not.toHaveBeenCalled();
    expect(sha256).not.toHaveBeenCalled();
  });

  it('returns null when the system picker is canceled', async () => {
    expect(await pickAndPrepareWeeklyMaterialPdf({
      getByteSize: vi.fn(),
      pickDocument: vi.fn(async () => null),
      readBytes: vi.fn(),
      sha256: vi.fn(),
    })).toBeNull();
  });
});
