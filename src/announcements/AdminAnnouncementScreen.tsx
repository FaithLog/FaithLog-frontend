import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {FaithLogApiError} from '../api/client';
import type {ApiError} from '../api/types';
import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {Button, Card, Empty, ErrorState, Loading, ScreenHeader, TextField} from '../components/ui';
import {DutyDateTimePickerModal, formatDutyDateTimeLabel} from '../duty/DutyDateTimePicker';
import {colors, radius, spacing, typography} from '../theme';
import {announcementApi, type AnnouncementApi} from './announcementApi';
import {isAnnouncementMockModeEnabled} from './announcementEnvironment';
import {AnnouncementCategoryBadge} from './AnnouncementCategoryBadge';
import {AnnouncementRetryableImage} from './AnnouncementRetryableImage';
import {moveUploadItem, reconcileUploadItem, type UploadItem} from './announcementMedia';
import {
  createNativeAnnouncementBinaryUploader,
  discardPreparedAnnouncementImages,
  pickAndPrepareAnnouncementImages,
  type PreparedAnnouncementNativeImage,
} from './announcementNativeMedia';
import {
  MediaBinaryUploadHttpError,
  MediaBinaryUploadUncertainError,
  MediaAssetCompletionRejectedError,
  MediaAssetProcessingError,
  retryAnnouncementImageUpload,
  resumeAnnouncementImageCompletion,
  uploadAnnouncementImage,
  type MediaBinaryUploadRetryContext,
} from './announcementUploadFlow';
import {useHorizontalDragAutoScroll} from '../media/useHorizontalDragAutoScroll';
import type {
  AnnouncementCategory,
  AnnouncementDetail,
  AnnouncementSaveRequest,
  AnnouncementStatus,
  AnnouncementSummary,
  MediaAssetIdentity,
} from './announcementTypes';

type Route =
  | {name: 'list'}
  | {name: 'editor'; detail: AnnouncementDetail | null}
  | {name: 'categories'};
type LoadState =
  | {status: 'loading'}
  | {status: 'success'; items: AnnouncementSummary[]}
  | {status: 'error'; error: ApiError};
type ListConfirmationTarget = {
  kind: 'archive' | 'publish';
  item: AnnouncementSummary;
};
type ExistingMediaState =
  | {status: 'idle' | 'loading'}
  | {status: 'ready'; urls: Record<number, string>}
  | {status: 'error'};
type UploadPreviewItem =
  | {index: number; kind: 'local'; localId: string; uri: string}
  | {index: number; kind: 'mock'; localId: string}
  | {
      assetId: number;
      index: number;
      kind: 'remote';
      localId: string;
      signedUrl: string | undefined;
    };

const tabs: Array<{id: AnnouncementStatus; label: string}> = [
  {id: 'SCHEDULED', label: '게시 예정'},
  {id: 'PUBLISHED', label: '게시됨'},
  {id: 'ARCHIVED', label: '보관됨'},
];
const categorySwatches = ['#3182F6', '#5BA8B0', '#F59E0B', '#EF4444', '#22C55E'];
const progressiveAdminRowPageSize = 20;
const isMockModeEnabled = isAnnouncementMockModeEnabled;
let nextAdminMockAssetIdSequence = 9000;

export function AdminAnnouncementScreen({
  campusId,
  api = announcementApi,
  onBack,
  userId,
}: {
  api?: AnnouncementApi;
  campusId: number;
  onBack: () => void;
  userId?: number | undefined;
}) {
  const [route, setRoute] = useState<Route>({name: 'list'});
  const [status, setStatus] = useState<AnnouncementStatus>('PUBLISHED');
  const [state, setState] = useState<LoadState>({status: 'loading'});
  const [confirmationTarget, setConfirmationTarget] = useState<ListConfirmationTarget | null>(null);
  const [actionBusy, setActionBusy] = useState<'archive' | 'publish' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const archiveFlightRef = useRef(false);
  const publishFlightRef = useRef(false);

  const withToken = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    const token = await resolveCurrentAccessToken(() => undefined);
    if (!token) {
      throw new FaithLogApiError({kind: 'sessionExpired', message: '로그인이 만료되었습니다.'});
    }
    return operation(token);
  }, []);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setState({status: 'loading'});
    try {
      const items = await withToken((token) => api.listAdmin(token, campusId, status));
      if (request === requestRef.current) {
        setState({status: 'success', items});
      }
    } catch (error) {
      if (request === requestRef.current) {
        setState({status: 'error', error: toApiError(error)});
      }
    }
  }, [api, campusId, status, withToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectStatus = useCallback((nextStatus: AnnouncementStatus) => {
    if (nextStatus === status) return;
    // Invalidate the previous status scope in the same input event. Waiting for
    // the passive load effect would briefly paint old rows under the new tab.
    requestRef.current += 1;
    setState({status: 'loading'});
    setStatus(nextStatus);
  }, [status]);

  const requestConfirmation = useCallback((target: ListConfirmationTarget) => {
    setActionError(null);
    setConfirmationTarget(target);
  }, []);

  const closeConfirmation = useCallback(() => {
    if (archiveFlightRef.current || publishFlightRef.current) return;
    setActionError(null);
    setConfirmationTarget(null);
  }, []);

  const archive = useCallback(async () => {
    if (confirmationTarget?.kind !== 'archive' || archiveFlightRef.current) return;
    archiveFlightRef.current = true;
    setActionBusy('archive');
    setActionError(null);
    try {
      await withToken((token) =>
        api.archiveAnnouncement(token, campusId, confirmationTarget.item.id));
      setConfirmationTarget(null);
      await load();
    } catch {
      setActionError('공지를 보관하지 못했습니다. 목록과 공지 내용은 그대로 유지됩니다.');
    } finally {
      archiveFlightRef.current = false;
      setActionBusy(null);
    }
  }, [api, campusId, confirmationTarget, load, withToken]);

  const publish = useCallback(async () => {
    if (confirmationTarget?.kind !== 'publish' || publishFlightRef.current) return;
    publishFlightRef.current = true;
    setActionBusy('publish');
    setActionError(null);
    try {
      const item = confirmationTarget.item;
      await withToken((token) => api.publishAnnouncement(token, campusId, item.id));
      setConfirmationTarget(null);
      await load();
    } catch {
      setActionError('공지를 게시하지 못했습니다. 예약 공지 내용은 그대로 유지됩니다.');
    } finally {
      publishFlightRef.current = false;
      setActionBusy(null);
    }
  }, [api, campusId, confirmationTarget, load, withToken]);

  if (route.name === 'editor') {
    return (
      <AnnouncementEditorScreen
        api={api}
        campusId={campusId}
        detail={route.detail}
        onBack={() => {
          setRoute({name: 'list'});
          void load();
        }}
        userId={userId}
      />
    );
  }
  if (route.name === 'categories') {
    return (
      <AnnouncementCategoryScreen
        api={api}
        campusId={campusId}
        onBack={() => {
          setRoute({name: 'list'});
          void load();
        }}
      />
    );
  }

  const confirmationTitle = confirmationTarget
    ? `${confirmationTarget.item.title} ${confirmationTarget.kind === 'publish' ? '게시' : '보관'} 확인`
    : '공지 작업 확인';
  const confirmationAction = confirmationTarget?.kind === 'publish' ? '게시' : '보관';

  return (
    <>
      <AdminAnnouncementListScreen
        loadState={state}
        onArchive={(item) => requestConfirmation({item, kind: 'archive'})}
        onBack={onBack}
        onCategories={() => setRoute({name: 'categories'})}
        onCreate={() => setRoute({name: 'editor', detail: null})}
        onEdit={(detail) => setRoute({name: 'editor', detail})}
        onPublish={(item) => requestConfirmation({item, kind: 'publish'})}
        onRetry={load}
        onStatus={selectStatus}
        selectedStatus={status}
      />
      <AnnouncementConfirmationSheet
        accessibilityLabel={confirmationTitle}
        busy={actionBusy !== null}
        cancelAccessibilityLabel={`${confirmationTitle} 취소`}
        confirmAccessibilityLabel={`${confirmationTitle} 실행`}
        confirmLabel={confirmationAction}
        error={actionError}
        message={confirmationTarget?.kind === 'publish'
          ? '예약된 공지를 지금 게시합니다. 게시 알림은 이 명시적인 게시 작업에서만 처리됩니다.'
          : '이 공지를 보관하면 일반 공지 목록에서 더 이상 표시되지 않습니다.'}
        onCancel={closeConfirmation}
        onConfirm={confirmationTarget?.kind === 'publish' ? publish : archive}
        title={confirmationTitle}
        visible={confirmationTarget !== null}
      />
    </>
  );
}

