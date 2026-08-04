import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {colors, radius, spacing} from '../theme';
import {announcementApi, type AnnouncementApi} from './announcementApi';
import {AnnouncementCategoryBadge} from './AnnouncementCategoryBadge';
import type {AnnouncementSummary} from './announcementTypes';

type ContentState =
  | {status: 'loading'}
  | {status: 'ready'; items: AnnouncementSummary[]}
  | {status: 'error'};

export function HomeAnnouncementSection({
  api = announcementApi,
  campusId,
  onOpenAll,
  onOpenAnnouncement,
}: {
  api?: AnnouncementApi;
  campusId: number;
  onOpenAll: () => void;
  onOpenAnnouncement: (announcementId: number) => void;
  userId?: number | undefined;
}) {
  const [content, setContent] = useState<ContentState>({status: 'loading'});
  const contentSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++contentSequence.current;
    setContent({status: 'loading'});
    try {
      const token = await resolveCurrentAccessToken(() => undefined);
      if (!token) throw new Error('missing access token');
      const items = await api.listPublished(token, campusId);
      if (sequence !== contentSequence.current) return;
      const visible = selectHomeAnnouncements(items);
      setContent({status: 'ready', items: visible});
    } catch {
      if (sequence !== contentSequence.current) return;
      setContent({status: 'error'});
    }
  }, [api, campusId]);

  useEffect(() => {
    void load();
    return () => {
      contentSequence.current += 1;
    };
  }, [load]);

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
              item={item}
              key={item.id}
              onPress={onOpenAnnouncement}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function selectHomeAnnouncements(items: AnnouncementSummary[]) {
  const newestFirst = (left: AnnouncementSummary, right: AnnouncementSummary) =>
    announcementPublishedTime(right) - announcementPublishedTime(left) || right.id - left.id;
  const pinned = items.filter((item) => item.pinned).sort(newestFirst)[0];
  const now = new Date();
  const weekStart = startOfLocalWeek(now).getTime();
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  const latest = items
    .filter((item) => {
      if (item.pinned) return false;
      const publishedAt = announcementPublishedTime(item);
      return publishedAt >= weekStart && publishedAt < weekEnd;
    })
    .sort(newestFirst)[0];
  return [pinned, latest].filter((item): item is AnnouncementSummary => item !== undefined);
}

function startOfLocalWeek(value: Date) {
  const start = new Date(value);
  const dayFromMonday = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - dayFromMonday);
  return start;
}

function announcementPublishedTime(item: AnnouncementSummary) {
  const timestamp = Date.parse(item.publishedAt ?? item.publishAt ?? '');
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

const HomeAnnouncementCard = memo(function HomeAnnouncementCard({
  item,
  onPress,
}: {
  item: AnnouncementSummary;
  onPress: (id: number) => void;
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
            <View style={styles.cardBadges}>
              <AnnouncementCategoryBadge category={item.category} />
              {item.pinned ? <Text style={styles.pinned}>상단 고정</Text> : null}
            </View>
            <Text style={styles.date}>{publishedAt}</Text>
          </View>
          <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
        </View>
      </Pressable>
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
  card: {backgroundColor: colors.surface, borderColor: colors.borderSoft, borderRadius: radius.item, borderWidth: 1, minHeight: 74, paddingHorizontal: 13, paddingVertical: 11},
  cardBadges: {alignItems: 'center', flexDirection: 'row', gap: 7},
  cardCopy: {flex: 1, gap: 6, minWidth: 0},
  cardOpen: {flex: 1, justifyContent: 'center', minHeight: 50, minWidth: 0},
  cardMeta: {alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between'},
  cards: {gap: 8},
  date: {color: colors.textMuted, fontSize: 12, lineHeight: 16},
  header: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  inlineState: {alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.item, flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 14},
  pinned: {color: colors.primary, fontSize: 11, fontWeight: '700'},
  pressed: {opacity: 0.72},
  retryButton: {alignItems: 'center', borderRadius: radius.pill, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10},
  retryText: {color: colors.primary, fontSize: 12, fontWeight: '700'},
  section: {gap: spacing.gap},
  sectionTitle: {color: colors.textPrimary, fontSize: 19, fontWeight: '700', lineHeight: 28},
  statusText: {color: colors.textMuted, flex: 1, fontSize: 13, lineHeight: 20},
  title: {color: colors.textPrimary, fontSize: 15, fontWeight: '700', lineHeight: 21},
});
