import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {FlatList, Modal, Pressable, SafeAreaView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';

import {FaithLogApiError} from '../api/client';
import type {ApiError} from '../api/types';
import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {ErrorState, Empty, Loading, ScreenHeader} from '../components/ui';
import {colors, radius, spacing, typography} from '../theme';
import {documentMediaApi, type DocumentMediaApi} from '../media/documentMediaApi';
import type {DocumentAccessUrl} from '../media/documentMediaTypes';
import {announcementApi, type AnnouncementApi} from './announcementApi';
import {AnnouncementCachedImage} from './AnnouncementCachedImage';
import {AnnouncementCategoryBadge} from './AnnouncementCategoryBadge';
import {AnnouncementDocumentList} from './AnnouncementDocumentAttachments';
import {openAnnouncementPdf} from './announcementDocumentNativeRuntime';
import {isAnnouncementPdfCapabilityEnabled} from './announcementEnvironment';
import type {AnnouncementDetail, AnnouncementSummary, MediaAccessUrl} from './announcementTypes';

type ViewState =
  | {status: 'loading'; target: ViewTarget}
  | {status: 'list'; items: AnnouncementSummary[]}
  | {status: 'detail'; detail: AnnouncementDetail}
  | {status: 'error'; error: ApiError; target: ViewTarget};

type ViewTarget = {kind: 'list'} | {announcementId: number; kind: 'detail'};
type DetailMediaSlot = {assetId: number; image: MediaAccessUrl | null; loading?: boolean};
type MediaState =
  | {status: 'idle'}
  | {status: 'loading'; target: 'detail'}
  | {status: 'detailReady'; slots: DetailMediaSlot[]}
  | {status: 'error'; target: 'detail'};
type DocumentState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'ready'; items: DocumentAccessUrl[]}
  | {status: 'error'};

