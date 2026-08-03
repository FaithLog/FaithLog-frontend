import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions} from 'react-native';

import {FaithLogApiError} from '../api/client';
import type {ApiError} from '../api/types';
import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {ErrorState, Empty, Loading, ScreenHeader} from '../components/ui';
import {colors, radius, spacing, typography} from '../theme';
import {announcementApi, type AnnouncementApi} from './announcementApi';
import {AnnouncementCachedImage} from './AnnouncementCachedImage';
import {AnnouncementCategoryBadge} from './AnnouncementCategoryBadge';
import type {AnnouncementDetail, AnnouncementSummary, MediaAccessUrl} from './announcementTypes';

type ViewState =
  | {status: 'loading'; target: ViewTarget}
  | {status: 'list'; items: AnnouncementSummary[]}
  | {status: 'detail'; detail: AnnouncementDetail}
  | {status: 'error'; error: ApiError; target: ViewTarget};

type ViewTarget = {kind: 'list'} | {announcementId: number; kind: 'detail'};
type MediaTarget = 'detail' | 'list';
type DetailMediaSlot = {assetId: number; image: MediaAccessUrl | null; loading?: boolean};
type MediaState =
  | {status: 'idle'}
  | {status: 'loading'; target: MediaTarget}
  | {status: 'listReady'; thumbnails: Record<number, string>}
  | {status: 'detailReady'; slots: DetailMediaSlot[]}
  | {status: 'error'; target: MediaTarget};

