import {useEffect, useRef, useState} from 'react';
import {Image, type ImageProps} from 'react-native';

import {
  AnnouncementImagePolicyError,
  resolveAnnouncementImageSource,
} from './announcementImageRuntime';
import type {ImageCacheVariant} from './announcementImageCache';

export function AnnouncementCachedImage({
  assetId,
  campusId,
  resolutionKey = 0,
  signedUrl,
  userId,
  variant,
  ...imageProps
}: Omit<ImageProps, 'source'> & {
  assetId: number;
  campusId: number;
  resolutionKey?: number;
  signedUrl: string;
  userId?: number | undefined;
  variant: ImageCacheVariant;
}) {
  const [uri, setUri] = useState<string | null>(userId === undefined ? signedUrl : null);
  const requestSequence = useRef(0);
  const onErrorRef = useRef(imageProps.onError);
  onErrorRef.current = imageProps.onError;

  useEffect(() => {
    const sequence = ++requestSequence.current;
    if (userId === undefined) {
      setUri(signedUrl);
      return undefined;
    }

    const controller = new AbortController();
    setUri(null);
    void resolveAnnouncementImageSource({
      assetId,
      bypassCache: resolutionKey > 0,
      campusId,
      signal: controller.signal,
      signedUrl,
      userId,
      variant,
    }).then(
      (resolvedUri) => {
        if (!controller.signal.aborted && sequence === requestSequence.current) {
          setUri(resolvedUri);
        }
      },
      (error) => {
        if (!controller.signal.aborted && sequence === requestSequence.current) {
          if (error instanceof AnnouncementImagePolicyError) {
            setUri(null);
            onErrorRef.current?.({
              nativeEvent: {error: 'Announcement image rejected by local safety policy'},
            } as Parameters<NonNullable<ImageProps['onError']>>[0]);
          } else {
            setUri(signedUrl);
          }
        }
      },
    );

    return () => {
      controller.abort();
      requestSequence.current += 1;
    };
  }, [assetId, campusId, resolutionKey, signedUrl, userId, variant]);

  return uri ? <Image {...imageProps} source={{uri}} /> : null;
}