export function AnnouncementRouteScreen({
  campusId,
  initialAnnouncementId = null,
  initialOpenRequestKey = 0,
  onAnalyticsViewChange,
  onBack,
  onDetailVisibilityChange,
  userId,
  api = announcementApi,
  documentApi = documentMediaApi,
}: {
  api?: AnnouncementApi;
  documentApi?: Pick<DocumentMediaApi, 'getAccessUrls'>;
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
  const [documentState, setDocumentState] = useState<DocumentState>({status: 'idle'});
  const contentRequestSequence = useRef(0);
  const mediaRequestSequence = useRef(0);
  const documentRequestSequence = useRef(0);
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

  const openDocument = useCallback((assetId: number) => withToken((accessToken) =>
    openAnnouncementPdf({accessToken, assetId, campusId})), [campusId, withToken]);

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

  const loadDetailDocuments = useCallback(async (detail: AnnouncementDetail) => {
    const sequence = ++documentRequestSequence.current;
    if (!isAnnouncementPdfCapabilityEnabled() || detail.documentAssetIds.length === 0) {
      setDocumentState({items: [], status: 'ready'});
      return;
    }
    setDocumentState({status: 'loading'});
    try {
      const items = await withToken((token) =>
        documentApi.getAccessUrls(token, campusId, detail.documentAssetIds));
      if (sequence === documentRequestSequence.current) setDocumentState({items, status: 'ready'});
    } catch {
      if (sequence === documentRequestSequence.current) setDocumentState({status: 'error'});
    }
  }, [campusId, documentApi, withToken]);

  const loadList = useCallback(async () => {
    const sequence = ++contentRequestSequence.current;
    mediaRequestSequence.current += 1;
    documentRequestSequence.current += 1;
    setMediaState({status: 'idle'});
    setDocumentState({status: 'idle'});
    setState({status: 'loading', target: {kind: 'list'}});
    try {
      const items = await withToken((token) => api.listPublished(token, campusId));
      if (sequence !== contentRequestSequence.current) return;
      setState({status: 'list', items});
    } catch (error) {
      if (sequence === contentRequestSequence.current) {
        setState({status: 'error', error: toApiError(error), target: {kind: 'list'}});
      }
    }
  }, [api, campusId, withToken]);

  const openDetail = useCallback(async (announcementId: number) => {
    const sequence = ++contentRequestSequence.current;
    mediaRequestSequence.current += 1;
    documentRequestSequence.current += 1;
    setMediaState({status: 'idle'});
    setDocumentState({status: 'idle'});
    setState({status: 'loading', target: {announcementId, kind: 'detail'}});
    try {
      const detail = await withToken((token) => api.getDetail(token, campusId, announcementId));
      if (sequence !== contentRequestSequence.current) return;
      setState({status: 'detail', detail});
      void loadDetailMedia(detail);
      void loadDetailDocuments(detail);
    } catch (error) {
      if (sequence === contentRequestSequence.current) {
        setState({
          status: 'error',
          error: toApiError(error),
          target: {announcementId, kind: 'detail'},
        });
      }
    }
  }, [api, campusId, loadDetailDocuments, loadDetailMedia, withToken]);

  useEffect(() => {
    if (initialAnnouncementId !== null) void openDetail(initialAnnouncementId);
    else void loadList();
    return () => {
      contentRequestSequence.current += 1;
      mediaRequestSequence.current += 1;
      documentRequestSequence.current += 1;
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
    return <AnnouncementDetailScreen campusId={campusId} detail={state.detail} documentState={documentState} mediaStatus={detailMediaStatus} onBack={loadList} onDocumentRetry={() => loadDetailDocuments(state.detail)} onMediaRetry={() => loadDetailMedia(state.detail, true)} onOpenDocument={openDocument} slots={slots} userId={userId} />;
  }
  return <AnnouncementListScreen items={state.items} onBack={onBack} onOpen={openDetail} onRefresh={loadList} />;
}

export function AnnouncementListScreen({
  items,
  onBack,
  onOpen,
  onRefresh,
}: {
  items: AnnouncementSummary[];
  onBack: () => void;
  onOpen: (id: number) => void;
  onRefresh: () => void;
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
        </View>
      }
      onRefresh={onRefresh}
      refreshing={false}
      renderItem={({item}) => <AnnouncementRow item={item} onPress={onOpen} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

const AnnouncementRow = memo(function AnnouncementRow({item, onPress}: {item: AnnouncementSummary; onPress: (id: number) => void}) {
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={`${item.category.name} 공지 ${item.title} 상세 보기`}
        accessibilityRole="button"
        onPress={() => onPress(item.id)}
        style={({pressed}) => [styles.cardOpen, pressed && styles.pressed]}>
        <View style={styles.rowTop}>
          <View style={styles.rowBadges}>
            <AnnouncementCategoryBadge category={item.category} />
            {item.pinned ? <Text style={styles.pinned}>상단 고정</Text> : null}
          </View>
          <Text style={styles.date}>{formatDate(item.publishedAt ?? item.publishAt)}</Text>
        </View>
        <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
      </Pressable>
    </View>
  );
});

export function AnnouncementDetailScreen({
  campusId,
  detail,
  documentState,
  mediaStatus,
  onBack,
  onMediaRetry,
  onDocumentRetry,
  onOpenDocument,
  slots,
  userId,
}: {
  campusId: number;
  detail: AnnouncementDetail;
  documentState: DocumentState;
  mediaStatus: 'error' | 'loading' | 'ready';
  onBack: () => void;
  onMediaRetry: () => void;
  onDocumentRetry: () => void;
  onOpenDocument: (assetId: number) => Promise<void>;
  slots: DetailMediaSlot[];
  userId?: number | undefined;
}) {
  const {height, width} = useWindowDimensions();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [documentNotice, setDocumentNotice] = useState<string | null>(null);
  const documentOpenFlights = useRef(new Set<number>());
  const thumbnailSize = 84;
  const documentItems = documentState.status === 'ready'
    ? documentState.items.map((item) => ({assetId: item.assetId, byteSize: item.byteSize, fileName: item.fileName, localId: `document-${item.assetId}`, status: 'ready' as const}))
    : [];
  return (
    <>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={[]}
        ListHeaderComponent={
          <View style={styles.detail}>
          <ScreenHeader
            action={<CompactBackButton onPress={onBack} />}
            eyebrow="캠퍼스 소식"
            subtitle="공동체의 중요한 소식을 확인하세요."
            title="공지 상세"
          />
          <View style={styles.detailHero}>
            <View style={styles.detailMetaRow}>
              <AnnouncementCategoryBadge category={detail.category} />
              <Text style={styles.date}>{formatDate(detail.publishedAt ?? detail.publishAt)}</Text>
            </View>
            <Text accessibilityRole="header" style={styles.detailTitle}>{detail.title}</Text>
          </View>
          <View style={styles.bodyCard}>
            <Text style={styles.body}>{detail.body}</Text>
          </View>
          {detail.imageAssetIds.length > 0 ? (
            <View style={styles.mediaSection}>
              <View style={styles.mediaHeadingRow}>
                <Text style={styles.imageHeading}>첨부 이미지</Text>
                {slots.length > 1 ? <Text style={styles.imageCount}>{slots.length}장</Text> : null}
              </View>
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
                    contentContainerStyle={styles.thumbnailListContent}
                    data={slots}
                    horizontal
                    keyExtractor={(item) => String(item.assetId)}
                    renderItem={({index, item}) => item.image ? (
                      <RetryableDetailImage
                        campusId={campusId}
                        image={item.image}
                        imageSize={thumbnailSize}
                        index={index}
                        onMediaRetry={onMediaRetry}
                        onOpen={() => setExpandedIndex(index)}
                        userId={userId}
                      />
                    ) : item.loading ? (
                      <LoadingDetailImage imageSize={thumbnailSize} index={index} />
                    ) : (
                      <MissingDetailImage imageSize={thumbnailSize} index={index} onRetry={onMediaRetry} />
                    )}
                    showsHorizontalScrollIndicator={false}
                  />
                ) : null}
              </View>
            ) : null}
          <AnnouncementDocumentList
            items={documentItems}
            onOpen={(item) => {
              if (!item.assetId || documentOpenFlights.current.has(item.assetId)) return;
              documentOpenFlights.current.add(item.assetId);
              setDocumentNotice(`${item.fileName} 파일을 여는 중입니다.`);
              void onOpenDocument(item.assetId)
                .then(() => setDocumentNotice(null))
                .catch(() => setDocumentNotice('PDF 파일을 열지 못했습니다. 다시 시도해 주세요.'))
                .finally(() => documentOpenFlights.current.delete(item.assetId!));
            }}
          />
          {documentState.status === 'loading' ? <Text style={styles.date}>첨부 파일 정보를 불러오고 있습니다.</Text> : null}
          {documentState.status === 'error' ? (
            <Pressable accessibilityLabel="공지 첨부 파일 정보 다시 불러오기" accessibilityRole="button" onPress={onDocumentRetry}>
              <Text style={styles.date}>첨부 파일을 불러오지 못했습니다. 다시 시도</Text>
            </Pressable>
          ) : null}
          {documentNotice ? <Text accessibilityRole="alert" style={styles.date}>{documentNotice}</Text> : null}
          </View>
        }
        renderItem={null}
        showsVerticalScrollIndicator={false}
      />
      <AnnouncementImageViewer
        campusId={campusId}
        height={height}
        initialIndex={expandedIndex}
        onClose={() => setExpandedIndex(null)}
        slots={slots}
        userId={userId}
        width={width}
      />
    </>
  );
}

function AnnouncementImageViewer({
  campusId,
  height,
  initialIndex,
  onClose,
  slots,
  userId,
  width,
}: {
  campusId: number;
  height: number;
  initialIndex: number | null;
  onClose: () => void;
  slots: DetailMediaSlot[];
  userId?: number | undefined;
  width: number;
}) {
  const [visibleIndex, setVisibleIndex] = useState(0);

  useEffect(() => {
    if (initialIndex !== null) setVisibleIndex(initialIndex);
  }, [initialIndex]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={initialIndex !== null}>
      <SafeAreaView
        accessibilityLabel="공지 첨부 이미지 확대 화면"
        accessibilityViewIsModal
        style={styles.expandedBackdrop}>
        <View style={styles.expandedHeader}>
          <Text accessibilityLiveRegion="polite" style={styles.expandedCount}>
            {visibleIndex + 1} / {slots.length}
          </Text>
          <Pressable
            accessibilityLabel="공지 첨부 이미지 확대 화면 닫기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
            style={({pressed}) => [styles.expandedClose, pressed && styles.expandedPressed]}>
            <Text style={styles.expandedCloseText}>닫기</Text>
          </Pressable>
        </View>
        {initialIndex !== null ? (
          <FlatList
            data={slots}
            getItemLayout={(_data, index) => ({index, length: width, offset: width * index})}
            horizontal
            initialScrollIndex={initialIndex}
            key={`announcement-expanded-${initialIndex}`}
            keyExtractor={(item) => String(item.assetId)}
            onMomentumScrollEnd={(event) => {
              setVisibleIndex(Math.round(event.nativeEvent.contentOffset.x / width));
            }}
            pagingEnabled
            renderItem={({index, item}) => (
              <View style={[styles.expandedPage, {height: Math.max(240, height - 100), width}]}>
                {item.image ? (
                  <AnnouncementCachedImage
                    accessible
                    accessibilityLabel={`확대된 공지 첨부 이미지 ${index + 1}`}
                    accessibilityRole="image"
                    assetId={item.image.assetId}
                    campusId={campusId}
                    resizeMode="contain"
                    signedUrl={item.image.detailUrl}
                    style={styles.expandedImage}
                    userId={userId}
                    variant="detail"
                  />
                ) : (
                  <Text accessibilityRole="alert" style={styles.expandedMissing}>이미지를 표시하지 못했습니다.</Text>
                )}
              </View>
            )}
            showsHorizontalScrollIndicator={false}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function LoadingDetailImage({imageSize, index}: {imageSize: number; index: number}) {
  return (
    <View
      accessibilityLabel={`공지 첨부 이미지 ${index + 1} 주소 불러오는 중`}
      accessibilityLiveRegion="polite"
      style={[styles.imageFrame, styles.loadingImage, {height: imageSize, width: imageSize}]}
    >
      <Text style={styles.thumbnailStatus}>준비 중</Text>
    </View>
  );
}

function MissingDetailImage({
  imageSize,
  index,
  onRetry,
}: {
  imageSize: number;
  index: number;
  onRetry: () => void;
}) {
  const displayIndex = index + 1;
  return (
    <View
      style={[styles.imageFrame, styles.missingImage, {height: imageSize, width: imageSize}]}
    >
      <Text
        accessibilityLabel={`공지 첨부 이미지 ${displayIndex}를 표시할 수 없음`}
        accessibilityRole="alert"
        style={styles.thumbnailStatus}
      >
        불러오기 실패
      </Text>
      <Pressable
        accessibilityLabel={`공지 첨부 이미지 ${displayIndex} 다시 불러오기`}
        accessibilityRole="button"
        onPress={onRetry}
        style={({pressed}) => [styles.thumbnailRetry, pressed && styles.pressed]}
      >
        <Text style={styles.thumbnailRetryText}>재시도</Text>
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

function RetryableDetailImage({
  campusId,
  image,
  imageSize,
  index,
  onMediaRetry,
  onOpen,
  userId,
}: {
  campusId: number;
  image: MediaAccessUrl;
  imageSize: number;
  index: number;
  onMediaRetry: () => void;
  onOpen: () => void;
  userId?: number | undefined;
}) {
  const [status, setStatus] = useState<'error' | 'loaded' | 'loading'>('loading');
  const [retryKey, setRetryKey] = useState(0);
  const displayIndex = index + 1;
  const imageIdentity = `${image.assetId}:${image.thumbnailUrl}:${retryKey}`;
  const latestImageIdentity = useRef(imageIdentity);
  latestImageIdentity.current = imageIdentity;

  useEffect(() => {
    setStatus('loading');
  }, [image.assetId, image.thumbnailUrl]);

  const retry = () => {
    setStatus('loading');
    setRetryKey((current) => current + 1);
    onMediaRetry();
  };

  return (
    <Pressable
      accessibilityLabel={`공지 첨부 이미지 ${displayIndex} 확대 보기`}
      accessibilityRole="button"
      accessibilityState={{disabled: status !== 'loaded'}}
      disabled={status !== 'loaded'}
      onPress={onOpen}
      style={({pressed}) => [
        styles.imageFrame,
        {height: imageSize, width: imageSize},
        pressed && styles.pressed,
      ]}>
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
        resizeMode="contain"
        signedUrl={image.thumbnailUrl}
        style={styles.image}
        userId={userId}
        variant="thumbnail"
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
          <Text style={styles.thumbnailStatus}>불러오기 실패</Text>
          <Pressable
            accessibilityLabel={`공지 첨부 이미지 ${displayIndex} 다시 불러오기`}
            accessibilityRole="button"
            onPress={retry}
            style={({pressed}) => [styles.thumbnailRetry, pressed && styles.pressed]}
          >
            <Text style={styles.thumbnailRetryText}>재시도</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
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
    borderColor: colors.borderSoft,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: 10,
    padding: spacing.card,
  },
  cardOpen: {gap: 7},
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
  bodyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.card,
  },
  detail: {gap: 12},
  detailHero: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    gap: 9,
    padding: 16,
  },
  detailMetaRow: {alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between'},
  detailTitle: {...typography.screenTitle, color: colors.textPrimary},
  expandedBackdrop: {backgroundColor: 'rgba(8, 13, 24, 0.96)', flex: 1},
  expandedClose: {alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 56},
  expandedCloseText: {color: colors.surface, fontSize: 15, fontWeight: '700'},
  expandedCount: {color: colors.surface, fontSize: 14, fontWeight: '700'},
  expandedHeader: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 76, paddingHorizontal: 20, paddingTop: 20},
  expandedImage: {height: '100%', width: '100%'},
  expandedMissing: {color: colors.surface, fontSize: 14},
  expandedPage: {alignItems: 'center', justifyContent: 'center', paddingBottom: 24, paddingHorizontal: 12},
  expandedPressed: {opacity: 0.65},
  image: {height: '100%', width: '100%'},
  imageCount: {color: colors.primary, fontSize: 13, fontWeight: '700'},
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
    backgroundColor: colors.background,
    borderColor: colors.borderSoft,
    borderRadius: radius.item,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imageHeading: {...typography.cardTitle, color: colors.textPrimary},
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
    paddingHorizontal: 0,
    paddingTop: 20,
  },
  listHeader: {gap: 14},
  mediaHeadingRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  mediaSection: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  thumbnailListContent: {gap: 10, paddingRight: 4},
  thumbnailRetry: {alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.pill, justifyContent: 'center', minHeight: 28, paddingHorizontal: 8},
  thumbnailRetryText: {color: colors.primary, fontSize: 11, fontWeight: '700'},
  thumbnailStatus: {color: colors.textMuted, fontSize: 11, lineHeight: 14, textAlign: 'center'},
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
  rowBadges: {alignItems: 'center', flexDirection: 'row', gap: 8},
  rowTop: {alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between'},
  stateHost: {flex: 1, gap: 16, justifyContent: 'center', paddingVertical: spacing.screenX},
  title: {...typography.cardTitle, color: colors.textPrimary},
});
