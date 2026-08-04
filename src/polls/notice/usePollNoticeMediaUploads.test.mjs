import React, {useState} from 'react';
import {act, create} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  discardPrepared: vi.fn(async () => undefined),
  runMediaUpload: vi.fn(async () => ({assetId: 77, sha256: 'a'.repeat(64)})),
}));

vi.mock('../../announcements/announcementNativeMedia', () => ({
  createNativeAnnouncementBinaryUploader: vi.fn(() => vi.fn()),
  discardPreparedAnnouncementImages: mocks.discardPrepared,
}));
vi.mock('../../auth/accessTokenResolver', () => ({
  resolveCurrentAccessToken: vi.fn(async () => 'access-token'),
}));
vi.mock('../../api/client', () => ({isMockModeEnabled: vi.fn(() => false)}));
vi.mock('../../api/mockAdapter', () => ({createMockReadyMediaAssetForCampus: vi.fn()}));
vi.mock('../../media/mediaApi', () => ({mediaApi: {}}));
vi.mock('../../media/mediaUploadCoordinator', () => ({
  runMediaUpload: mocks.runMediaUpload,
}));
vi.mock('./pollImagePicker', () => ({
  createProductionPollImagePicker: vi.fn(() => ({
    pickAndNormalize: vi.fn(async () => [{
      localId: 'picked-1',
      uri: 'file:///tmp/picked-1.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
      width: 1200,
      height: 900,
      sha256: '1'.repeat(64),
      exifRemoved: true,
      orientationCorrected: true,
    }]),
  })),
}));

import {usePollNoticeMediaUploads} from './usePollNoticeMediaUploads';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('usePollNoticeMediaUploads', () => {
  it('keeps the local preview file until the editor unmounts after upload success', async () => {
    let controls;
    function Harness() {
      const [items, setItems] = useState([]);
      controls = usePollNoticeMediaUploads({
        campusId: 1,
        enabled: true,
        items,
        onChange: setItems,
      });
      return React.createElement('State', {items});
    }

    let renderer;
    await act(async () => {
      renderer = create(React.createElement(Harness));
    });
    await act(async () => {
      await controls.add();
    });

    expect(renderer.root.findByType('State').props.items).toEqual([expect.objectContaining({
      assetId: 77,
      localId: 'picked-1',
      previewUri: 'file:///tmp/picked-1.jpg',
      status: 'ready',
    })]);
    expect(mocks.discardPrepared).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
      await Promise.resolve();
    });
    expect(mocks.discardPrepared).toHaveBeenCalledTimes(1);
  });
});
