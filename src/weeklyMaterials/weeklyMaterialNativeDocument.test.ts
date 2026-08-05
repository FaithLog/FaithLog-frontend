import {describe, expect, it, vi} from 'vitest';

import {MAX_WEEKLY_MATERIAL_PDF_BYTES} from '../media/pdfAttachmentPolicy';
import {pickAndPrepareWeeklyMaterialPdf} from './weeklyMaterialNativeDocument';

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
