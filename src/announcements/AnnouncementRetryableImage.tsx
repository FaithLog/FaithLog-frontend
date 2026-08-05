import {useEffect, useRef, useState} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {colors, radius} from '../theme';
import {AnnouncementCachedImage} from './AnnouncementCachedImage';
import type {ImageCacheVariant} from './announcementImageCache';

export function AnnouncementRetryableImage({
  assetId,
  campusId,
  imageAccessibilityLabel,
  imageStyle,
  loadingAccessibilityLabel,
  onRetry,
  pending = false,
  retryAccessibilityLabel,
  signedUrl,
  style,
  userId,
  variant,
}: {
  assetId: number;
  campusId: number;
  imageAccessibilityLabel: string;
  imageStyle: StyleProp<ImageStyle>;
  loadingAccessibilityLabel: string;
  onRetry: () => Promise<boolean | void> | boolean | void;
  pending?: boolean;
  retryAccessibilityLabel: string;
  signedUrl?: string | undefined;
  style: StyleProp<ViewStyle>;
  userId?: number | undefined;
  variant: ImageCacheVariant;
}) {
  const [resolutionKey, setResolutionKey] = useState(0);
  const [status, setStatus] = useState<'error' | 'loaded' | 'loading'>(
    pending || signedUrl ? 'loading' : 'error',
  );
  const retryAttempt = useRef(0);
  const latestPending = useRef(pending);
  const latestSignedUrl = useRef(signedUrl);
  latestPending.current = pending;
  latestSignedUrl.current = signedUrl;
  const imageIdentity = `${signedUrl ?? 'missing'}:${resolutionKey}`;
  const latestImageIdentity = useRef(imageIdentity);
  latestImageIdentity.current = imageIdentity;

  useEffect(() => {
    retryAttempt.current += 1;
    setStatus(pending || signedUrl ? 'loading' : 'error');
  }, [pending, signedUrl]);

  const retry = async (event?: {stopPropagation?: () => void}) => {
    event?.stopPropagation?.();
    const attempt = ++retryAttempt.current;
    setStatus('loading');
    setResolutionKey((current) => current + 1);
    try {
      const refreshed = await onRetry();
      if (
        attempt === retryAttempt.current &&
        refreshed === false &&
        !latestPending.current &&
        !latestSignedUrl.current
      ) setStatus('error');
    } catch {
      if (
        attempt === retryAttempt.current &&
        !latestPending.current &&
        !latestSignedUrl.current
      ) setStatus('error');
    }
  };

  return (
    <View style={[styles.frame, style]}>
      {signedUrl ? (
        <AnnouncementCachedImage
          accessible={false}
          accessibilityLabel={imageAccessibilityLabel}
          assetId={assetId}
          campusId={campusId}
          onError={() => {
            if (latestImageIdentity.current === imageIdentity) setStatus('error');
          }}
          onLoad={() => {
            if (latestImageIdentity.current === imageIdentity) setStatus('loaded');
          }}
          resolutionKey={resolutionKey}
          resizeMode="cover"
          signedUrl={signedUrl}
          style={imageStyle}
          userId={userId}
          variant={variant}
        />
      ) : null}
      {status === 'loading' ? (
        <View
          accessibilityLabel={loadingAccessibilityLabel}
          accessibilityLiveRegion="polite"
          style={styles.fallback}>
          <Text style={styles.statusText}>불러오는 중</Text>
        </View>
      ) : null}
      {status === 'error' ? (
        <View accessibilityRole="alert" style={styles.fallback}>
          <Text style={styles.statusText}>이미지 오류</Text>
          <Pressable
            accessibilityLabel={retryAccessibilityLabel}
            accessibilityRole="button"
            hitSlop={4}
            onPress={(event) => void retry(event)}
            style={({pressed}) => [styles.retry, pressed ? styles.pressed : null]}>
            <Text style={styles.retryText}>재시도</Text>
          </Pressable>
        </View>
      ) : null}
      {status === 'loaded' ? (
        <View
          accessibilityElementsHidden
          accessible={false}
          importantForAccessibility="no"
          style={styles.loadedOverlay}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    bottom: 0,
    gap: 2,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  frame: {backgroundColor: colors.borderSoft, borderRadius: radius.control, overflow: 'hidden'},
  loadedOverlay: {bottom: 0, left: 0, position: 'absolute', right: 0, top: 0},
  pressed: {opacity: 0.7},
  retry: {alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44},
  retryText: {color: colors.primary, fontSize: 11, fontWeight: '800'},
  statusText: {color: colors.textMuted, fontSize: 10, lineHeight: 12},
});