export function AnnouncementRouteScreen({
  campusId,
  initialAnnouncementId = null,
  initialOpenRequestKey = 0,
  onAnalyticsViewChange,
  onBack,
  onDetailVisibilityChange,
  userId,
  api = announcementApi,
}: {
  api?: AnnouncementApi;
  campusId: number;
  initialAnnouncementId?: number | null;
  initialOpenRequestKey?: number;
  onAnalyticsViewChange?: (view: 'detail' | 'list' | null) => void;
  onBack: () => void;
  onDetailVisibilityChange?: (visible: boolean) => void;
  userId?: number | undefined;
}) {
  const initialTarget: ViewTarget = initialAnnouncementId === null
    ? {kind: 'list'}
    : {announcementId: initialAnnouncementId, kind: 'detail'};
  const [state, setState] = useState<ViewState>({status: 'loading', target: initialTarget});
  const [mediaState, setMediaState] = useState<MediaState>({status: 'idle'});
  const contentRequestSequence = useRef(0);
  const mediaRequestSequence = useRef(0);
  const detailVisible = state.status === 'detail';
  const analyticsView = state.status === 'detail'
    ? 'detail'
    : state.status === 'list' ||
        (state.status === 'loading' && state.target.kind === 'list') ||
        (state.status === 'error' && state.target.kind === 'list')
      ? 'list'
      : null;
  const detailVisibleRef = useRef(detailVisible);
  detailVisibleRef.current = detailVisible;

  const withToken = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    const token = await resolveCurrentAccessToken(() => undefined);
    if (!token) throw new FaithLogApiError({kind: 'sessionExpired', message: '로그인이 만료되었습니다.'});
    return operation(token);
  }, []);

  const loadListMedia = useCallback(async (
    items: AnnouncementSummary[],
    preserveCurrentUrls = false,
  ): Promise<Record<number, string> | null> => {
    const sequence = ++mediaRequestSequence.current;
    const assetIds = Array.from(new Set(
      items.flatMap((item) => item.imageAssetIds.slice(0, 1)),
    ));

    if (assetIds.length === 0) {
      setMediaState({status: 'listReady', thumbnails: {}});
      return {};
    }

    if (!preserveCurrentUrls) setMediaState({status: 'loading', target: 'list'});
    try {
      const accessUrls = await withToken((token) =>
        api.getMediaAccessUrls(token, campusId, assetIds));
      const thumbnails = Object.fromEntries(
        accessUrls.map((asset) => [asset.assetId, asset.thumbnailUrl]),
      );
      if (sequence === mediaRequestSequence.current) {
        setMediaState((current) => ({
          status: 'listReady',
          thumbnails: preserveCurrentUrls && current.status === 'listReady'
            ? {...current.thumbnails, ...thumbnails}
            : thumbnails,
        }));
        return thumbnails;
      }
      return null;
    } catch {
      if (sequence === mediaRequestSequence.current) {
        setMediaState((current) => preserveCurrentUrls && current.status === 'listReady'
          ? current
          : {status: 'error', target: 'list'});
      }
      return null;
    }
  }, [api, campusId, withToken]);

  const loadDetailMedia = useCallback(async (
    detail: AnnouncementDetail,
    preserveCurrentUrls = false,
  ) => {
    const sequence = ++mediaRequestSequence.current;

    if (detail.imageAssetIds.length === 0) {
      setMediaState({slots: [], status: 'detailReady'});
      return;
    }

    if (!preserveCurrentUrls) setMediaState({status: 'loading', target: 'detail'});
    try {
      const accessUrls = await withToken((token) =>
        api.getMediaAccessUrls(token, campusId, detail.imageAssetIds));
      setMediaState((current) => {
        if (sequence !== mediaRequestSequence.current) return current;
        const previousSlots = preserveCurrentUrls && current.status === 'detailReady'
          ? current.slots
          : [];
        return {
          slots: buildDetailMediaSlots(detail.imageAssetIds, accessUrls, previousSlots),
          status: 'detailReady',
        };
      });
    } catch {
      if (sequence === mediaRequestSequence.current) {
        setMediaState((current) => preserveCurrentUrls && current.status === 'detailReady'
          ? current
          : {status: 'error', target: 'detail'});
      }
    }
  }, [api, campusId, withToken]);

  const loadList = useCallback(async () => {
    const sequence = ++contentRequestSequence.current;
    mediaRequestSequence.current += 1;
    setMediaState({status: 'idle'});
    setState({status: 'loading', target: {kind: 'list'}});
    try {
      const items = await withToken((token) => api.listPublished(token, campusId));
      if (sequence !== contentRequestSequence.current) return;
      setState({status: 'list', items});
      void loadListMedia(items);
    } catch (error) {
      if (sequence === contentRequestSequence.current) {
        setState({status: 'error', error: toApiError(error), target: {kind: 'list'}});
      }
    }
  }, [api, campusId, loadListMedia, withToken]);

  const openDetail = useCallback(async (announcementId: number) => {
    const sequence = ++contentRequestSequence.current;
    mediaRequestSequence.current += 1;
    setMediaState({status: 'idle'});
    setState({status: 'loading', target: {announcementId, kind: 'detail'}});
    try {
      const detail = await withToken((token) => api.getDetail(token, campusId, announcementId));
      if (sequence !== contentRequestSequence.current) return;
      setState({status: 'detail', detail});
      void loadDetailMedia(detail);
    } catch (error) {
      if (sequence === contentRequestSequence.current) {
        setState({
          status: 'error',
          error: toApiError(error),
          target: {announcementId, kind: 'detail'},
        });
      }
    }
  }, [api, campusId, loadDetailMedia, withToken]);

  useEffect(() => {
    if (initialAnnouncementId !== null) void openDetail(initialAnnouncementId);
    else void loadList();
    return () => {
      contentRequestSequence.current += 1;
      mediaRequestSequence.current += 1;
    };
  }, [initialAnnouncementId, initialOpenRequestKey, loadList, openDetail]);

  useEffect(() => {
    onDetailVisibilityChange?.(detailVisible);
  }, [detailVisible, onDetailVisibilityChange]);

  useEffect(() => {
    onAnalyticsViewChange?.(analyticsView);
  }, [analyticsView, onAnalyticsViewChange]);

  useEffect(() => () => {
    onAnalyticsViewChange?.(null);
  }, [onAnalyticsViewChange]);

  useEffect(() => () => {
    if (detailVisibleRef.current) onDetailVisibilityChange?.(false);
  }, [onDetailVisibilityChange]);

  if (state.status === 'loading') {
    const message = state.target.kind === 'detail'
      ? '공지 상세를 불러오고 있습니다.'
      : '공지를 불러오고 있습니다.';
    return <View style={styles.stateHost}><Loading message={message} /></View>;
  }
  if (state.status === 'error') {
    const target = state.target;
    const retry = target.kind === 'detail'
      ? () => openDetail(target.announcementId)
      : loadList;
    const retryLabel = target.kind === 'detail'
      ? '공지 상세 다시 불러오기'
      : '공지 목록 다시 불러오기';
    const leaveError = target.kind === 'detail' ? loadList : onBack;
    return (
      <View style={styles.stateHost}>
        <CompactBackButton onPress={leaveError} />
        <ErrorState title="공지를 불러오지 못했습니다" message={safeMessage(state.error)} actionLabel="다시 시도" actionAccessibilityLabel={retryLabel} onActionPress={retry} />
      </View>
    );
  }
  if (state.status === 'detail') {
    const slots = mediaState.status === 'detailReady'
      ? mediaState.slots
      : mediaState.status === 'error' && mediaState.target === 'detail'
        ? state.detail.imageAssetIds.map((assetId) => ({assetId, image: null}))
        : state.detail.imageAssetIds.map((assetId) => ({assetId, image: null, loading: true}));
    const detailMediaStatus = mediaState.status === 'loading' && mediaState.target === 'detail'
      ? 'loading'
      : mediaState.status === 'error' && mediaState.target === 'detail'
        ? 'error'
        : slots.some((slot) => slot.image === null)
          ? 'error'
          : 'ready';
    return <AnnouncementDetailScreen campusId={campusId} detail={state.detail} mediaStatus={detailMediaStatus} onBack={loadList} onMediaRetry={() => loadDetailMedia(state.detail, true)} slots={slots} userId={userId} />;
  }
  const thumbnails = mediaState.status === 'listReady' ? mediaState.thumbnails : {};
  const listMediaStatus = mediaState.status === 'loading' && mediaState.target === 'list'
    ? 'loading'
    : mediaState.status === 'error' && mediaState.target === 'list'
      ? 'error'
      : 'ready';
  return <AnnouncementListScreen campusId={campusId} items={state.items} mediaStatus={listMediaStatus} onBack={onBack} onMediaRetry={() => loadListMedia(state.items, true)} onOpen={openDetail} onRefresh={loadList} onThumbnailRetry={async (assetId) => (await loadListMedia(state.items, true))?.[assetId] !== undefined} thumbnails={thumbnails} userId={userId} />;
}

