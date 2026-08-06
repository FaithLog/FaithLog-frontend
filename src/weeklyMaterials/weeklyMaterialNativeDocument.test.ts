import {describe, expect, it, vi} from 'vitest';

import {MAX_WEEKLY_MATERIAL_PDF_BYTES} from '../media/pdfAttachmentPolicy';
import {pickAndPrepareWeeklyMaterialPdf} from './weeklyMaterialNativeDocument';

vi.mock('../announcements/announcementNativeMedia', () => ({
  createNativeAnnouncementBinaryUploader: () => vi.fn(),
}));

describe('weekly material native PDF selection', () => {
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
