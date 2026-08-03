import {describe, expect, it} from 'vitest';

import {
  createMockPollImagePicker,
  createProductionPollImagePicker,
} from './pollImagePicker';

describe('poll image picker boundary', () => {
  it('provides normalized metadata in development mock without native dependencies', async () => {
    const picker = createMockPollImagePicker();
    await expect(picker.pickAndNormalize()).resolves.toEqual([
      expect.objectContaining({contentType: 'image/jpeg', exifRemoved: true, orientationCorrected: true}),
    ]);
  });

  it('fails closed in production until an approved native picker/HEIC adapter exists', async () => {
    const picker = createProductionPollImagePicker();
    await expect(picker.pickAndNormalize()).rejects.toMatchObject({
      detail: {code: 'NATIVE_MEDIA_DEPENDENCY_PENDING'},
    });
  });
});