export function AnnouncementListScreen({
  campusId,
  items,
  mediaStatus,
  onBack,
  onMediaRetry,
  onOpen,
  onRefresh,
  onThumbnailRetry,
  thumbnails,
  userId,
}: {
  campusId: number;
  items: AnnouncementSummary[];
  mediaStatus: 'error' | 'loading' | 'ready';
  onBack: () => void;
  onMediaRetry: () => void;
  onOpen: (id: number) => void;
  onRefresh: () => void;
  onThumbnailRetry: (assetId: number) => Promise<boolean>;
  thumbnails: Record<number, string>;
  userId?: number | undefined;
}) {
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const categories = Array.from(
    new Map(items.map((item) => [item.category.id, item.category])).values(),
  ).sort((left, right) => left.sortOrder - right.sortOrder);
  const filtered = categoryId === null
    ? items
    : items.filter((item) => item.category.id === categoryId);
  const pinned = filtered.filter((item) => item.pinned);
  const rest = filtered.filter((item) => !item.pinned);
  const ordered = [...pinned, ...rest];
  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={ordered}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<Empty title="등록된 공지가 없습니다" message="새 공지가 게시되면 이곳에서 확인할 수 있습니다." />}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <ScreenHeader
            action={<CompactBackButton onPress={onBack} />}
            eyebrow="캠퍼스 소식"
            subtitle="중요한 소식을 빠르게 확인하세요."
            title="공지"
          />
          <View accessibilityRole="radiogroup" style={styles.categoryFilters}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{checked: categoryId === null}}
              onPress={() => setCategoryId(null)}
              style={[styles.categoryFilter, categoryId === null && styles.categoryFilterActive]}
            >
              <Text style={[styles.categoryFilterText, categoryId === null && styles.categoryFilterTextActive]}>전체</Text>
            </Pressable>
            {categories.map((category) => (
              <Pressable
                accessibilityLabel={`${category.name} 공지만 보기`}
                accessibilityRole="radio"
                accessibilityState={{checked: categoryId === category.id}}
                key={category.id}
                onPress={() => setCategoryId(category.id)}
                style={[styles.categoryFilter, categoryId === category.id && styles.categoryFilterActive]}
              >
                <View style={[styles.categoryFilterDot, {backgroundColor: category.color}]} />
                <Text style={[styles.categoryFilterText, categoryId === category.id && styles.categoryFilterTextActive]}>{category.name}</Text>
              </Pressable>
            ))}
          </View>
          <MediaLoadNotice
            errorMessage="미리보기 이미지를 불러오지 못했습니다."
            loadingMessage="미리보기 이미지를 불러오고 있습니다."
            onRetry={onMediaRetry}
            retryAccessibilityLabel="공지 미리보기 이미지 주소 다시 불러오기"
            status={mediaStatus}
          />
        </View>
      }
      onRefresh={onRefresh}
      refreshing={false}
      renderItem={({item}) => <AnnouncementRow campusId={campusId} item={item} mediaPending={mediaStatus === 'loading'} onPress={onOpen} onThumbnailRetry={onThumbnailRetry} thumbnailUrl={item.imageAssetIds[0] ? thumbnails[item.imageAssetIds[0]] : undefined} userId={userId} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

const AnnouncementRow = memo(function AnnouncementRow({campusId, item, mediaPending, onPress, onThumbnailRetry, thumbnailUrl, userId}: {campusId: number; item: AnnouncementSummary; mediaPending: boolean; onPress: (id: number) => void; onThumbnailRetry: (assetId: number) => Promise<boolean>; thumbnailUrl: string | undefined; userId?: number | undefined}) {
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={`${item.category.name} 공지 ${item.title} 상세 보기`}
        accessibilityRole="button"
        onPress={() => onPress(item.id)}
        style={({pressed}) => [styles.cardOpen, pressed && styles.pressed]}>
        <View style={styles.rowTop}><AnnouncementCategoryBadge category={item.category} />{item.pinned ? <Text style={styles.pinned}>상단 고정</Text> : null}</View>
        <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
        <Text style={styles.date}>{formatDate(item.publishedAt ?? item.publishAt)}</Text>
      </Pressable>
      {item.imageAssetIds[0] ? <RetryableThumbnail assetId={item.imageAssetIds[0]} campusId={campusId} mediaPending={mediaPending} onMediaRetry={() => onThumbnailRetry(item.imageAssetIds[0]!)} onOpen={() => onPress(item.id)} title={item.title} url={thumbnailUrl} userId={userId} /> : null}
    </View>
  );
});