export function AdminAnnouncementListScreen({
  loadState,
  onArchive,
  onBack,
  onCategories,
  onCreate,
  onEdit,
  onPublish,
  onRetry,
  onStatus,
  selectedStatus,
}: {
  loadState: LoadState;
  onArchive: (item: AnnouncementSummary) => void;
  onBack: () => void;
  onCategories: () => void;
  onCreate: () => void;
  onEdit: (detail: AnnouncementDetail) => void;
  onPublish: (item: AnnouncementSummary) => void;
  onRetry: () => void;
  onStatus: (status: AnnouncementStatus) => void;
  selectedStatus: AnnouncementStatus;
}) {
  const [visibleItemCount, setVisibleItemCount] = useState(progressiveAdminRowPageSize);
  useEffect(() => {
    setVisibleItemCount(progressiveAdminRowPageSize);
  }, [selectedStatus]);
  const visibleItems = loadState.status === 'success'
    ? loadState.items.slice(0, visibleItemCount)
    : [];
  const remainingItemCount = loadState.status === 'success'
    ? Math.max(0, loadState.items.length - visibleItems.length)
    : 0;
  return (
    <View style={styles.page}>
      <ScreenHeader
        action={<CompactButton label="뒤로" onPress={onBack} />}
        eyebrow="캠퍼스 운영"
        subtitle="공지 작성, 예약 게시와 보관 상태를 관리합니다."
        title="공지 관리"
      />
      <View accessibilityLabel="공지 관리 작업" style={styles.actionRow}>
        <CompactButton label="카테고리" onPress={onCategories} />
        <CompactButton label="공지 작성" onPress={onCreate} primary />
      </View>
      <View accessibilityLabel="공지 상태" accessibilityRole="tablist" style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable
            accessibilityLabel={`${tab.label} 공지 보기`}
            accessibilityRole="tab"
            accessibilityState={{selected: selectedStatus === tab.id}}
            key={tab.id}
            onPress={() => onStatus(tab.id)}
            style={[styles.tab, selectedStatus === tab.id && styles.tabActive]}>
            <Text style={[styles.tabText, selectedStatus === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {loadState.status === 'loading' ? (
        <Loading message="공지 목록을 불러오고 있습니다." />
      ) : loadState.status === 'error' ? (
        <ErrorState
          actionAccessibilityLabel="관리자 공지 목록 다시 불러오기"
          actionLabel="다시 시도"
          message="잠시 후 다시 시도해 주세요."
          onActionPress={onRetry}
          title="공지 목록을 불러오지 못했습니다"
        />
      ) : loadState.items.length === 0 ? (
        <Empty
          actionAccessibilityLabel="새 공지 작성"
          actionLabel="공지 작성"
          message="공지 작성에서 새 소식을 등록할 수 있습니다."
          onActionPress={onCreate}
          title="해당 상태의 공지가 없습니다"
        />
      ) : <>
        {visibleItems.map((item) => (
        <View accessibilityLabel={`${item.title} 관리 카드`} key={item.id} style={styles.card}>
          <View style={styles.adminCardMetaRow}>
            <View style={styles.adminCardBadges}>
              <AnnouncementCategoryBadge category={item.category} />
              {item.pinned ? <Text style={styles.pinned}>상단 고정</Text> : null}
              <Text style={styles.adminStatus}>{statusLabel(item.status)}</Text>
            </View>
            <Text style={styles.adminDate}>{formatDate(item.publishedAt ?? item.publishAt)}</Text>
          </View>
          <Text numberOfLines={2} style={styles.cardTitle}>{item.title}</Text>
          <View
            accessibilityLabel={`${item.title} 관리 작업`}
            style={styles.actionRow}>
            {item.status !== 'ARCHIVED' ? (
              <CompactButton
                accessibilityLabel={`${item.title} 수정`}
                label="수정"
                onPress={() => onEdit(item)}
              />
            ) : null}
            {item.status === 'SCHEDULED' ? (
              <CompactButton
                accessibilityLabel={`${item.title} 게시 확인 열기`}
                label="게시"
                onPress={() => onPublish(item)}
                primary
              />
            ) : null}
            {item.status !== 'ARCHIVED' ? (
              <CompactButton
                accessibilityLabel={`${item.title} 보관 확인 열기`}
                label="보관"
                onPress={() => onArchive(item)}
              />
            ) : null}
          </View>
        </View>
        ))}
        {remainingItemCount > 0 ? (
          <Button
            accessibilityLabel={`관리자 공지 ${Math.min(progressiveAdminRowPageSize, remainingItemCount)}개 더 보기`}
            onPress={() => setVisibleItemCount((current) => current + progressiveAdminRowPageSize)}>
            공지 더 보기 ({visibleItems.length}/{loadState.items.length})
          </Button>
        ) : null}
      </>}
    </View>
  );
}

export function AnnouncementEditorScreen({
  api,
  campusId,
  detail,
  onBack,
  userId,
}: {
  api: AnnouncementApi;
  campusId: number;
  detail: AnnouncementDetail | null;
  onBack: () => void;
  userId?: number | undefined;
}) {
  const [categories, setCategories] = useState<AnnouncementCategory[]>([]);
  const [categoryId, setCategoryId] = useState(detail?.category.id ?? 0);
  const [title, setTitle] = useState(detail?.title ?? '');
  const [body, setBody] = useState(detail?.body ?? '');
  const [pinned, setPinned] = useState(detail?.pinned ?? false);
  const [publishMode, setPublishMode] = useState<'NOW' | 'SCHEDULED'>(
    detail?.status === 'SCHEDULED' ? 'SCHEDULED' : 'NOW',
  );
  const [publishAt, setPublishAt] = useState<Date>(() => getInitialPublishDate(detail?.publishAt));
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>(() =>
    (detail?.imageAssetIds ?? []).map((assetId) => ({
      assetId,
      localId: `asset-${assetId}`,
      status: 'ready',
    })),
  );
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [existingMedia, setExistingMedia] = useState<ExistingMediaState>({status: 'idle'});
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const saveFlightRef = useRef(false);
  const existingMediaRequestRef = useRef(0);
  const existingAssetIds = useMemo(() => detail?.imageAssetIds ?? [], [detail]);

  const loadExistingMedia = useCallback(async (
    preserveCurrentUrls = false,
  ): Promise<Record<number, string> | null> => {
    const request = ++existingMediaRequestRef.current;
    if (existingAssetIds.length === 0) {
      setExistingMedia({status: 'ready', urls: {}});
      return {};
    }
    if (!preserveCurrentUrls) setExistingMedia({status: 'loading'});
    try {
      const token = await resolveCurrentAccessToken(() => undefined);
      if (!token) throw new Error('session');
      const media = await api.getMediaAccessUrls(token, campusId, existingAssetIds);
      if (request !== existingMediaRequestRef.current) return null;
      const urls = Object.fromEntries(media.map((item) => [item.assetId, item.thumbnailUrl]));
      setExistingMedia((current) => ({
        status: 'ready',
        urls: preserveCurrentUrls && current.status === 'ready'
          ? {...current.urls, ...urls}
          : urls,
      }));
      return urls;
    } catch {
      if (!preserveCurrentUrls && request === existingMediaRequestRef.current) {
        setExistingMedia({status: 'error'});
      }
      return null;
    }
  }, [api, campusId, existingAssetIds]);

  useEffect(() => {
    mounted.current = true;
    void resolveCurrentAccessToken(() => undefined)
      .then((token) => token ? api.listCategories(token, campusId, detail !== null) : [])
      .then((items) => {
        if (!mounted.current) return;
        const selectableItems = items.filter((category) =>
          category.isActive || category.id === detail?.category.id);
        setCategories(selectableItems);
        setCategoryId((current) =>
          selectableItems.some((category) => category.id === current)
            ? current
            : (selectableItems[0]?.id ?? 0));
      })
      .catch(() => {
        if (mounted.current) setError('카테고리를 불러오지 못했습니다.');
      });
    return () => {
      mounted.current = false;
    };
  }, [api, campusId, detail]);

  useEffect(() => {
    void loadExistingMedia();
    return () => {
      existingMediaRequestRef.current += 1;
    };
  }, [loadExistingMedia]);

  const buildRequest = () => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (mediaBusy) {
      setError('선택한 이미지 처리가 끝난 뒤 공지를 저장해 주세요.');
      return null;
    }
    if (!trimmedTitle || !trimmedBody || !categoryId) {
      setError('카테고리, 제목과 본문을 입력해 주세요.');
      return null;
    }
    if (uploads.some((item) => item.status !== 'ready')) {
      setError('이미지 업로드를 완료하거나 실패한 이미지를 삭제한 뒤 다시 시도해 주세요.');
      return null;
    }
    if (publishMode === 'SCHEDULED' && publishAt.getTime() <= Date.now()) {
      setError('예약 게시 시각은 현재 시각 이후여야 합니다.');
      return null;
    }
    const request: AnnouncementSaveRequest = {
      body: trimmedBody,
      categoryId,
      imageAssetIds: uploads.flatMap((item) => item.status === 'ready' ? [item.assetId] : []),
      pinned,
      publishAt: publishMode === 'SCHEDULED' ? publishAt.toISOString() : null,
      publishMode,
      title: trimmedTitle,
    };
    return request;
  };

  const openConfirmation = () => {
    if (saveFlightRef.current || !buildRequest()) return;
    setError(null);
    setConfirmationVisible(true);
  };

  const save = async () => {
    if (saveFlightRef.current) return;
    const request = buildRequest();
    if (!request) return;
    saveFlightRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const token = await resolveCurrentAccessToken(() => undefined);
      if (!token) throw new Error('session');
      if (detail) {
        if (detail.status === 'SCHEDULED' && request.publishMode === 'NOW') {
          await api.updateAnnouncement(token, campusId, detail.id, {
            ...request,
            publishAt: detail.publishAt,
            publishMode: 'SCHEDULED',
          });
          await api.publishAnnouncement(token, campusId, detail.id);
        } else {
          await api.updateAnnouncement(token, campusId, detail.id, request);
        }
      } else {
        await api.createAnnouncement(token, campusId, request);
      }
      if (mounted.current) onBack();
    } catch {
      if (mounted.current) {
        setError('공지를 저장하지 못했습니다. 입력 내용과 업로드된 이미지는 그대로 보존됩니다.');
      }
    } finally {
      saveFlightRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const confirmation = getEditorConfirmation(detail, publishMode, publishAt);

  if (detail?.status === 'ARCHIVED') {
    return (
      <View style={styles.page}>
        <ErrorState
          actionAccessibilityLabel="보관 공지 편집 화면 닫기"
          actionLabel="목록으로"
          message="보관 상태를 유지하는 수정 계약이 확정되지 않아 보관된 공지는 수정할 수 없습니다."
          onActionPress={onBack}
          title="보관 공지 수정 제한"
        />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScreenHeader
        action={<CompactButton label="뒤로" onPress={onBack} />}
        eyebrow={detail ? '공지 수정' : '새 공지'}
        title={detail ? '공지 내용 수정' : '공지 작성'}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Card>
        <Text style={styles.label}>카테고리</Text>
        <View accessibilityLabel="공지 카테고리 선택" accessibilityRole="radiogroup" style={styles.wrap}>
          {categories.map((category) => (
            <Pressable
              accessibilityLabel={`${category.name} 카테고리 선택`}
              accessibilityRole="radio"
              accessibilityState={{checked: categoryId === category.id}}
              key={category.id}
              onPress={() => setCategoryId(category.id)}
              style={[styles.choice, categoryId === category.id && styles.choiceActive]}>
              <AnnouncementCategoryBadge category={category} />
            </Pressable>
          ))}
        </View>
        <TextField label="제목" onChangeText={setTitle} value={title} />
        <Text style={styles.label}>본문</Text>
        <TextInput
          accessibilityLabel="공지 본문"
          multiline
          onChangeText={setBody}
          placeholder="공지 내용을 입력하세요"
          style={styles.multiline}
          textAlignVertical="top"
          value={body}
        />
        <View style={styles.switchRow}>
          <Text style={styles.label}>상단 고정</Text>
          <Switch accessibilityLabel="공지 상단 고정" onValueChange={setPinned} value={pinned} />
        </View>
        <Text style={styles.label}>게시 방식</Text>
        {detail?.status === 'PUBLISHED' ? (
          <Text style={styles.meta}>게시 상태를 유지하며 알림을 다시 발송하지 않습니다.</Text>
        ) : (
          <View accessibilityLabel="공지 게시 방식 선택" accessibilityRole="radiogroup" style={styles.tabs}>
            <Choice
              accessibilityLabel="지금 게시 방식 선택"
              label="지금 게시"
              selected={publishMode === 'NOW'}
              onPress={() => setPublishMode('NOW')}
            />
            <Choice
              accessibilityLabel="예약 게시 방식 선택"
              label="예약 게시"
              selected={publishMode === 'SCHEDULED'}
              onPress={() => setPublishMode('SCHEDULED')}
            />
          </View>
        )}
        {publishMode === 'SCHEDULED' ? (
          <View style={styles.scheduleField}>
            <Text style={styles.label}>예약 게시 날짜와 시간</Text>
            <Pressable
              accessibilityHint="달력과 시간 조절 화면을 엽니다."
              accessibilityLabel="예약 게시 날짜와 시간 선택"
              accessibilityRole="button"
              onPress={() => setDatePickerVisible(true)}
              style={({pressed}) => [styles.scheduleButton, pressed && styles.pressed]}>
              <Text style={styles.scheduleButtonText}>{formatDutyDateTimeLabel(publishAt)}</Text>
            </Pressable>
          </View>
        ) : null}
      </Card>
      <AnnouncementImagePickerSection
        api={api}
        campusId={campusId}
        items={uploads}
        onBusyChange={setMediaBusy}
        onChange={setUploads}
        onRetryRemoteMedia={() => loadExistingMedia(true)}
        remoteMediaFailed={existingMedia.status === 'error'}
        remoteMediaPending={existingMedia.status === 'idle' || existingMedia.status === 'loading'}
        remoteThumbnailUrls={existingMedia.status === 'ready' ? existingMedia.urls : {}}
        userId={userId}
      />
      <View accessibilityLabel="공지 작성 작업" style={styles.editorActions}>
        <EditorActionButton
          accessibilityLabel={detail ? '공지 수정 취소' : '공지 작성 취소'}
          disabled={saving}
          label="취소"
          onPress={onBack}
        />
        <EditorActionButton
          accessibilityLabel={confirmation.openAccessibilityLabel}
          disabled={saving || mediaBusy}
          label={detail ? '수정' : '작성'}
          onPress={openConfirmation}
          primary
        />
      </View>
      <DutyDateTimePickerModal
        minimumDate={new Date()}
        onApply={(value) => {
          setPublishAt(value);
          setDatePickerVisible(false);
        }}
        onClose={() => setDatePickerVisible(false)}
        value={publishAt}
        visible={datePickerVisible}
      />
      <AnnouncementConfirmationSheet
        accessibilityLabel={confirmation.title}
        busy={saving}
        cancelAccessibilityLabel={`${confirmation.title} 취소`}
        confirmAccessibilityLabel={confirmation.confirmAccessibilityLabel}
        confirmLabel={confirmation.confirmLabel}
        error={confirmationVisible ? error : null}
        message={confirmation.message}
        onCancel={() => {
          if (!saveFlightRef.current) setConfirmationVisible(false);
        }}
        onConfirm={() => void save()}
        title={confirmation.title}
        visible={confirmationVisible}
      />
    </View>
  );
}

export function AnnouncementCategoryScreen({
  api,
  campusId,
  onBack,
}: {
  api: AnnouncementApi;
  campusId: number;
  onBack: () => void;
}) {
  const [items, setItems] = useState<AnnouncementCategory[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementCategory | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3182F6');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<'error' | 'loading' | 'ready'>('loading');
  const [loadedCampusId, setLoadedCampusId] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const loadRequestRef = useRef(0);
  const categoryMutationFlightRef = useRef(false);
  const createFlightRef = useRef(false);
  const editFlightRef = useRef(false);
  const deleteFlightRef = useRef<Set<number>>(new Set());
  const orderedItems = useMemo(() => [...items].sort(compareCategories), [items]);
  const categoryMutationBusy = creating || editing || deletingIds.size > 0;
  const categoryDataReady = loadStatus === 'ready' && loadedCampusId === campusId;

  const load = useCallback(async () => {
    const request = ++loadRequestRef.current;
    if (mountedRef.current) {
      setLoadStatus('loading');
      setError(null);
    }
    try {
      const token = await resolveCurrentAccessToken(() => undefined);
      if (!token) throw new Error('session');
      const next = await api.listCategories(token, campusId, true);
      const activeItems = next.filter((item) => item.isActive);
      if (!hasUniqueCategorySortOrders(activeItems)) throw new Error('invalid category order');
      if (!mountedRef.current || request !== loadRequestRef.current) return false;
      setItems(activeItems);
      setLoadedCampusId(campusId);
      setLoadStatus('ready');
      return true;
    } catch {
      if (mountedRef.current && request === loadRequestRef.current) {
        setLoadStatus('error');
        setError('카테고리를 불러오지 못했습니다.');
      }
      return false;
    }
  }, [api, campusId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const resetEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
    setName('');
    setColor('#3182F6');
  };

  const cancelEdit = () => {
    if (categoryMutationFlightRef.current) return;
    resetEditor();
  };

  const create = async () => {
    const trimmedName = name.trim();
    if (
      !categoryDataReady ||
      categoryMutationFlightRef.current ||
      createFlightRef.current ||
      !trimmedName
    ) return;
    categoryMutationFlightRef.current = true;
    createFlightRef.current = true;
    setCreating(true);
    setError(null);
    try {
      const token = await resolveCurrentAccessToken(() => undefined);
      if (!token) throw new Error('session');
      const created = await api.createCategory(token, campusId, {
        color,
        isActive: true,
        name: trimmedName,
        sortOrder: nextCategorySortOrder(orderedItems),
      });
      if (mountedRef.current) {
        setItems((current) => [...current, created]);
        resetEditor();
      }
    } catch {
      if (mountedRef.current) setError('같은 이름이 있는지 확인하고 다시 시도해 주세요.');
    } finally {
      categoryMutationFlightRef.current = false;
      createFlightRef.current = false;
      if (mountedRef.current) setCreating(false);
    }
  };

  const beginEdit = (item: AnnouncementCategory) => {
    if (!categoryDataReady || categoryMutationFlightRef.current || editFlightRef.current) return;
    setError(null);
    setEditorOpen(true);
    setEditingId(item.id);
    setName(item.name);
    setColor(item.color);
  };

  const beginCreate = () => {
    if (!categoryDataReady || categoryMutationFlightRef.current) return;
    setError(null);
    setSelectedCategoryId(null);
    setEditingId(null);
    setName('');
    setColor('#3182F6');
    setEditorOpen(true);
  };

  const saveEdit = async () => {
    const item = items.find((candidate) => candidate.id === editingId);
    const trimmedName = name.trim();
    if (
      !categoryDataReady ||
      !item ||
      !trimmedName ||
      categoryMutationFlightRef.current ||
      editFlightRef.current
    ) return;
    categoryMutationFlightRef.current = true;
    editFlightRef.current = true;
    setEditing(true);
    setError(null);
    try {
      const token = await resolveCurrentAccessToken(() => undefined);
      if (!token) throw new Error('session');
      const updated = await api.updateCategory(token, campusId, item.id, {
        color,
        isActive: item.isActive,
        name: trimmedName,
        sortOrder: item.sortOrder,
      });
      if (mountedRef.current) {
        setItems((current) => replaceCategory(current, updated));
        resetEditor();
      }
    } catch {
      if (mountedRef.current) {
        setError('카테고리 수정 내용을 저장하지 못했습니다. 입력 내용은 그대로 유지됩니다.');
      }
    } finally {
      categoryMutationFlightRef.current = false;
      editFlightRef.current = false;
      if (mountedRef.current) setEditing(false);
    }
  };

  const remove = async (item: AnnouncementCategory) => {
    if (
      !categoryDataReady ||
      categoryMutationFlightRef.current ||
      deleteFlightRef.current.has(item.id)
    ) return;
    categoryMutationFlightRef.current = true;
    deleteFlightRef.current.add(item.id);
    setDeletingIds((current) => new Set(current).add(item.id));
    setError(null);
    try {
      const token = await resolveCurrentAccessToken(() => undefined);
      if (!token) throw new Error('session');
      if (!item.isActive) return;
      await api.deactivateCategory(token, campusId, item.id);
      if (mountedRef.current) {
        setItems((current) => current.filter((candidate) => candidate.id !== item.id));
        setSelectedCategoryId((current) => current === item.id ? null : current);
        setDeleteTarget(null);
      }
    } catch {
      if (mountedRef.current) setError('카테고리를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      categoryMutationFlightRef.current = false;
      deleteFlightRef.current.delete(item.id);
      if (mountedRef.current) {
        setDeletingIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }
    }
  };

  return (
    <View style={styles.page}>
      <ScreenHeader
        action={<CompactButton label="뒤로" onPress={onBack} />}
        eyebrow="공지 관리"
        subtitle="공지에 사용할 카테고리를 추가하고 관리합니다."
        title="카테고리 관리"
      />
      {!categoryDataReady ? (
        loadStatus === 'error' ? (
          <ErrorState
            actionAccessibilityLabel="카테고리 다시 불러오기"
            actionLabel="다시 시도"
            message="서버의 카테고리 순서를 확인한 뒤에만 변경할 수 있습니다."
            onActionPress={() => void load()}
            title="카테고리를 불러오지 못했습니다"
          />
        ) : (
          <Loading message="카테고리를 불러오고 있습니다." />
        )
      ) : (
        <>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Card>
            <View style={styles.categorySectionHeader}>
              <View style={styles.categorySectionCopy}>
                <Text style={styles.cardTitle}>카테고리</Text>
                <Text style={styles.meta}>선택하면 수정하거나 삭제할 수 있어요.</Text>
              </View>
              <CompactButton
                accessibilityLabel="새 카테고리 추가 열기"
                disabled={categoryMutationBusy || editorOpen}
                label="+ 추가"
                onPress={beginCreate}
              />
            </View>
            {orderedItems.length === 0 ? (
              <Text style={styles.meta}>등록된 카테고리가 없습니다.</Text>
            ) : (
              <View
                accessibilityLabel="카테고리 목록"
                accessibilityRole="radiogroup"
                style={styles.categoryList}>
                {orderedItems.map((item) => {
                  const selected = selectedCategoryId === item.id;
                  return (
                    <Pressable
                      accessibilityLabel={`${item.name} 카테고리 선택`}
                      accessibilityRole="radio"
                      accessibilityState={{checked: selected, disabled: editorOpen || categoryMutationBusy}}
                      disabled={editorOpen || categoryMutationBusy}
                      key={item.id}
                      onPress={() => {
                        setError(null);
                        setSelectedCategoryId(item.id);
                      }}
                      style={({pressed}) => [
                        styles.categoryRow,
                        selected && styles.categoryRowSelected,
                        pressed && styles.pressed,
                      ]}>
                      <AnnouncementCategoryBadge category={item} />
                    </Pressable>
                  );
                })}
              </View>
            )}
            {selectedCategoryId !== null ? (() => {
              const selected = orderedItems.find((item) => item.id === selectedCategoryId);
              if (!selected) return null;
              return (
                <View accessibilityLabel={`${selected.name} 카테고리 선택 작업`} style={styles.selectedCategoryActions}>
                  <Text numberOfLines={1} style={styles.selectedCategoryName}>
                    <Text style={styles.selectedCategoryCaption}>선택됨  </Text>{selected.name}
                  </Text>
                  <View style={styles.categoryActions}>
                    <CompactButton
                      accessibilityLabel={`${selected.name} 카테고리 수정`}
                      disabled={categoryMutationBusy || editorOpen}
                      label="수정"
                      onPress={() => beginEdit(selected)}
                    />
                    <CompactButton
                      accessibilityLabel={`${selected.name} 카테고리 삭제`}
                      disabled={categoryMutationBusy || editorOpen}
                      label="삭제"
                      onPress={() => {
                        setError(null);
                        setDeleteTarget(selected);
                      }}
                    />
                  </View>
                </View>
              );
            })() : null}
          </Card>
          {editorOpen ? (
            <Card>
              <Text style={styles.cardTitle}>{editingId === null ? '새 카테고리' : '카테고리 수정'}</Text>
              <TextField label="카테고리 이름" onChangeText={setName} value={name} />
              <Text style={styles.label}>색상</Text>
              <View accessibilityLabel="카테고리 색상 선택" accessibilityRole="radiogroup" style={styles.wrap}>
                {categorySwatches.map((swatch) => (
                  <Pressable
                    accessibilityLabel={`카테고리 색상 ${swatch}`}
                    accessibilityRole="radio"
                    accessibilityState={{checked: color === swatch}}
                    key={swatch}
                    onPress={() => setColor(swatch)}
                    style={[
                      styles.swatch,
                      {backgroundColor: swatch},
                      color === swatch && styles.swatchSelected,
                    ]}
                  />
                ))}
              </View>
              {editingId === null ? (
                <View accessibilityLabel="카테고리 추가 작업" style={styles.editorActions}>
                  <EditorActionButton
                    accessibilityLabel="카테고리 추가"
                    disabled={categoryMutationBusy || !name.trim()}
                    label={creating ? '추가 중' : '추가'}
                    onPress={() => void create()}
                    primary
                  />
                  <EditorActionButton
                    accessibilityLabel="카테고리 추가 취소"
                    disabled={categoryMutationBusy}
                    label="취소"
                    onPress={cancelEdit}
                  />
                </View>
              ) : (
                <View accessibilityLabel="카테고리 수정 작업" style={styles.editorActions}>
                  <EditorActionButton
                    accessibilityLabel="카테고리 변경 저장"
                    disabled={categoryMutationBusy || !name.trim()}
                    label={editing ? '저장 중' : '변경 저장'}
                    onPress={() => void saveEdit()}
                    primary
                  />
                  <EditorActionButton
                    accessibilityLabel="카테고리 수정 취소"
                    disabled={categoryMutationBusy}
                    label="취소"
                    onPress={cancelEdit}
                  />
                </View>
              )}
            </Card>
          ) : null}
          <AnnouncementConfirmationSheet
            accessibilityLabel="카테고리 삭제 확인"
            busy={deleteTarget !== null && deletingIds.has(deleteTarget.id)}
            cancelAccessibilityLabel="카테고리 삭제 취소"
            confirmAccessibilityLabel="카테고리 삭제 확인 실행"
            confirmLabel="삭제"
            error={deleteTarget ? error : null}
            message="새 공지에서는 이 카테고리를 더 이상 사용할 수 없습니다. 기존 공지의 카테고리 표시는 유지됩니다."
            onCancel={() => {
              if (categoryMutationBusy) return;
              setDeleteTarget(null);
              setError(null);
            }}
            onConfirm={() => {
              if (deleteTarget) void remove(deleteTarget);
            }}
            title={deleteTarget ? `${deleteTarget.name} 카테고리를 삭제할까요?` : ''}
            visible={deleteTarget !== null}
          />
        </>
      )}
    </View>
  );
}

function AnnouncementImagePickerSection({
  api,
  campusId,
  items,
  onBusyChange,
  onChange,
  onRetryRemoteMedia,
  remoteMediaFailed,
  remoteMediaPending,
  remoteThumbnailUrls,
  userId,
}: {
  api: AnnouncementApi;
  campusId: number;
  items: UploadItem[];
  onBusyChange: (busy: boolean) => void;
  onChange: Dispatch<SetStateAction<UploadItem[]>>;
  onRetryRemoteMedia: () => Promise<Record<number, string> | null>;
  remoteMediaFailed: boolean;
  remoteMediaPending: boolean;
  remoteThumbnailUrls: Record<number, string>;
  userId?: number | undefined;
}) {
  const mock = isMockModeEnabled();
  const nextNativeLocalIdRef = useRef(1);
  const pickerFlightRef = useRef(false);
  const uploadFlightRef = useRef<Set<string>>(new Set());
  const cancelledLocalIdsRef = useRef<Set<string>>(new Set());
  const preparedFilesRef = useRef<Map<string, PreparedAnnouncementNativeImage>>(new Map());
  const processingIdentitiesRef = useRef<Map<string, MediaAssetIdentity>>(new Map());
  const binaryRetryContextsRef = useRef<Map<string, MediaBinaryUploadRetryContext>>(new Map());
  const nonRetryableLocalIdsRef = useRef<Set<string>>(new Set());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const mountedRef = useRef(true);
  const lifecycleGenerationRef = useRef(0);
  const nativeUploaderRef = useRef(createNativeAnnouncementBinaryUploader());
  const [adding, setAdding] = useState(false);
  const [draggingLocalId, setDraggingLocalId] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const previewItems: UploadPreviewItem[] = [];
  items.forEach((item, index) => {
    const prepared = preparedFilesRef.current.get(item.localId);
    if (prepared) {
      previewItems.push({index, kind: 'local', localId: item.localId, uri: prepared.uri});
      return;
    }
    if (item.status !== 'ready') return;
    if (item.localId.startsWith('mock-')) {
      previewItems.push({index, kind: 'mock', localId: item.localId});
      return;
    }
    if (item.localId.startsWith('asset-')) {
      previewItems.push({
        assetId: item.assetId,
        index,
        kind: 'remote',
        localId: item.localId,
        signedUrl: remoteThumbnailUrls[item.assetId],
      });
    }
  });
  const autoScroll = useHorizontalDragAutoScroll({
    itemExtent: 92,
    onReorderAtEdge: useCallback((localId: string, direction: -1 | 1) => {
      onChange((current) => {
        const fromIndex = current.findIndex((candidate) => candidate.localId === localId);
        if (fromIndex < 0) return current;
        return moveUploadItem(
          current,
          fromIndex,
          Math.max(0, Math.min(current.length - 1, fromIndex + direction)),
        );
      });
    }, [onChange]),
  });

  useLayoutEffect(() => {
    const lifecycleGeneration = lifecycleGenerationRef.current + 1;
    lifecycleGenerationRef.current = lifecycleGeneration;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (lifecycleGenerationRef.current === lifecycleGeneration) {
        lifecycleGenerationRef.current += 1;
      }
      abortControllersRef.current.forEach((controller) => controller.abort());
      abortControllersRef.current.clear();
      const prepared = [...preparedFilesRef.current.values()];
      preparedFilesRef.current.clear();
      binaryRetryContextsRef.current.clear();
      void discardPreparedAnnouncementImages(prepared);
    };
  }, []);

  const addMock = async () => {
    if (pickerFlightRef.current) return;
    pickerFlightRef.current = true;
    setAdding(true);
    onBusyChange(true);
    try {
      const assetId = nextAdminMockAssetId(items);
      onChange((current) => [
        ...current,
        {assetId, localId: `mock-${assetId}`, status: 'ready'},
      ]);
      await Promise.resolve();
    } finally {
      pickerFlightRef.current = false;
      if (mountedRef.current) {
        setAdding(false);
        onBusyChange(false);
      }
    }
  };

  const uploadPrepared = async (
    localId: string,
    prepared: PreparedAnnouncementNativeImage,
    retryContext?: MediaBinaryUploadRetryContext,
  ) => {
    if (
      !mountedRef.current ||
      cancelledLocalIdsRef.current.has(localId) ||
      preparedFilesRef.current.get(localId) !== prepared
    ) return;
    if (uploadFlightRef.current.has(localId)) return;
    uploadFlightRef.current.add(localId);
    processingIdentitiesRef.current.delete(localId);
    if (!retryContext) binaryRetryContextsRef.current.delete(localId);
    nonRetryableLocalIdsRef.current.delete(localId);
    const controller = new AbortController();
    let binaryAttemptStarted = false;
    abortControllersRef.current.set(localId, controller);
    onChange((current) => reconcileUploadItem(current, localId, {
      localId,
      progress: 0,
      status: 'uploading',
    }));
    try {
      const token = await resolveCurrentAccessToken(() => undefined);
      if (!token) throw new Error('session');
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        cancelledLocalIdsRef.current.has(localId) ||
        preparedFilesRef.current.get(localId) !== prepared
      ) return;
      const uploadArguments = {
        api,
        campusId,
        file: {
          byteSize: prepared.byteSize,
          contentType: prepared.contentType,
          localUri: prepared.uri,
          sha256: prepared.sha256,
        },
        onProgress: (progress: number) => {
          if (!mountedRef.current || controller.signal.aborted) return;
          onChange((current) => reconcileUploadItem(current, localId, {
            localId,
            progress,
            status: 'uploading',
          }));
        },
        signal: controller.signal,
        token,
        uploader: nativeUploaderRef.current,
      };
      binaryAttemptStarted = true;
      const ready = retryContext
        ? await retryAnnouncementImageUpload({...uploadArguments, context: retryContext})
        : await uploadAnnouncementImage({...uploadArguments, file: uploadArguments.file});
      if (mountedRef.current && !controller.signal.aborted) {
        processingIdentitiesRef.current.delete(localId);
        binaryRetryContextsRef.current.delete(localId);
        onChange((current) => reconcileUploadItem(current, localId, {
          assetId: ready.assetId,
          localId,
          status: 'ready',
        }));
      }
    } catch (error) {
      if (mountedRef.current && !controller.signal.aborted) {
        const processing = error instanceof MediaAssetProcessingError;
        const binaryUncertain = error instanceof MediaBinaryUploadUncertainError;
        const completionRejected = error instanceof MediaAssetCompletionRejectedError;
        if (processing) processingIdentitiesRef.current.set(localId, error.identity);
        else processingIdentitiesRef.current.delete(localId);
        if (binaryUncertain) binaryRetryContextsRef.current.set(localId, error.context);
        else if (!retryContext || binaryAttemptStarted) binaryRetryContextsRef.current.delete(localId);
        if (completionRejected) nonRetryableLocalIdsRef.current.add(localId);
        onChange((current) => reconcileUploadItem(current, localId, {
          localId,
          message: processing
            ? error.reason === 'rateLimited'
              ? '요청이 많아 잠시 기다려야 합니다. 업로드를 반복하지 말고 잠시 후 처리 상태만 다시 확인해 주세요.'
              : '이미지 처리가 진행 중입니다. 업로드를 반복하지 않고 처리 상태만 다시 확인할 수 있습니다.'
            : binaryUncertain
              ? '업로드 응답을 확인하지 못했습니다. 새 예약을 만들지 않고 같은 업로드 대상으로 다시 시도할 수 있습니다.'
            : completionRejected
              ? completionRejectionMessage(error)
              : error instanceof MediaBinaryUploadHttpError && error.status === 429
                ? '이미지 업로드 요청이 많습니다. 잠시 후 이 이미지만 다시 시도해 주세요.'
              : error instanceof FaithLogApiError && error.detail.status === 429
                ? '이미지 업로드 요청이 많습니다. 잠시 후 이 이미지만 다시 시도해 주세요.'
                : '업로드하지 못했습니다. 이 이미지만 다시 시도할 수 있습니다.',
          status: 'failed',
        }));
      }
    } finally {
      uploadFlightRef.current.delete(localId);
      abortControllersRef.current.delete(localId);
    }
  };

  const resumeProcessing = async (localId: string, identity: MediaAssetIdentity) => {
    if (uploadFlightRef.current.has(localId) || cancelledLocalIdsRef.current.has(localId)) return;
    uploadFlightRef.current.add(localId);
    const controller = new AbortController();
    abortControllersRef.current.set(localId, controller);
    onChange((current) => reconcileUploadItem(current, localId, {
      localId,
      progress: 0.99,
      status: 'uploading',
    }));
    try {
      const token = await resolveCurrentAccessToken(() => undefined);
      if (!token) throw new Error('session');
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        cancelledLocalIdsRef.current.has(localId) ||
        processingIdentitiesRef.current.get(localId) !== identity
      ) return;
      const ready = await resumeAnnouncementImageCompletion({
        api,
        campusId,
        identity,
        signal: controller.signal,
        token,
      });
      if (mountedRef.current && !controller.signal.aborted) {
        processingIdentitiesRef.current.delete(localId);
        onChange((current) => reconcileUploadItem(current, localId, {
          assetId: ready.assetId,
          localId,
          status: 'ready',
        }));
      }
    } catch (error) {
      if (mountedRef.current && !controller.signal.aborted) {
        const processing = error instanceof MediaAssetProcessingError;
        const completionRejected = error instanceof MediaAssetCompletionRejectedError;
        if (processing) processingIdentitiesRef.current.set(localId, error.identity);
        if (completionRejected) {
          processingIdentitiesRef.current.delete(localId);
          nonRetryableLocalIdsRef.current.add(localId);
        }
        onChange((current) => reconcileUploadItem(current, localId, {
          localId,
          message: processing
            ? error.reason === 'rateLimited'
              ? '요청이 많습니다. 잠시 후 처리 상태를 다시 확인해 주세요.'
              : '이미지 처리가 아직 끝나지 않았습니다. 처리 상태를 다시 확인해 주세요.'
            : completionRejected
              ? completionRejectionMessage(error)
              : '처리 상태를 확인하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.',
          status: 'failed',
        }));
      }
    } finally {
      uploadFlightRef.current.delete(localId);
      abortControllersRef.current.delete(localId);
    }
  };

  const addNative = async () => {
    if (pickerFlightRef.current) return false;
    pickerFlightRef.current = true;
    setAdding(true);
    onBusyChange(true);
    setSectionError(null);
    const lifecycleGeneration = lifecycleGenerationRef.current;
    try {
      const result = await pickAndPrepareAnnouncementImages();
      if (
        !mountedRef.current ||
        lifecycleGeneration !== lifecycleGenerationRef.current
      ) {
        await discardPreparedAnnouncementImages(result.prepared);
        return false;
      }
      const pending: Array<{file: PreparedAnnouncementNativeImage; localId: string}> = [];
      const nextItems: UploadItem[] = [];
      const orderedResults = [
        ...result.prepared.map((file) => ({file, kind: 'prepared' as const, sourceIndex: file.sourceIndex})),
        ...result.failures.map((failure) => ({failure, kind: 'failed' as const, sourceIndex: failure.sourceIndex})),
      ].sort((left, right) => left.sourceIndex - right.sourceIndex);
      orderedResults.forEach((resultItem) => {
        const localId = `native-${nextNativeLocalIdRef.current++}`;
        if (resultItem.kind === 'prepared') {
          preparedFilesRef.current.set(localId, resultItem.file);
          pending.push({file: resultItem.file, localId});
          nextItems.push({localId, progress: 0, status: 'uploading'});
        } else {
          nextItems.push({
            localId,
            message: resultItem.failure.userMessage,
            status: 'failed',
          });
        }
      });
      if (nextItems.length > 0) {
        onChange((current) => [...current, ...nextItems]);
      }
      if (result.failures.length > 0) {
        setSectionError('일부 이미지를 처리하지 못했습니다. 성공한 이미지는 그대로 유지됩니다.');
      }
      for (const item of pending) {
        if (
          !cancelledLocalIdsRef.current.has(item.localId) &&
          preparedFilesRef.current.get(item.localId) === item.file
        ) {
          await uploadPrepared(item.localId, item.file);
        }
      }
      return nextItems.length > 0;
    } catch {
      if (mountedRef.current) {
        setSectionError('사진 보관함을 열거나 이미지를 처리하지 못했습니다. 다시 시도해 주세요.');
      }
      return false;
    } finally {
      pickerFlightRef.current = false;
      if (mountedRef.current) {
        setAdding(false);
        onBusyChange(false);
      }
    }
  };

  const retry = async (item: Extract<UploadItem, {status: 'failed'}>) => {
    const processingIdentity = processingIdentitiesRef.current.get(item.localId);
    if (processingIdentity) {
      await resumeProcessing(item.localId, processingIdentity);
      return;
    }
    const prepared = preparedFilesRef.current.get(item.localId);
    if (prepared) {
      cancelledLocalIdsRef.current.delete(item.localId);
      await uploadPrepared(
        item.localId,
        prepared,
        binaryRetryContextsRef.current.get(item.localId),
      );
      return;
    }
    if (pickerFlightRef.current) {
      setSectionError('현재 선택한 이미지 처리가 끝난 뒤 다시 시도해 주세요.');
      return;
    }
    const replacementAdded = await addNative();
    if (replacementAdded) remove(item.localId);
  };

  const remove = (localId: string) => {
    cancelledLocalIdsRef.current.add(localId);
    abortControllersRef.current.get(localId)?.abort();
    abortControllersRef.current.delete(localId);
    const prepared = preparedFilesRef.current.get(localId);
    preparedFilesRef.current.delete(localId);
    if (prepared) void discardPreparedAnnouncementImages([prepared]);
    processingIdentitiesRef.current.delete(localId);
    binaryRetryContextsRef.current.delete(localId);
    nonRetryableLocalIdsRef.current.delete(localId);
    uploadFlightRef.current.delete(localId);
    onChange((current) => current.filter((candidate) => candidate.localId !== localId));
  };

  return (
    <Card>
      <View style={styles.cardTop}>
        <Text style={styles.label}>이미지</Text>
        {mock ? (
          <CompactButton
            accessibilityLabel="샘플 이미지 추가"
            disabled={adding}
            label={adding ? '추가 중' : '샘플 추가'}
            onPress={() => void addMock()}
          />
        ) : (
          <CompactButton
            accessibilityLabel="공지 이미지 선택"
            disabled={adding}
            label={adding ? '처리 중' : '사진 선택'}
            onPress={() => void addNative()}
            primary
          />
        )}
      </View>
      <Text style={styles.meta}>
        {mock
          ? 'Mock에서는 여러 이미지의 추가, 삭제와 순서를 확인할 수 있습니다.'
          : '사진은 한 번에 최대 50장을 JPEG로 정리한 뒤 개별 업로드하며, 실패한 이미지만 다시 시도할 수 있습니다.'}
      </Text>
      {sectionError ? <Text accessibilityRole="alert" style={styles.error}>{sectionError}</Text> : null}
      {remoteMediaFailed ? (
        <View style={styles.inlineMediaState}>
          <Text accessibilityRole="alert" style={styles.meta}>
            기존 첨부 이미지 미리보기를 불러오지 못했습니다. 첨부 항목은 그대로 유지됩니다.
          </Text>
          <CompactButton
            accessibilityLabel="기존 첨부 이미지 다시 불러오기"
            label="다시 시도"
            onPress={() => void onRetryRemoteMedia()}
          />
        </View>
      ) : null}
      {previewItems.length > 0 ? (
        <View ref={autoScroll.viewportRef} onLayout={autoScroll.onViewportLayout}>
        <FlatList
          accessibilityLabel="공지 이미지 미리보기 목록"
          contentContainerStyle={styles.previewRail}
          data={previewItems}
          getItemLayout={(_data, index) => ({index, length: 92, offset: 92 * index})}
          horizontal
          initialNumToRender={4}
          keyExtractor={(preview) => preview.localId}
          maxToRenderPerBatch={4}
          onContentSizeChange={autoScroll.onContentSizeChange}
          onScroll={autoScroll.onScroll}
          ref={autoScroll.bindList}
          removeClippedSubviews={false}
          scrollEnabled={draggingLocalId === null}
          scrollEventThrottle={16}
          renderItem={({item: preview}) => (
            <DraggableAnnouncementPreview
              disabled={items[preview.index]?.status === 'uploading'}
              index={preview.index}
              key={preview.localId}
              onMove={(fromIndex, toIndex) => onChange((current) =>
                moveUploadItem(current, fromIndex, toIndex))}
              onDragEnd={(offset) => {
                const autoScrolled = autoScroll.endDrag();
                setDraggingLocalId(null);
                if (autoScrolled) return;
                const delta = Math.round(offset / 92);
                onChange((current) => {
                  const fromIndex = current.findIndex((candidate) => candidate.localId === preview.localId);
                  if (fromIndex < 0) return current;
                  return moveUploadItem(
                    current,
                    fromIndex,
                    Math.max(0, Math.min(current.length - 1, fromIndex + delta)),
                  );
                });
              }}
              onDragMove={autoScroll.updateDragPosition}
              onDragStart={() => {
                setDraggingLocalId(preview.localId);
                autoScroll.startDrag(preview.localId);
              }}
              onRemove={() => remove(preview.localId)}
              progress={getUploadProgress(items[preview.index])}
              status={items[preview.index]?.status ?? 'ready'}
              total={items.length}>
              {preview.kind === 'local' ? (
                <Image
                  accessibilityLabel={`이미지 ${preview.index + 1} 미리보기`}
                  resizeMode="cover"
                  source={{uri: preview.uri}}
                  style={styles.uploadPreviewImage}
                />
              ) : preview.kind === 'mock' ? (
                <View
                  accessibilityLabel={`이미지 ${preview.index + 1} 미리보기`}
                  style={styles.mockUploadPreview}>
                  <Text style={styles.mockUploadPreviewText}>샘플</Text>
                </View>
              ) : (
                <AnnouncementRetryableImage
                  assetId={preview.assetId}
                  campusId={campusId}
                  imageAccessibilityLabel={`이미지 ${preview.index + 1} 미리보기`}
                  imageStyle={styles.uploadPreviewImage}
                  loadingAccessibilityLabel={`이미지 ${preview.index + 1} 미리보기 불러오는 중`}
                  onRetry={async () => {
                    const urls = await onRetryRemoteMedia();
                    return urls?.[preview.assetId] !== undefined;
                  }}
                  pending={remoteMediaPending}
                  retryAccessibilityLabel={`이미지 ${preview.index + 1} 미리보기 다시 불러오기`}
                  signedUrl={preview.signedUrl}
                  style={styles.uploadPreviewImage}
                  userId={userId}
                  variant="thumbnail"
                />
              )}
            </DraggableAnnouncementPreview>
          )}
          showsHorizontalScrollIndicator={false}
          windowSize={3}
        />
        </View>
      ) : null}
      {items
        .map((item, index) => ({index, item}))
        .filter((entry): entry is {index: number; item: Extract<UploadItem, {status: 'failed'}>} =>
          entry.item.status === 'failed')
        .map(({item, index}) => {
        const prepared = preparedFilesRef.current.get(item.localId);
        return (
        <View key={item.localId} style={styles.uploadRow}>
          <Text style={styles.error}>이미지 {index + 1} · {item.message}</Text>
          {!nonRetryableLocalIdsRef.current.has(item.localId) ? (
            <View
              accessibilityLabel={`이미지 ${index + 1} 작업`}
              style={styles.actionRow}>
              <CompactButton
                accessibilityLabel={`이미지 ${index + 1} 업로드 다시 시도`}
                disabled={adding && !prepared}
                label="재시도"
                onPress={() => void retry(item)}
              />
            </View>
          ) : null}
        </View>
        );
      })}
    </Card>
  );
}

function DraggableAnnouncementPreview({
  children,
  disabled,
  index,
  onDragEnd,
  onDragMove,
  onDragStart,
  onMove,
  onRemove,
  progress,
  status,
  total,
}: {
  children: ReactNode;
  disabled: boolean;
  index: number;
  onDragEnd: (offset: number) => void;
  onDragMove: (pageX: number) => void;
  onDragStart: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onRemove: () => void;
  progress?: number | undefined;
  status: UploadItem['status'];
  total: number;
}) {
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const move = useCallback((direction: -1 | 1) => {
    if (disabled) return;
    const target = Math.max(0, Math.min(total - 1, index + direction));
    if (target !== index) onMove(index, target);
  }, [disabled, index, onMove, total]);
  const finishDrag = useCallback((horizontalOffset?: number) => {
    const offset = horizontalOffset ?? dragOffsetRef.current;
    if (draggingRef.current) onDragEnd(offset);
    draggingRef.current = false;
    dragOffsetRef.current = 0;
    setDragOffset(0);
    setDragging(false);
  }, [onDragEnd]);

  return (
    <View style={styles.draggablePreview}>
      <Pressable
        accessibilityActions={[
          {name: 'decrement', label: '왼쪽으로 이동'},
          {name: 'increment', label: '오른쪽으로 이동'},
        ]}
        accessibilityHint="이미지를 좌우로 끌거나 화면 읽기 도구의 조절 동작으로 순서를 변경합니다."
        accessibilityLabel={`이미지 ${index + 1} 순서 이동`}
        accessibilityRole="adjustable"
        accessibilityState={{disabled}}
        delayLongPress={280}
        onLongPress={(event) => {
          if (disabled) return;
          dragStartXRef.current = event.nativeEvent.pageX;
          draggingRef.current = true;
          onDragStart();
          setDragging(true);
        }}
        onTouchCancel={() => finishDrag()}
        onTouchEnd={() => finishDrag()}
        onTouchMove={(event) => {
          if (!draggingRef.current) return;
          const offset = event.nativeEvent.pageX - dragStartXRef.current;
          dragOffsetRef.current = offset;
          setDragOffset(offset);
          onDragMove(event.nativeEvent.pageX);
        }}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'decrement') move(-1);
          if (event.nativeEvent.actionName === 'increment') move(1);
        }}
        style={[
          styles.uploadPreview,
          disabled && styles.uploadPreviewLocked,
          dragging && styles.uploadPreviewDragging,
          dragging ? {transform: [{translateX: dragOffset}, {scale: 1.06}]} : null,
        ]}>
        {children}
        <View pointerEvents="none" style={styles.dragIndicator}>
          <Text style={styles.dragIndicatorText}>↔</Text>
        </View>
        {status === 'uploading' ? (
          <View pointerEvents="none" style={styles.uploadProgressOverlay}>
            <Text style={styles.uploadProgressText}>{Math.round((progress ?? 0) * 100)}%</Text>
          </View>
        ) : null}
        {status === 'failed' ? (
          <View pointerEvents="none" style={styles.uploadFailedBadge}>
            <Text style={styles.uploadFailedBadgeText}>!</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityLabel={`이미지 ${index + 1} 삭제`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onRemove}
        style={({pressed}) => [styles.previewRemoveButton, pressed && styles.pressed]}>
        <Text style={styles.previewRemoveText}>×</Text>
      </Pressable>
    </View>
  );
}

function getUploadProgress(item: UploadItem | undefined) {
  return item?.status === 'uploading' ? item.progress : undefined;
}

function AnnouncementConfirmationSheet({
  accessibilityLabel,
  busy,
  cancelAccessibilityLabel,
  confirmAccessibilityLabel,
  confirmLabel,
  error,
  message,
  onCancel,
  onConfirm,
  title,
  visible,
}: {
  accessibilityLabel: string;
  busy: boolean;
  cancelAccessibilityLabel: string;
  confirmAccessibilityLabel: string;
  confirmLabel: string;
  error: string | null;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  visible: boolean;
}) {
  return (
    <Modal
      accessibilityViewIsModal
      animationType="slide"
      onRequestClose={busy ? undefined : onCancel}
      transparent
      visible={visible}>
      <View style={styles.confirmationBackdrop}>
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="alert"
          accessibilityViewIsModal
          onAccessibilityEscape={busy ? undefined : onCancel}
          style={styles.confirmationSheet}>
          <ScrollView
            contentContainerStyle={styles.confirmationContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Text style={styles.confirmationTitle}>{title}</Text>
            <Text style={styles.previewBody}>{message}</Text>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </ScrollView>
          <View style={styles.confirmationActions}>
            <Pressable
              accessibilityLabel={cancelAccessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{disabled: busy}}
              disabled={busy}
              onPress={onCancel}
              style={({pressed}) => [
                styles.confirmationSecondary,
                busy && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.confirmationSecondaryText}>취소</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={confirmAccessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{busy, disabled: busy}}
              disabled={busy}
              onPress={onConfirm}
              style={({pressed}) => [
                styles.confirmationPrimary,
                busy && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.confirmationPrimaryText}>{busy ? '처리 중' : confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Choice({
  accessibilityLabel,
  label,
  onPress,
  selected,
}: {
  accessibilityLabel: string;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radio"
      accessibilityState={{checked: selected}}
      onPress={onPress}
      style={[styles.tab, selected && styles.tabActive]}>
      <Text style={[styles.tabText, selected && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function CompactButton({
  accessibilityLabel,
  disabled = false,
  label,
  onPress,
  primary = false,
}: {
  accessibilityLabel?: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({pressed}) => [
        styles.compact,
        primary && styles.compactPrimary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.compactText, primary && styles.compactPrimaryText]}>{label}</Text>
    </Pressable>
  );
}

function EditorActionButton({
  accessibilityLabel,
  disabled = false,
  label,
  onPress,
  primary = false,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.editorActionButton,
        primary ? styles.editorActionPrimary : styles.editorActionSecondary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Text style={primary ? styles.editorActionPrimaryText : styles.editorActionSecondaryText}>
        {label}
      </Text>
    </Pressable>
  );
}

function getEditorConfirmation(
  detail: AnnouncementDetail | null,
  publishMode: 'NOW' | 'SCHEDULED',
  publishAt: Date,
) {
  if (detail?.status === 'SCHEDULED' && publishMode === 'NOW') {
    return {
      confirmAccessibilityLabel: '공지 게시 확인 실행',
      confirmLabel: '게시',
      message: '예약 공지를 지금 게시합니다. 이 명시적인 게시 전환에서 게시 알림이 처리됩니다.',
      openAccessibilityLabel: '공지 게시 확인 열기',
      openLabel: '게시 내용 확인',
      title: '공지 게시 확인',
    };
  }
  if (detail?.status === 'SCHEDULED' && publishMode === 'SCHEDULED') {
    return {
      confirmAccessibilityLabel: '공지 예약 수정 확인 실행',
      confirmLabel: '예약 수정',
      message: `${formatDutyDateTimeLabel(publishAt)}에 게시되도록 예약 공지를 수정합니다.`,
      openAccessibilityLabel: '공지 예약 수정 확인 열기',
      openLabel: '예약 수정 확인',
      title: '공지 예약 수정 확인',
    };
  }
  if (detail) {
    return {
      confirmAccessibilityLabel: '공지 수정 확인 실행',
      confirmLabel: '수정 저장',
      message: '현재 공지의 수정 내용을 저장합니다. 게시된 공지의 알림은 다시 발송하지 않습니다.',
      openAccessibilityLabel: '공지 수정 확인 열기',
      openLabel: '수정 내용 확인',
      title: '공지 수정 확인',
    };
  }
  if (publishMode === 'SCHEDULED') {
    return {
      confirmAccessibilityLabel: '공지 예약 확인 실행',
      confirmLabel: '예약',
      message: `${formatDutyDateTimeLabel(publishAt)}에 공지가 게시되도록 예약합니다.`,
      openAccessibilityLabel: '공지 예약 확인 열기',
      openLabel: '예약 내용 확인',
      title: '공지 예약 확인',
    };
  }
  return {
    confirmAccessibilityLabel: '공지 게시 확인 실행',
    confirmLabel: '게시',
    message: '미리보기의 내용으로 공지를 지금 게시합니다.',
    openAccessibilityLabel: '공지 게시 확인 열기',
    openLabel: '게시 내용 확인',
    title: '공지 게시 확인',
  };
}

function replaceCategory(
  items: AnnouncementCategory[],
  replacement: AnnouncementCategory,
) {
  return items.map((item) => item.id === replacement.id ? replacement : item);
}

function compareCategories(left: AnnouncementCategory, right: AnnouncementCategory) {
  return left.sortOrder - right.sortOrder || left.id - right.id;
}

function nextCategorySortOrder(items: AnnouncementCategory[]) {
  return items.reduce((maximum, item) => Math.max(maximum, item.sortOrder), -1) + 1;
}

function completionRejectionMessage(error: MediaAssetCompletionRejectedError) {
  if (error.detail.kind === 'sessionExpired') {
    return '로그인이 만료되어 이미지 처리를 확인할 수 없습니다. 다시 로그인한 뒤 공지를 확인해 주세요.';
  }
  if (error.detail.kind === 'permissionDenied') {
    return '이 이미지 처리를 완료할 권한이 없습니다. 이미지를 삭제하고 권한을 확인해 주세요.';
  }
  if (error.detail.kind === 'conflict') {
    return '이미지 처리 상태가 서버 기록과 충돌했습니다. 중복 업로드를 막기 위해 이 이미지를 삭제한 뒤 다시 선택해 주세요.';
  }
  return '이미지 처리를 완료할 수 없습니다. 중복 업로드를 막기 위해 이 이미지를 삭제한 뒤 다시 선택해 주세요.';
}

function nextAdminMockAssetId(items: UploadItem[]) {
  const minimum = items.reduce(
    (next, item) => item.status === 'ready' ? Math.max(next, item.assetId + 1) : next,
    9000,
  );
  nextAdminMockAssetIdSequence = Math.max(nextAdminMockAssetIdSequence, minimum);
  if (!Number.isSafeInteger(nextAdminMockAssetIdSequence) || nextAdminMockAssetIdSequence <= 0) {
    throw new Error('Mock announcement asset ID sequence exhausted');
  }
  return nextAdminMockAssetIdSequence++;
}

function getInitialPublishDate(value: string | null | undefined) {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5);
  return date;
}

function statusLabel(status: AnnouncementStatus) {
  return status === 'PUBLISHED' ? '게시됨' : status === 'SCHEDULED' ? '게시 예정' : '보관됨';
}

function formatDate(value: string | null) {
  if (!value) return '게시 시각 미정';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '게시 시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium', timeStyle: 'short'}).format(date);
}

function toApiError(error: unknown): ApiError {
  return error instanceof FaithLogApiError
    ? error.detail
    : {kind: 'error', message: '요청을 처리하지 못했습니다.'};
}

function hasUniqueCategorySortOrders(items: readonly AnnouncementCategory[]) {
  const orders = new Set<number>();
  for (const item of items) {
    if (
      !Number.isSafeInteger(item.sortOrder) ||
      item.sortOrder < 0 ||
      orders.has(item.sortOrder)
    ) return false;
    orders.add(item.sortOrder);
  }
  return true;
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  adminCardBadges: {alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 8},
  adminCardMetaRow: {alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between'},
  adminDate: {color: colors.textMuted, fontSize: 13, lineHeight: 18},
  adminStatus: {color: colors.textMuted, fontSize: 12, fontWeight: '700'},
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    gap: 10,
    padding: spacing.card,
  },
  cardTitle: {...typography.cardTitle, color: colors.textPrimary},
  cardTop: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  categoryActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  categoryList: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  categoryRow: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radius.pill,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 44,
    padding: 2,
  },
  categoryRowSelected: {backgroundColor: colors.primarySoft, borderColor: colors.primary},
  categorySectionCopy: {flex: 1, gap: 3},
  categorySectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  choice: {
    borderColor: colors.borderSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    padding: 4,
  },
  choiceActive: {borderColor: colors.primary},
  compact: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
  },
  compactPrimary: {backgroundColor: colors.primary},
  compactPrimaryText: {color: colors.surface},
  compactText: {color: colors.primary, fontSize: 13, fontWeight: '800'},
  confirmationActions: {flexDirection: 'row', gap: 10},
  confirmationBackdrop: {
    backgroundColor: 'rgba(25, 31, 40, 0.32)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  confirmationContent: {gap: spacing.gap},
  confirmationPrimary: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.item,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmationPrimaryText: {color: colors.surface, fontSize: 14, fontWeight: '800'},
  confirmationSecondary: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: radius.item,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmationSecondaryText: {color: colors.textSecondary, fontSize: 14, fontWeight: '800'},
  confirmationSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: spacing.card,
    maxHeight: '90%',
    padding: spacing.screenX,
  },
  confirmationTitle: {color: colors.textPrimary, fontSize: 22, fontWeight: '800', lineHeight: 30},
  disabled: {opacity: 0.48},
  editorActionButton: {
    alignItems: 'center',
    borderRadius: radius.control,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  editorActionPrimary: {backgroundColor: colors.primary},
  editorActionPrimaryText: {color: colors.surface, fontSize: 14, fontWeight: '800'},
  editorActionSecondary: {backgroundColor: colors.borderSoft},
  editorActionSecondaryText: {color: colors.textSecondary, fontSize: 14, fontWeight: '800'},
  editorActions: {flexDirection: 'row', gap: spacing.gap},
  error: {color: colors.danger, fontSize: 14, lineHeight: 20},
  label: {...typography.label, color: colors.textPrimary},
  inlineMediaState: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.item,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: 12,
  },
  meta: {color: colors.textMuted, flex: 1, fontSize: 13, lineHeight: 18},
  multiline: {
    backgroundColor: colors.background,
    borderColor: colors.borderSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 144,
    padding: 14,
  },
  page: {gap: spacing.gap, paddingBottom: 120},
  mockUploadPreview: {alignItems: 'center', backgroundColor: colors.primarySoft, height: '100%', justifyContent: 'center', width: '100%'},
  mockUploadPreviewText: {color: colors.primary, fontSize: 12, fontWeight: '800'},
  pinned: {color: colors.primary, fontSize: 12, fontWeight: '700'},
  pressed: {opacity: 0.7},
  previewBody: {...typography.body, color: colors.textSecondary},
  previewRail: {gap: 8, paddingVertical: 2},
  scheduleButton: {
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    borderColor: colors.borderSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  scheduleButtonText: {color: colors.textPrimary, fontSize: 15, fontWeight: '700'},
  scheduleField: {gap: 8},
  selectedCategoryActions: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.borderSoft,
    borderRadius: radius.item,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 12,
  },
  selectedCategoryCaption: {color: colors.textMuted, fontSize: 12, fontWeight: '600'},
  selectedCategoryName: {color: colors.textPrimary, flex: 1, fontSize: 15, fontWeight: '700'},
  swatch: {borderRadius: 22, height: 44, minHeight: 44, minWidth: 44, width: 44},
  swatchSelected: {borderColor: colors.textPrimary, borderWidth: 3},
  switchRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  tab: {
    alignItems: 'center',
    borderRadius: radius.control,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  tabActive: {backgroundColor: colors.surface},
  tabText: {color: colors.textMuted, fontSize: 13, fontWeight: '700'},
  tabTextActive: {color: colors.primary},
  tabs: {
    backgroundColor: colors.borderSoft,
    borderRadius: radius.control,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  uploadRow: {backgroundColor: colors.background, borderRadius: radius.item, gap: 8, padding: 12},
  draggablePreview: {alignItems: 'center', position: 'relative', width: 84},
  dragIndicator: {alignItems: 'center', backgroundColor: 'rgba(17,24,39,0.58)', borderRadius: radius.pill, bottom: 5, height: 20, justifyContent: 'center', left: 24, position: 'absolute', width: 28},
  dragIndicatorText: {color: '#FFFFFF', fontSize: 12, fontWeight: '800'},
  previewRemoveButton: {alignItems: 'center', backgroundColor: 'rgba(17,24,39,0.82)', borderRadius: 12, height: 24, justifyContent: 'center', position: 'absolute', right: 0, top: -4, width: 24, zIndex: 2},
  previewRemoveText: {color: '#FFFFFF', fontSize: 18, fontWeight: '700', lineHeight: 20},
  uploadPreview: {borderRadius: radius.control, height: 76, overflow: 'hidden', width: 76},
  uploadPreviewDragging: {elevation: 8, opacity: 0.96, shadowColor: '#000000', shadowOffset: {height: 6, width: 0}, shadowOpacity: 0.28, shadowRadius: 10, zIndex: 4},
  uploadPreviewLocked: {opacity: 0.6},
  uploadProgressOverlay: {alignItems: 'center', backgroundColor: 'rgba(17,24,39,0.62)', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0},
  uploadProgressText: {color: '#FFFFFF', fontSize: 13, fontWeight: '800'},
  uploadFailedBadge: {alignItems: 'center', backgroundColor: colors.danger, borderRadius: 10, height: 20, justifyContent: 'center', left: 5, position: 'absolute', top: 5, width: 20},
  uploadFailedBadgeText: {color: '#FFFFFF', fontSize: 13, fontWeight: '900'},
  uploadPreviewImage: {height: '100%', width: '100%'},
  wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
