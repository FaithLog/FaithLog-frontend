import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => ({apiRequest: vi.fn()}));

import {apiRequest} from '../api/client';
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
      byteSize: 15 * 1024 * 1024,
      contentType: 'application/pdf',
      fileName: '목자지침.pdf',
      sha256: 'a'.repeat(64),
    })).resolves.toMatchObject({assetId: 41});

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/admin/campuses/7/media-assets/upload-reservations',
      expect.objectContaining({body: expect.objectContaining({byteSize: 15 * 1024 * 1024})}),
    );
  });
});