export function AnnouncementDetailScreen({
  campusId,
  detail,
  mediaStatus,
  onBack,
  onMediaRetry,
  slots,
  userId,
}: {
  campusId: number;
  detail: AnnouncementDetail;
  mediaStatus: 'error' | 'loading' | 'ready';
  onBack: () => void;
  onMediaRetry: () => void;
  slots: DetailMediaSlot[];
  userId?: number | undefined;
}) {
  const {width} = useWindowDimensions();
  const imageWidth = Math.max(240, width - spacing.screenX * 2);
  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={[]}
      ListHeaderComponent={
        <View style={styles.detail}>
          <ScreenHeader action={<CompactBackButton onPress={onBack} />} title="공지 상세" />
          <AnnouncementCategoryBadge category={detail.category} />
          <Text accessibilityRole="header" style={styles.detailTitle}>{detail.title}</Text>
          <Text style={styles.date}>{formatDate(detail.publishedAt ?? detail.publishAt)}</Text>
          <Text style={styles.body}>{detail.body}</Text>
          {detail.imageAssetIds.length > 0 ? <Text style={styles.imageHeading}>첨부 이미지</Text> : null}
          <MediaLoadNotice
            errorMessage="첨부 이미지 주소를 불러오지 못했습니다."
            loadingMessage="첨부 이미지 주소를 불러오고 있습니다."
            onRetry={onMediaRetry}
            retryAccessibilityLabel="공지 첨부 이미지 주소 다시 불러오기"
            status={mediaStatus}
          />
          {slots.length > 0 ? (
            <FlatList
              accessibilityLabel="공지 첨부 이미지 목록"
              data={slots}
              decelerationRate="fast"
              horizontal
              keyExtractor={(item) => String(item.assetId)}
              pagingEnabled
              renderItem={({index, item}) => item.image ? (
                <RetryableDetailImage campusId={campusId} image={item.image} imageWidth={imageWidth} index={index} onMediaRetry={onMediaRetry} userId={userId} />
              ) : item.loading ? (
                <LoadingDetailImage imageWidth={imageWidth} index={index} />
              ) : (
                <MissingDetailImage imageWidth={imageWidth} index={index} onRetry={onMediaRetry} />
              )}
              showsHorizontalScrollIndicator={false}
              snapToInterval={imageWidth}
            />
          ) : null}
        </View>
      }
      renderItem={null}
      showsVerticalScrollIndicator={false}
    />
  );
}

