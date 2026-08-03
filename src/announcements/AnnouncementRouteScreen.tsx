import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions} from 'react-native';

import {FaithLogApiError} from '../api/client';
import type {ApiError} from '../api/types';
import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {ErrorState, Empty, Loading, ScreenHeader} from '../components/ui';
import {colors, radius, spacing, typography} from '../theme';
import {announcementApi, type AnnouncementApi} from './announcementApi';
import {AnnouncementCategoryBadge} from './AnnouncementCategoryBadge';
import type {AnnouncementDetail, AnnouncementSummary, MediaAccessUrl} from './announcementTypes';

type ViewState =
  | {status: 'loading'}
  | {status: 'list'; items: AnnouncementSummary[]; thumbnails: Record<number, string>}
  | {status: 'detail'; detail: AnnouncementDetail; images: MediaAccessUrl[]}
  | {status: 'error'; error: ApiError};

export function AnnouncementRouteScreen({
  campusId,
  initialAnnouncementId = null,
  onBack,
  api = announcementApi,
}: {
  api?: AnnouncementApi;
  campusId: number;
  initialAnnouncementId?: number | null;
  onBack: () => void;
}) {
  const [state, setState] = useState<ViewState>({status: 'loading'});
  const requestSequence = useRef(0);

  const withToken = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    const token = await resolveCurrentAccessToken(() => undefined);
    if (!token) throw new FaithLogApiError({kind: 'sessionExpired', message: '로그인이 만료되었습니다.'});
    return operation(token);
  }, []);

  const loadList = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setState({status: 'loading'});
    try {
      const items = await withToken((token) => api.listPublished(token, campusId));
      const thumbnailIds = items.flatMap((item) => item.imageAssetIds.slice(0, 1));
      const accessUrls = thumbnailIds.length
        ? await withToken((token) => api.getMediaAccessUrls(token, campusId, thumbnailIds))
        : [];
      const thumbnails = Object.fromEntries(
        accessUrls.map((asset) => [asset.assetId, asset.thumbnailUrl]),
      );
      if (sequence === requestSequence.current) setState({status: 'list', items, thumbnails});
    } catch (error) {
      if (sequence === requestSequence.current) setState({status: 'error', error: toApiError(error)});
    }
  }, [api, campusId, withToken]);

  const openDetail = useCallback(async (announcementId: number) => {
    const sequence = ++requestSequence.current;
    setState({status: 'loading'});
    try {
      const detail = await withToken((token) => api.getDetail(token, campusId, announcementId));
      const images = detail.imageAssetIds.length
        ? await withToken((token) => api.getMediaAccessUrls(token, campusId, detail.imageAssetIds))
        : [];
      if (sequence === requestSequence.current) setState({status: 'detail', detail, images});
    } catch (error) {
      if (sequence === requestSequence.current) setState({status: 'error', error: toApiError(error)});
    }
  }, [api, campusId, withToken]);

  useEffect(() => {
    if (initialAnnouncementId) void openDetail(initialAnnouncementId);
    else void loadList();
    return () => { requestSequence.current += 1; };
  }, [initialAnnouncementId, loadList, openDetail]);

  if (state.status === 'loading') return <View style={styles.stateHost}><Loading message="공지를 불러오고 있습니다." /></View>;
  if (state.status === 'error') return <View style={styles.stateHost}><ErrorState title="공지를 불러오지 못했습니다" message={safeMessage(state.error)} actionLabel="다시 시도" actionAccessibilityLabel="공지 다시 불러오기" onActionPress={loadList} /></View>;
  if (state.status === 'detail') {
    return <AnnouncementDetailScreen detail={state.detail} images={state.images} onBack={loadList} />;
  }
  return <AnnouncementListScreen items={state.items} thumbnails={state.thumbnails} onBack={onBack} onOpen={openDetail} onRefresh={loadList} />;
}

