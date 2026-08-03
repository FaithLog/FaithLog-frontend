import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {colors, radius, spacing} from '../theme';
import {announcementApi, type AnnouncementApi} from './announcementApi';
import {AnnouncementCategoryBadge} from './AnnouncementCategoryBadge';
import {AnnouncementRetryableImage} from './AnnouncementRetryableImage';
import type {AnnouncementSummary} from './announcementTypes';

type ContentState =
  | {status: 'loading'}
  | {status: 'ready'; items: AnnouncementSummary[]}
  | {status: 'error'};

type ThumbnailState =
  | {status: 'idle' | 'loading'}
  | {status: 'ready'; urls: Record<number, string>}
  | {status: 'error'};

export function HomeAnnouncementSection({
  api = announcementApi,
  campusId,
  onOpenAll,
  onOpenAnnouncement,
  userId,
}: {
  api?: AnnouncementApi;
  campusId: number;
  onOpenAll: () => void;
  onOpenAnnouncement: (announcementId: number) => void;
  userId?: number | undefined;
}) {
  const [content, setContent] = useState<ContentState>({status: 'loading'});
  const [thumbnails, setThumbnails] = useState<ThumbnailState>({status: 'idle'});
  const contentSequence = useRef(0);
  const mediaSequence = useRef(0);

  const loadThumbnails = useCallback(async (
    items: AnnouncementSummary[],
    contentRequest: number,
    exposeBatchFailure = true,
  ): Promise<Record<number, string> | null> => {
    const assetIds = Array.from(new Set(
      items.flatMap((item) => item.imageAssetIds.slice(0, 1)),
    ));
    if (assetIds.length === 0) {
      setThumbnails({status: 'ready', urls: {}});
      return {};
    }
    const mediaRequest = ++mediaSequence.current;
    if (exposeBatchFailure) setThumbnails({status: 'loading'});
    try {
      const token = await resolveCurrentAccessToken(() => undefined);
      if (!token) throw new Error('missing access token');
      const media = await api.getMediaAccessUrls(token, campusId, assetIds);
      if (contentRequest !== contentSequence.current || mediaRequest !== mediaSequence.current) {
        return null;
      }
      const urls = Object.fromEntries(media.map((item) => [item.assetId, item.thumbnailUrl]));
      setThumbnails((current) => ({
        status: 'ready',
        urls: !exposeBatchFailure && current.status === 'ready'
          ? {...current.urls, ...urls}
          : urls,
      }));
      return urls;
    } catch {
      if (
        exposeBatchFailure &&
        contentRequest === contentSequence.current &&
        mediaRequest === mediaSequence.current
      ) setThumbnails({status: 'error'});
      return null;
    }
  }, [api, campusId]);

  const load = useCallback(async () => {
    const sequence = ++contentSequence.current;
    mediaSequence.current += 1;
    setContent({status: 'loading'});
    setThumbnails({status: 'idle'});
    try {
      const token = await resolveCurrentAccessToken(() => undefined);
      if (!token) throw new Error('missing access token');
      const items = await api.listPublished(token, campusId);
      if (sequence !== contentSequence.current) return;
      const visible = selectHomeAnnouncements(items);
      setContent({status: 'ready', items: visible});
      void loadThumbnails(visible, sequence);
    } catch {
      if (sequence !== contentSequence.current) return;
      setContent({status: 'error'});
    }
  }, [api, campusId, loadThumbnails]);

  useEffect(() => {
    void load();
    return () => {
      contentSequence.current += 1;
      mediaSequence.current += 1;
    };
  }, [load]);

  const thumbnailUrls = thumbnails.status === 'ready' ? thumbnails.urls : {};

  return (
    <View accessibilityLabel="홈 공지" style={styles.section}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>공지</Text>
        <Pressable
          accessibilityLabel="캠퍼스 공지 전체 보기"
          accessibilityRole="button"
          hitSlop={7}
          onPress={onOpenAll}
          style={({pressed}) => [styles.allButtonTouch, pressed ? styles.pressed : null]}>
          <View style={styles.allButtonVisual}>
            <Text style={styles.allButtonText}>전체 보기</Text>
          </View>
        </Pressable>
      </View>

      {content.status === 'loading' ? (
        <Text accessibilityLiveRegion="polite" style={styles.statusText}>공지를 확인하고 있습니다.</Text>
      ) : content.status === 'error' ? (
        <View style={styles.inlineState}>
          <Text accessibilityRole="alert" style={styles.statusText}>공지를 불러오지 못했습니다.</Text>
          <Pressable
            accessibilityLabel="홈 공지 다시 불러오기"
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => void load()}
            style={({pressed}) => [styles.retryButton, pressed ? styles.pressed : null]}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : content.items.length === 0 ? (
        <Text style={styles.statusText}>등록된 공지가 없습니다.</Text>
      ) : (
        <View style={styles.cards}>
          {content.items.map((item) => (
            <HomeAnnouncementCard
              campusId={campusId}
              item={item}
              key={item.id}
              onPress={onOpenAnnouncement}
              thumbnailUrl={item.imageAssetIds[0] === undefined
                ? undefined
                : thumbnailUrls[item.imageAssetIds[0]]}
              onRetryThumbnail={async (assetId) => {
                const urls = await loadThumbnails(
                  content.items,
                  contentSequence.current,
                  false,
                );
                return urls?.[assetId] !== undefined;
              }}
              thumbnailPending={thumbnails.status === 'idle' || thumbnails.status === 'loading'}
              userId={userId}
            />
          ))}
          {thumbnails.status === 'error' ? (
            <Text accessibilityRole="alert" style={styles.mediaWarning}>
              이미지를 불러오지 못했지만 공지는 확인할 수 있습니다.
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function selectHomeAnnouncements(items: AnnouncementSummary[]) {
  const newestFirst = (left: AnnouncementSummary, right: AnnouncementSummary) =>
    announcementPublishedTime(right) - announcementPublishedTime(left) || right.id - left.id;
  const pinned = items.filter((item) => item.pinned).sort(newestFirst)[0];
  const latest = items.filter((item) => !item.pinned).sort(newestFirst).slice(0, 2);
  return pinned ? [pinned, ...latest] : latest;
}

function announcementPublishedTime(item: AnnouncementSummary) {
  const timestamp = Date.parse(item.publishedAt ?? item.publishAt ?? '');
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

const HomeAnnouncementCard = memo(function HomeAnnouncementCard({
  campusId,
  item,
  onPress,
  onRetryThumbnail,
  thumbnailPending,
  thumbnailUrl,
  userId,
}: {
  campusId: number;
  item: AnnouncementSummary;
  onPress: (id: number) => void;
  onRetryThumbnail: (assetId: number) => Promise<boolean>;
  thumbnailPending: boolean;
  thumbnailUrl: string | undefined;
  userId?: number | undefined;
}) {
  const publishedAt = useMemo(
    () => formatAnnouncementDate(item.publishedAt ?? item.publishAt),
    [item.publishAt, item.publishedAt],
  );
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={`${item.title} 상세 보기`}
        accessibilityRole="button"
        onPress={() => onPress(item.id)}
        style={({pressed}) => [styles.cardOpen, pressed ? styles.pressed : null]}>
        <View style={styles.cardCopy}>
          <View style={styles.cardMeta}>
            <AnnouncementCategoryBadge category={item.category} />
            {item.pinned ? <Text style={styles.pinned}>상단 고정</Text> : null}
          </View>
          <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
          <Text style={styles.date}>{publishedAt}</Text>
        </View>
      </Pressable>
      {item.imageAssetIds[0] !== undefined ? (
        <AnnouncementRetryableImage
          assetId={item.imageAssetIds[0]}
          campusId={campusId}
          imageAccessibilityLabel={`${item.title} 미리보기 이미지`}
          imageStyle={styles.thumbnail}
          loadingAccessibilityLabel={`${item.title} 미리보기 이미지 불러오는 중`}
          onRetry={() => onRetryThumbnail(item.imageAssetIds[0]!)}
          pending={thumbnailPending}
          retryAccessibilityLabel={`${item.title} 미리보기 이미지 다시 불러오기`}
          signedUrl={thumbnailUrl}
          style={styles.thumbnailFrame}
          userId={userId}
          variant="thumbnail"
        />
      ) : null}
    </View>
  );
});

function formatAnnouncementDate(value: string | null) {
  if (!value) return '게시 시각 미정';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '게시 시각 미정';
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(date);
}

const styles = StyleSheet.create({
  allButtonText: {color: colors.primary, fontSize: 12, fontWeight: '700', lineHeight: 16},
  allButtonTouch: {alignItems: 'center', justifyContent: 'center', minHeight: 44},
  allButtonVisual: {alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.pill, height: 30, justifyContent: 'center', paddingHorizontal: 10},
  card: {alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.item, flexDirection: 'row', gap: 12, minHeight: 92, padding: 14},
  cardCopy: {flex: 1, gap: 7, minWidth: 0},
  cardOpen: {flex: 1, justifyContent: 'center', minHeight: 64, minWidth: 0},
  cardMeta: {alignItems: 'center', flexDirection: 'row', gap: 8},
  cards: {gap: 8},
  date: {color: colors.textMuted, fontSize: 12, lineHeight: 16},
  header: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  inlineState: {alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.item, flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 14},
  mediaWarning: {color: colors.textMuted, fontSize: 12, lineHeight: 18, paddingHorizontal: 4},
  pinned: {color: colors.primary, fontSize: 11, fontWeight: '700'},
  pressed: {opacity: 0.72},
  retryButton: {alignItems: 'center', borderRadius: radius.pill, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10},
  retryText: {color: colors.primary, fontSize: 12, fontWeight: '700'},
  section: {gap: spacing.gap},
  sectionTitle: {color: colors.textPrimary, fontSize: 19, fontWeight: '700', lineHeight: 28},
  statusText: {color: colors.textMuted, flex: 1, fontSize: 13, lineHeight: 20},
  thumbnail: {borderRadius: radius.control, height: 64, width: 64},
  thumbnailFrame: {backgroundColor: colors.borderSoft, borderRadius: radius.control, height: 64, overflow: 'hidden', width: 64},
  title: {color: colors.textPrimary, fontSize: 15, fontWeight: '700', lineHeight: 21},
});
