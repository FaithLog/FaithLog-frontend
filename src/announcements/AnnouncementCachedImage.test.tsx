import React from 'react';
import {act, create} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

const resolveImage = vi.hoisted(() => vi.fn());

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  return {
    Image: (props: Record<string, unknown>) => ReactModule.createElement('Image', props),
  };
});

vi.mock('./announcementImageRuntime', () => {
  class TestAnnouncementImagePolicyError extends Error {}
  return {
    AnnouncementImagePolicyError: TestAnnouncementImagePolicyError,
    resolveAnnouncementImageSource: resolveImage,
  };
});

import {AnnouncementCachedImage} from './AnnouncementCachedImage';
import {AnnouncementImagePolicyError} from './announcementImageRuntime';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('AnnouncementCachedImage rendered resolution', () => {
  it('renders the cache-backed URI and ignores a stale signed-URL resolution', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    resolveImage.mockReset()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<AnnouncementCachedImage
        accessibilityLabel="공지 이미지"
        assetId={7}
        campusId={9}
        signedUrl="https://signed.example/first"
        userId={42}
        variant="thumbnail"
      />);
      await settle();
    });
    expect(findImages(renderer)).toHaveLength(0);

    await act(async () => {
      renderer.update(<AnnouncementCachedImage
        accessibilityLabel="공지 이미지"
        assetId={7}
        campusId={9}
        signedUrl="https://signed.example/second"
        userId={42}
        variant="thumbnail"
      />);
      second.resolve('file:///cache/second.jpg');
      await settle();
    });
    expect(findImage(renderer).props.source).toEqual({
      uri: 'file:///cache/second.jpg',
    });

    await act(async () => {
      first.resolve('file:///cache/stale.jpg');
      await settle();
    });
    expect(findImage(renderer).props.source).toEqual({
      uri: 'file:///cache/second.jpg',
    });
  });

  it('uses the validated signed URL directly when no user cache namespace is available', async () => {
    resolveImage.mockReset();
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<AnnouncementCachedImage
        accessibilityLabel="공지 이미지"
        assetId={7}
        campusId={9}
        signedUrl="https://signed.example/direct"
        variant="detail"
      />);
      await settle();
    });

    expect(findImage(renderer).props.source).toEqual({
      uri: 'https://signed.example/direct',
    });
    expect(resolveImage).not.toHaveBeenCalled();
  });

  it('requests a cache bypass when retry resolutionKey changes after an image error', async () => {
    resolveImage.mockReset().mockResolvedValue('file:///cache/image.jpg');
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<AnnouncementCachedImage
        accessibilityLabel="공지 이미지"
        assetId={7}
        campusId={9}
        resolutionKey={0}
        signedUrl="https://signed.example/image"
        userId={42}
        variant="detail"
      />);
      await settle();
    });

    await act(async () => {
      renderer.update(<AnnouncementCachedImage
        accessibilityLabel="공지 이미지"
        assetId={7}
        campusId={9}
        resolutionKey={1}
        signedUrl="https://signed.example/image"
        userId={42}
        variant="detail"
      />);
      await settle();
    });

    expect(resolveImage).toHaveBeenLastCalledWith(expect.objectContaining({bypassCache: true}));
  });

  it('fails closed and notifies the rendered item when local byte policy rejects the image', async () => {
    const onError = vi.fn();
    resolveImage.mockReset().mockRejectedValue(new AnnouncementImagePolicyError('too large'));
    let renderer!: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(<AnnouncementCachedImage
        accessibilityLabel="공지 이미지"
        assetId={7}
        campusId={9}
        onError={onError}
        signedUrl="https://signed.example/oversized"
        userId={42}
        variant="detail"
      />);
      await settle();
    });

    expect(findImages(renderer)).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

function findImages(renderer: ReturnType<typeof create>) {
  return renderer.root.findAll((node) => String(node.type) === 'Image');
}

function findImage(renderer: ReturnType<typeof create>) {
  const image = findImages(renderer)[0];
  if (!image) throw new Error('Expected a rendered Image');
  return image;
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