function LoadingDetailImage({imageWidth, index}: {imageWidth: number; index: number}) {
  return (
    <View
      accessibilityLabel={`공지 첨부 이미지 ${index + 1} 주소 불러오는 중`}
      accessibilityLiveRegion="polite"
      style={[styles.imageFrame, styles.loadingImage, {width: imageWidth}]}
    >
      <Text style={styles.mediaStatus}>이미지 준비 중</Text>
    </View>
  );
}

function MissingDetailImage({
  imageWidth,
  index,
  onRetry,
}: {
  imageWidth: number;
  index: number;
  onRetry: () => void;
}) {
  const displayIndex = index + 1;
  return (
    <View
      style={[styles.imageFrame, styles.missingImage, {width: imageWidth}]}
    >
      <Text
        accessibilityLabel={`공지 첨부 이미지 ${displayIndex}를 표시할 수 없음`}
        accessibilityRole="alert"
        style={styles.mediaStatus}
      >
        이미지를 표시하지 못했습니다.
      </Text>
      <Pressable
        accessibilityLabel={`공지 첨부 이미지 ${displayIndex} 다시 불러오기`}
        accessibilityRole="button"
        onPress={onRetry}
        style={({pressed}) => [styles.inlineRetry, pressed && styles.pressed]}
      >
        <Text style={styles.inlineRetryText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

function MediaLoadNotice({
  errorMessage,
  loadingMessage,
  onRetry,
  retryAccessibilityLabel,
  status,
}: {
  errorMessage: string;
  loadingMessage: string;
  onRetry: () => void;
  retryAccessibilityLabel: string;
  status: 'error' | 'loading' | 'ready';
}) {
  if (status === 'ready') return null;
  if (status === 'loading') {
    return <Text accessibilityLiveRegion="polite" style={styles.mediaStatus}>{loadingMessage}</Text>;
  }
  return (
    <View accessibilityRole="alert" style={styles.mediaError}>
      <Text style={styles.mediaStatus}>{errorMessage}</Text>
      <Pressable
        accessibilityLabel={retryAccessibilityLabel}
        accessibilityRole="button"
        onPress={onRetry}
        style={({pressed}) => [styles.inlineRetry, pressed && styles.pressed]}
      >
        <Text style={styles.inlineRetryText}>이미지 다시 시도</Text>
      </Pressable>
    </View>
  );
}

function RetryableThumbnail({assetId, campusId, mediaPending, onMediaRetry, onOpen, title, url, userId}: {assetId: number; campusId: number; mediaPending: boolean; onMediaRetry: () => Promise<boolean>; onOpen: () => void; title: string; url: string | undefined; userId?: number | undefined}) {
  const [status, setStatus] = useState<'error' | 'loaded' | 'loading'>(
    mediaPending || url ? 'loading' : 'error',
  );
  const [retryKey, setRetryKey] = useState(0);
  const retryAttempt = useRef(0);
  const latestMediaPending = useRef(mediaPending);
  const latestUrl = useRef(url);
  latestMediaPending.current = mediaPending;
  latestUrl.current = url;
  const imageIdentity = `${url ?? 'missing'}:${retryKey}`;
  const latestImageIdentity = useRef(imageIdentity);
  latestImageIdentity.current = imageIdentity;

  useEffect(() => {
    retryAttempt.current += 1;
    setStatus(mediaPending || url ? 'loading' : 'error');
  }, [mediaPending, url]);

  const retry = async () => {
    const attempt = ++retryAttempt.current;
    setStatus('loading');
    setRetryKey((current) => current + 1);
    try {
      const refreshed = await onMediaRetry();
      if (
        attempt === retryAttempt.current &&
        !refreshed &&
        !latestMediaPending.current &&
        !latestUrl.current
      ) setStatus('error');
    } catch {
      if (
        attempt === retryAttempt.current &&
        !latestMediaPending.current &&
        !latestUrl.current
      ) setStatus('error');
    }
  };

  return (
    <View style={styles.thumbnailFrame}>
      {url ? <AnnouncementCachedImage
        accessible={false}
        accessibilityLabel="공지 미리보기 이미지"
        assetId={assetId}
        campusId={campusId}
        onError={() => {
          if (latestImageIdentity.current === imageIdentity) setStatus('error');
        }}
        onLoad={() => {
          if (latestImageIdentity.current === imageIdentity) setStatus('loaded');
        }}
        resolutionKey={retryKey}
        resizeMode="cover"
        signedUrl={url}
        style={styles.thumbnail}
        userId={userId}
        variant="thumbnail"
      /> : null}
      {status === 'loading' ? (
        <View accessibilityLabel={`${title} 미리보기 이미지 불러오는 중`} style={styles.imageFallback}>
          <Text style={styles.mediaStatus}>이미지 불러오는 중</Text>
        </View>
      ) : null}
      {status === 'error' ? (
        <View accessibilityRole="alert" style={styles.imageFallback}>
          <Text style={styles.mediaStatus}>이미지를 표시하지 못했습니다.</Text>
          <Pressable
            accessibilityLabel={`${title} 미리보기 이미지 다시 불러오기`}
            accessibilityRole="button"
            onPress={(event?: {stopPropagation?: () => void}) => {
              event?.stopPropagation?.();
              void retry();
            }}
            style={({pressed}) => [styles.inlineRetry, pressed && styles.pressed]}
          >
            <Text style={styles.inlineRetryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}
      {status === 'loaded' ? (
        <Pressable
          accessibilityElementsHidden
          accessibilityLabel={`${title} 미리보기 이미지로 상세 보기`}
          accessibilityRole="button"
          accessible={false}
          importantForAccessibility="no"
          onPress={onOpen}
          style={styles.imageOpenOverlay}
        />
      ) : null}
    </View>
  );
}

function RetryableDetailImage({
  campusId,
  image,
  imageWidth,
  index,
  onMediaRetry,
  userId,
}: {
  campusId: number;
  image: MediaAccessUrl;
  imageWidth: number;
  index: number;
  onMediaRetry: () => void;
  userId?: number | undefined;
}) {
  const [status, setStatus] = useState<'error' | 'loaded' | 'loading'>('loading');
  const [retryKey, setRetryKey] = useState(0);
  const displayIndex = index + 1;
  const imageIdentity = `${image.assetId}:${image.detailUrl}:${retryKey}`;
  const latestImageIdentity = useRef(imageIdentity);
  latestImageIdentity.current = imageIdentity;

  useEffect(() => {
    setStatus('loading');
  }, [image.assetId, image.detailUrl]);

  const retry = () => {
    setStatus('loading');
    setRetryKey((current) => current + 1);
    onMediaRetry();
  };

  return (
    <View style={[styles.imageFrame, {width: imageWidth}]}>
      <AnnouncementCachedImage
        accessible
        accessibilityLabel={`공지 첨부 이미지 ${displayIndex}`}
        accessibilityRole="image"
        assetId={image.assetId}
        campusId={campusId}
        onError={() => {
          if (latestImageIdentity.current === imageIdentity) setStatus('error');
        }}
        onLoad={() => {
          if (latestImageIdentity.current === imageIdentity) setStatus('loaded');
        }}
        resolutionKey={retryKey}
        resizeMode="cover"
        signedUrl={image.detailUrl}
        style={styles.image}
        userId={userId}
        variant="detail"
      />
      {status === 'loading' ? (
        <View
          accessibilityLabel={`공지 첨부 이미지 ${displayIndex} 불러오는 중`}
          accessibilityLiveRegion="polite"
          style={styles.imageFallback}
        >
          <Text style={styles.mediaStatus}>이미지 불러오는 중</Text>
        </View>
      ) : null}
      {status === 'error' ? (
        <View accessibilityRole="alert" style={styles.imageFallback}>
          <Text style={styles.mediaStatus}>이미지를 표시하지 못했습니다.</Text>
          <Pressable
            accessibilityLabel={`공지 첨부 이미지 ${displayIndex} 다시 불러오기`}
            accessibilityRole="button"
            onPress={retry}
            style={({pressed}) => [styles.inlineRetry, pressed && styles.pressed]}
          >
            <Text style={styles.inlineRetryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function buildDetailMediaSlots(
  assetIds: readonly number[],
  accessUrls: readonly MediaAccessUrl[],
  previousSlots: readonly DetailMediaSlot[],
): DetailMediaSlot[] {
  const accessUrlById = new Map(accessUrls.map((asset) => [asset.assetId, asset]));
  const previousUrlById = new Map(
    previousSlots.flatMap((slot) => slot.image ? [[slot.assetId, slot.image] as const] : []),
  );
  return assetIds.map((assetId) => ({
    assetId,
    image: accessUrlById.get(assetId) ?? previousUrlById.get(assetId) ?? null,
  }));
}

function CompactBackButton({onPress}: {onPress: () => void}) {
  return <Pressable accessibilityLabel="공지 화면에서 뒤로 이동" accessibilityRole="button" hitSlop={6} onPress={onPress} style={({pressed}) => [styles.compactButton, pressed && styles.pressed]}><Text style={styles.compactButtonText}>뒤로</Text></Pressable>;
}

function formatDate(value: string | null) { if (!value) return '게시 시각 미정'; return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value)); }
function toApiError(error: unknown): ApiError { if (error instanceof FaithLogApiError) return error.detail; return {kind: 'error', message: '공지를 불러오지 못했습니다.'}; }
function safeMessage(error: ApiError) { if (error.kind === 'permissionDenied') return '현재 계정으로는 이 공지를 볼 수 없습니다.'; if (error.code === 'API_CONTRACT_PENDING') return '공지 기능을 준비하고 있습니다.'; return '잠시 후 다시 시도해 주세요.'; }

const styles = StyleSheet.create({
  body: {...typography.body, color: colors.textSecondary, lineHeight: 24},
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    gap: 10,
    padding: spacing.card,
  },
  cardOpen: {gap: 10},
  categoryFilter: {alignItems: 'center', borderColor: colors.borderSoft, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 44, paddingHorizontal: 12},
  categoryFilterActive: {backgroundColor: colors.primarySoft, borderColor: colors.primarySoft},
  categoryFilterDot: {borderRadius: 4, height: 8, width: 8},
  categoryFilters: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  categoryFilterText: {color: colors.textSecondary, fontSize: 13, fontWeight: '700'},
  categoryFilterTextActive: {color: colors.primary},
  compactButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  compactButtonText: {color: colors.primary, fontSize: 13, fontWeight: '700'},
  date: {color: colors.textMuted, fontSize: 13, lineHeight: 18},
  detail: {gap: 14},
  detailTitle: {...typography.screenTitle, color: colors.textPrimary},
  image: {aspectRatio: 4 / 3, width: '100%'},
  imageFallback: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    bottom: 0,
    gap: 8,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  imageFrame: {
    alignSelf: 'center',
    aspectRatio: 4 / 3,
    backgroundColor: colors.borderSoft,
    borderRadius: radius.item,
    overflow: 'hidden',
  },
  imageHeading: {...typography.cardTitle, color: colors.textPrimary, marginTop: 8},
  imageOpenOverlay: {bottom: 0, left: 0, position: 'absolute', right: 0, top: 0},
  inlineRetry: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  inlineRetryText: {color: colors.primary, fontSize: 13, fontWeight: '700'},
  listContent: {
    flexGrow: 1,
    gap: spacing.gap,
    paddingBottom: 120,
    paddingHorizontal: spacing.screenX,
    paddingTop: 20,
  },
  listHeader: {gap: 14},
  mediaError: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    gap: 8,
    padding: 12,
  },
  mediaStatus: {color: colors.textMuted, fontSize: 13, lineHeight: 18},
  loadingImage: {alignItems: 'center', justifyContent: 'center'},
  missingImage: {alignItems: 'center', gap: 8, justifyContent: 'center'},
  pinned: {color: colors.primary, fontSize: 12, fontWeight: '700'},
  pressed: {opacity: 0.72},
  rowTop: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  stateHost: {flex: 1, gap: 16, justifyContent: 'center', padding: spacing.screenX},
  thumbnail: {height: 92, width: '100%'},
  thumbnailFrame: {
    backgroundColor: colors.borderSoft,
    borderRadius: radius.control,
    height: 92,
    overflow: 'hidden',
    width: '100%',
  },
  title: {...typography.cardTitle, color: colors.textPrimary},
});
