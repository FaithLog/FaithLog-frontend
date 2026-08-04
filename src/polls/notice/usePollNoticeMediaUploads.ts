import {useEffect, useRef} from 'react';

import {
  createNativeAnnouncementBinaryUploader,
  discardPreparedAnnouncementImages,
} from '../../announcements/announcementNativeMedia';
import {resolveCurrentAccessToken} from '../../auth/accessTokenResolver';
import {isMockModeEnabled} from '../../api/client';
import {createMockReadyMediaAssetForCampus} from '../../api/mockAdapter';
import {mediaApi} from '../../media/mediaApi';
import type {MediaUploadItem} from '../../media/mediaUploadPolicy';
import {runMediaUpload, type MediaDirectUploadTransport} from '../../media/mediaUploadCoordinator';
import {
  createProductionPollImagePicker,
  type NormalizedPollImage,
} from './pollImagePicker';

type PollNoticeMediaUploadOptions = {
  campusId: number;
  enabled: boolean;
  items: MediaUploadItem[];
  onChange: (items: MediaUploadItem[]) => void;
};

export function usePollNoticeMediaUploads({
  campusId,
  enabled,
  items,
  onChange,
}: PollNoticeMediaUploadOptions) {
  const itemsRef = useRef(items);
  const imagesRef = useRef(new Map<string, NormalizedPollImage>());
  const operationsRef = useRef(new Map<string, AbortController>());
  const addingRef = useRef(false);
  const mountedRef = useRef(true);
  itemsRef.current = items;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const operation of operationsRef.current.values()) operation.abort();
      const remaining = [...imagesRef.current.values()];
      imagesRef.current.clear();
      void discardNormalizedImages(remaining);
    };
  }, []);

  const commit = (next: MediaUploadItem[]) => {
    if (!mountedRef.current) return;
    itemsRef.current = next;
    onChange(next);
  };
  const update = (localId: string, patch: Partial<MediaUploadItem>) => {
    commit(itemsRef.current.map((item) => item.localId === localId ? {...item, ...patch} : item));
  };

  const upload = async (image: NormalizedPollImage) => {
    const controller = new AbortController();
    operationsRef.current.set(image.localId, controller);
    update(image.localId, {status: 'uploading', progress: 0});
    try {
      const accessToken = await resolveCurrentAccessToken(() => undefined);
      if (!accessToken || controller.signal.aborted) return;
      const ready = await runMediaUpload({
        accessToken,
        api: mediaApi,
        campusId,
        image,
        onProgress: (progress) => update(image.localId, {status: 'uploading', progress}),
        signal: controller.signal,
        transport: createNativePollMediaTransport(),
      });
      update(image.localId, {
        status: 'ready',
        progress: 1,
        assetId: ready.assetId,
        sha256: ready.sha256,
      });
      // Keep the prepared local file alive while the editor is mounted so the
      // selected image remains visible after its upload completes. It is
      // discarded by remove() or the hook cleanup when the editor closes.
    } catch {
      if (!controller.signal.aborted) {
        update(image.localId, {
          status: 'failed',
          errorMessage: '이미지를 업로드하지 못했습니다. 다시 시도해 주세요.',
        });
      }
    } finally {
      operationsRef.current.delete(image.localId);
    }
  };

  return {
    add: async () => {
      if (!enabled || addingRef.current) return;
      addingRef.current = true;
      try {
        if (isMockModeEnabled()) {
          const assetId = createMockReadyMediaAssetForCampus(
            campusId,
            itemsRef.current.flatMap((item) => item.assetId ? [item.assetId] : []),
          );
          commit([...itemsRef.current, {
            localId: `mock-poll-image-${assetId}`,
            previewUri: `mock://poll-notice/${assetId}`,
            status: 'ready',
            progress: 1,
            assetId,
            sha256: assetId.toString(16).padStart(64, '0'),
          }]);
          return;
        }

        const picked = await createProductionPollImagePicker().pickAndNormalize();
        for (const image of picked) imagesRef.current.set(image.localId, image);
        commit([
          ...itemsRef.current,
          ...picked.map((image): MediaUploadItem => ({
            localId: image.localId,
            previewUri: image.uri,
            status: 'pending',
            progress: 0,
          })),
        ]);
        // Keep large selections memory-safe by uploading sequentially.
        for (const image of picked) await upload(image);
      } finally {
        addingRef.current = false;
      }
    },
    remove: (localId: string) => {
      operationsRef.current.get(localId)?.abort();
      operationsRef.current.delete(localId);
      const prepared = imagesRef.current.get(localId);
      imagesRef.current.delete(localId);
      commit(itemsRef.current.filter((item) => item.localId !== localId));
      if (prepared) void discardNormalizedImages([prepared]);
    },
    retry: async (localId: string) => {
      const image = imagesRef.current.get(localId);
      if (!enabled || !image || operationsRef.current.has(localId)) return;
      await upload(image);
    },
  };
}

function discardNormalizedImages(images: NormalizedPollImage[]) {
  return discardPreparedAnnouncementImages(images.flatMap((image, sourceIndex) =>
    image.contentType === 'image/jpeg' ? [{
      byteSize: image.byteSize,
      contentType: image.contentType,
      height: image.height,
      sha256: image.sha256,
      sourceIndex,
      uri: image.uri,
      width: image.width,
    }] : []));
}

function createNativePollMediaTransport(): MediaDirectUploadTransport {
  const upload = createNativeAnnouncementBinaryUploader();
  return {
    upload: ({headers, onProgress, signal, uploadUrl, uri}) =>
      upload({headers, localUri: uri, uploadUrl}, onProgress, signal),
  };
}
