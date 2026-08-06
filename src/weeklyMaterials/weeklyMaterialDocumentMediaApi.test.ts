import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => ({apiRequest: vi.fn()}));

import {apiRequest} from '../api/client';
import {MAX_WEEKLY_MATERIAL_PDF_BYTES} from '../media/pdfAttachmentPolicy';
import {weeklyMaterialDocumentMediaApi} from './weeklyMaterialDocumentMediaApi';

describe('weekly material document media API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves the backend 30 MiB weekly-material limit at the reservation boundary', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      assetId: 41,
      expiresAt: '2026-08-06T12:00:00Z',
      requiredHeaders: {'Content-Type': 'application/pdf'},
      uploadUrl: 'https://upload.example/weekly-material',
    } as never);

    await expect(weeklyMaterialDocumentMediaApi.reserve('access', 7, {
      byteSize: MAX_WEEKLY_MATERIAL_PDF_BYTES,
      contentType: 'application/pdf',
      fileName: '목자지침.pdf',
      sha256: 'a'.repeat(64),
    })).resolves.toMatchObject({assetId: 41});

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/admin/campuses/7/media-assets/upload-reservations',
      expect.objectContaining({body: expect.objectContaining({byteSize: MAX_WEEKLY_MATERIAL_PDF_BYTES})}),
    );
  });

  it('rejects a PDF larger than 30 MiB before dispatching the reservation request', async () => {
    await expect(weeklyMaterialDocumentMediaApi.reserve('access', 7, {
      byteSize: MAX_WEEKLY_MATERIAL_PDF_BYTES + 1,
      contentType: 'application/pdf',
      fileName: '목자지침.pdf',
      sha256: 'a'.repeat(64),
    })).rejects.toMatchObject({detail: {code: 'MEDIA_PDF_INVALID'}});

    expect(apiRequest).not.toHaveBeenCalled();
  });
});