export function AnnouncementListScreen({items, onBack, onOpen, onRefresh, thumbnails}: {items: AnnouncementSummary[]; onBack: () => void; onOpen: (id: number) => void; onRefresh: () => void; thumbnails: Record<number, string>}) {
  const pinned = items.filter((item) => item.pinned);
  const rest = items.filter((item) => !item.pinned);
  const ordered = [...pinned, ...rest];
  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={ordered}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<Empty title="등록된 공지가 없습니다" message="새 공지가 게시되면 이곳에서 확인할 수 있습니다." />}
      ListHeaderComponent={<ScreenHeader eyebrow="캠퍼스 소식" title="공지" subtitle="중요한 소식을 빠르게 확인하세요." action={<CompactBackButton onPress={onBack} />} />}
      onRefresh={onRefresh}
      refreshing={false}
      renderItem={({item}) => <AnnouncementRow item={item} onPress={onOpen} thumbnailUrl={item.imageAssetIds[0] ? thumbnails[item.imageAssetIds[0]] : undefined} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

const AnnouncementRow = memo(function AnnouncementRow({item, onPress, thumbnailUrl}: {item: AnnouncementSummary; onPress: (id: number) => void; thumbnailUrl: string | undefined}) {
  return (
    <Pressable accessibilityLabel={`${item.category.name} 공지 ${item.title} 상세 보기`} accessibilityRole="button" onPress={() => onPress(item.id)} style={({pressed}) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.rowTop}><AnnouncementCategoryBadge category={item.category} />{item.pinned ? <Text style={styles.pinned}>상단 고정</Text> : null}</View>
      <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
      {thumbnailUrl ? <Image accessibilityLabel="공지 미리보기 이미지" source={{uri: thumbnailUrl}} style={styles.thumbnail} /> : null}
      <Text style={styles.date}>{formatDate(item.publishedAt ?? item.publishAt)}</Text>
    </Pressable>
  );
});

export function AnnouncementDetailScreen({detail, images, onBack}: {detail: AnnouncementDetail; images: MediaAccessUrl[]; onBack: () => void}) {
  const {width} = useWindowDimensions();
  const imageWidth = Math.max(240, width - spacing.screenX * 2);
  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={images}
      horizontal={false}
      keyExtractor={(item) => String(item.assetId)}
      ListHeaderComponent={<View style={styles.detail}><ScreenHeader title="공지 상세" action={<CompactBackButton onPress={onBack} />} /><AnnouncementCategoryBadge category={detail.category} /><Text accessibilityRole="header" style={styles.detailTitle}>{detail.title}</Text><Text style={styles.date}>{formatDate(detail.publishedAt ?? detail.publishAt)}</Text><Text style={styles.body}>{detail.body}</Text>{images.length ? <Text style={styles.imageHeading}>첨부 이미지</Text> : null}</View>}
      renderItem={({item}) => <View style={[styles.imageFrame, {width: imageWidth}]}><Image accessibilityLabel="공지 첨부 이미지" resizeMode="cover" source={{uri: item.detailUrl}} style={styles.image} /></View>}
      showsVerticalScrollIndicator={false}
    />
  );
}

function CompactBackButton({onPress}: {onPress: () => void}) {
  return <Pressable accessibilityLabel="공지 화면에서 뒤로 이동" accessibilityRole="button" hitSlop={6} onPress={onPress} style={({pressed}) => [styles.compactButton, pressed && styles.pressed]}><Text style={styles.compactButtonText}>뒤로</Text></Pressable>;
}

function formatDate(value: string | null) { if (!value) return '게시 시각 미정'; return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value)); }
function toApiError(error: unknown): ApiError { if (error instanceof FaithLogApiError) return error.detail; return {kind: 'error', message: '공지를 불러오지 못했습니다.'}; }
function safeMessage(error: ApiError) { if (error.kind === 'permissionDenied') return '현재 계정으로는 이 공지를 볼 수 없습니다.'; if (error.code === 'API_CONTRACT_PENDING') return '공지 기능을 준비하고 있습니다.'; return '잠시 후 다시 시도해 주세요.'; }

const styles = StyleSheet.create({
  body: {...typography.body, color: colors.textSecondary, lineHeight: 24}, card: {backgroundColor: colors.surface, borderRadius: radius.card, gap: 10, padding: spacing.card}, compactButton: {alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.pill, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12}, compactButtonText: {color: colors.primary, fontSize: 13, fontWeight: '700'}, date: {color: colors.textMuted, fontSize: 13, lineHeight: 18}, detail: {gap: 14}, detailTitle: {...typography.screenTitle, color: colors.textPrimary}, image: {height: 220, width: '100%'}, imageFrame: {alignSelf: 'center', backgroundColor: colors.borderSoft, borderRadius: radius.item, marginTop: 12, overflow: 'hidden'}, imageHeading: {...typography.cardTitle, color: colors.textPrimary, marginTop: 8}, listContent: {flexGrow: 1, gap: spacing.gap, paddingBottom: 120, paddingHorizontal: spacing.screenX, paddingTop: 20}, pinned: {color: colors.primary, fontSize: 12, fontWeight: '700'}, pressed: {opacity: 0.72}, rowTop: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'}, stateHost: {flex: 1, justifyContent: 'center', padding: spacing.screenX}, thumbnail: {borderRadius: radius.control, height: 92, width: '100%'}, title: {...typography.cardTitle, color: colors.textPrimary},
});
