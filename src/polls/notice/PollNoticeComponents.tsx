import {memo, useCallback, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {MediaAccessUrl} from '../../media/mediaTypes';
import type {MediaUploadItem} from '../../media/mediaUploadPolicy';
import {useHorizontalDragAutoScroll} from '../../media/useHorizontalDragAutoScroll';
import {AnnouncementCachedImage} from '../../announcements/AnnouncementCachedImage';
import {RichLinkBookmarks} from '../../components/RichLinkBookmarks';
import {colors, radius, spacing, typography} from '../../theme';
import {
  getPollNoticeValidationMessage,
  normalizePollNotice,
  POLL_NOTICE_MAX_LENGTH,
} from './pollNoticeContract';

export const PollNoticeBlock = memo(function PollNoticeBlock({
  enabled,
  notice,
}: {
  enabled: boolean;
  notice?: string | null | undefined;
}) {
  if (!enabled) return null;
  const normalized = typeof notice === 'string' ? normalizePollNotice(notice) : null;
  if (normalized === null) return null;
  return (
    <View accessibilityLabel={`투표 공지 ${normalized}`} style={styles.noticeBlock}>
      <Text style={styles.noticeEyebrow}>투표 공지</Text>
      <RichLinkBookmarks text={normalized} />
    </View>
  );
});

export function PollNoticeEditorSection({
  disabled,
  mediaEnabled = true,
  notice,
  onAddImages,
  onChangeNotice,
  onMove,
  onRemove,
  onRetry,
  uploadItems,
}: {
  disabled: boolean;
  mediaEnabled?: boolean;
  notice: string;
  onAddImages: () => void;
  onChangeNotice: (value: string) => void;
  onMove: (localId: string, direction: 'up' | 'down') => void;
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
  uploadItems: MediaUploadItem[];
}) {
  const validationMessage = getPollNoticeValidationMessage(notice);
  const [draggingLocalId, setDraggingLocalId] = useState<string | null>(null);
  const autoScroll = useHorizontalDragAutoScroll({
    itemExtent: 84,
    onReorderAtEdge: useCallback((localId: string, direction: -1 | 1) => {
      onMove(localId, direction < 0 ? 'up' : 'down');
    }, [onMove]),
  });
  return (
    <View style={styles.editorShell}>
      <View style={styles.editorHeading}>
        <View style={styles.grow}>
          <Text style={styles.editorTitle}>공지글</Text>
          <Text style={styles.editorDescription}>투표 제목 아래, 선택지 위에 표시됩니다.</Text>
        </View>
        <Text style={styles.counter}>{notice.length}/{POLL_NOTICE_MAX_LENGTH}</Text>
      </View>
      <TextInput
        accessibilityLabel="투표 공지글"
        accessibilityState={{disabled}}
        editable={!disabled}
        multiline
        onChangeText={onChangeNotice}
        placeholder="참여 전에 꼭 확인할 내용을 입력해 주세요."
        placeholderTextColor={colors.textMuted}
        style={[styles.noticeInput, validationMessage ? styles.inputError : null]}
        textAlignVertical="top"
        value={notice}
      />
      {validationMessage ? <Text style={styles.errorText}>{validationMessage}</Text> : null}
      <PollNoticeBlock enabled notice={notice} />
      {mediaEnabled ? (
        <View style={styles.mediaCard}>
          <View style={styles.imageHeader}>
            <Text style={styles.imageTitle}>이미지</Text>
            <Pressable
              accessibilityLabel="투표 공지 이미지 추가"
              accessibilityRole="button"
              accessibilityState={{disabled}}
              disabled={disabled}
              onPress={onAddImages}
              style={({pressed}) => [styles.photoButton, pressed ? styles.pressed : null]}>
              <Text style={styles.photoButtonText}>사진 선택</Text>
            </Pressable>
          </View>
          <Text style={styles.editorDescription}>
            사진은 한 번에 최대 50장을 JPEG로 정리한 뒤 개별 업로드하며, 실패한 이미지만 다시 시도할 수 있습니다.
          </Text>
          <View ref={autoScroll.viewportRef} onLayout={autoScroll.onViewportLayout}>
          <FlatList
            contentContainerStyle={styles.previewRail}
            data={uploadItems}
            horizontal
            initialNumToRender={4}
            keyExtractor={(item) => item.localId}
            maxToRenderPerBatch={4}
            onContentSizeChange={autoScroll.onContentSizeChange}
            onScroll={autoScroll.onScroll}
            ref={autoScroll.bindList}
            removeClippedSubviews={false}
            renderItem={({item, index}) => (
              <UploadItemRow
                disabled={disabled}
                index={index}
                item={item}
                onDragEnd={(offset) => {
                  const autoScrolled = autoScroll.endDrag();
                  setDraggingLocalId(null);
                  if (!autoScrolled && offset !== 0) {
                    onMove(item.localId, offset < 0 ? 'up' : 'down');
                  }
                }}
                onDragMove={autoScroll.updateDragPosition}
                onDragStart={() => {
                  setDraggingLocalId(item.localId);
                  autoScroll.startDrag(item.localId);
                }}
                onMove={onMove}
                onRemove={onRemove}
                onRetry={onRetry}
                total={uploadItems.length}
              />
            )}
            scrollEnabled={draggingLocalId === null}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            windowSize={3}
          />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const UploadItemRow = memo(function UploadItemRow({
  disabled,
  index,
  item,
  onDragEnd,
  onDragMove,
  onDragStart,
  onMove,
  onRemove,
  onRetry,
  total,
}: {
  disabled: boolean;
  index: number;
  item: MediaUploadItem;
  onDragEnd: (offset: number) => void;
  onDragMove: (pageX: number) => void;
  onDragStart: () => void;
  onMove: (localId: string, direction: 'up' | 'down') => void;
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
  total: number;
}) {
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const move = (direction: -1 | 1) => {
    const target = index + direction;
    if (disabled || target < 0 || target >= total) return;
    onMove(item.localId, direction < 0 ? 'up' : 'down');
  };
  const finishDrag = (horizontalOffset?: number) => {
    const offset = horizontalOffset ?? dragOffsetRef.current;
    if (draggingRef.current) onDragEnd(offset);
    draggingRef.current = false;
    dragOffsetRef.current = 0;
    setDragOffset(0);
    setDragging(false);
  };
  return (
    <View style={styles.uploadRow}>
      <Pressable
        accessibilityActions={[
          {name: 'decrement', label: '왼쪽으로 이동'},
          {name: 'increment', label: '오른쪽으로 이동'},
        ]}
        accessibilityHint="이미지를 좌우로 끌거나 화면 읽기 도구의 조절 동작으로 순서를 변경합니다."
        accessibilityLabel={`투표 공지 이미지 ${index + 1} 순서 이동`}
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
          styles.thumbnailShell,
          disabled ? styles.thumbnailLocked : null,
          dragging ? styles.thumbnailDragging : null,
          dragging ? {transform: [{translateX: dragOffset}, {scale: 1.06}]} : null,
        ]}>
        <Image source={{uri: item.previewUri}} style={styles.thumbnail} />
        <View pointerEvents="none" style={styles.dragIndicator}>
          <Text style={styles.dragIndicatorText}>↔</Text>
        </View>
        {item.status === 'uploading' ? (
          <View pointerEvents="none" style={styles.uploadProgressOverlay}>
            <Text style={styles.uploadProgressText}>{Math.round(item.progress * 100)}%</Text>
          </View>
        ) : null}
        {item.status === 'failed' ? (
          <View pointerEvents="none" style={styles.uploadFailedBadge}>
            <Text style={styles.uploadFailedBadgeText}>!</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityLabel={`투표 공지 이미지 ${index + 1} 삭제`}
        accessibilityRole="button"
        accessibilityState={{disabled}}
        disabled={disabled}
        hitSlop={8}
        onPress={() => onRemove(item.localId)}
        style={({pressed}) => [styles.previewRemoveButton, pressed ? styles.pressed : null]}>
        <Text style={styles.previewRemoveText}>×</Text>
      </Pressable>
      {item.status === 'failed' ? (
        <View style={styles.retryRow}>
          <Text numberOfLines={2} style={styles.errorText}>{item.errorMessage}</Text>
          <SmallAction accessibilityLabel="선택한 이미지 업로드 재시도" disabled={disabled} label="재시도" onPress={() => onRetry(item.localId)} />
        </View>
      ) : null}
    </View>
  );
});

function SmallAction({accessibilityLabel, disabled, label, onPress}: {accessibilityLabel: string; disabled: boolean; label: string; onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={styles.smallAction}>
      <Text style={styles.smallActionText}>{label}</Text>
    </Pressable>
  );
}

export function PollNoticeGallery({
  assets,
  campusId,
  onRetry,
  userId,
}: {
  assets: MediaAccessUrl[];
  campusId: number;
  onRetry: (assetId: number) => Promise<boolean> | boolean;
  userId: number;
}) {
  const data = useMemo(() => assets, [assets]);
  const [failedAssetIdentities, setFailedAssetIdentities] = useState<Set<string>>(
    () => new Set(),
  );
  const retryInFlightRef = useRef(false);
  const [retryInFlight, setRetryInFlight] = useState(false);
  if (data.length === 0) return null;
  return (
    <FlatList
      accessibilityLabel="투표 공지 이미지"
      data={data}
      decelerationRate="fast"
      horizontal
      initialNumToRender={2}
      keyExtractor={getMediaFailureIdentity}
      maxToRenderPerBatch={3}
      onEndReachedThreshold={0.5}
      pagingEnabled
      removeClippedSubviews
      renderItem={({item, index}) => {
        const failureIdentity = getMediaFailureIdentity(item);
        return (
          <View style={styles.galleryItem}>
            {failedAssetIdentities.has(failureIdentity) ? (
              <View style={[styles.galleryImage, styles.galleryFallback]}>
                <Text style={styles.editorDescription}>이미지를 불러오지 못했습니다.</Text>
                <Pressable
                  accessibilityLabel={`투표 공지 이미지 ${index + 1} 다시 불러오기`}
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: retryInFlight,
                    disabled: retryInFlight,
                  }}
                  disabled={retryInFlight}
                  onPress={() => {
                    if (retryInFlightRef.current) return;
                    retryInFlightRef.current = true;
                    setRetryInFlight(true);
                    void (async () => {
                      try {
                        const committed = await onRetry(item.assetId);
                        if (committed) {
                          setFailedAssetIdentities((current) => {
                            const next = new Set(current);
                            next.delete(failureIdentity);
                            return next;
                          });
                        }
                      } catch {
                        // Keep the known-failed URL hidden until a retry succeeds.
                      } finally {
                        retryInFlightRef.current = false;
                        setRetryInFlight(false);
                      }
                    })();
                  }}
                  style={styles.addButton}>
                  <Text style={styles.addButtonText}>다시 시도</Text>
                </Pressable>
              </View>
            ) : (
              <AnnouncementCachedImage
                accessibilityLabel={`투표 공지 이미지 ${index + 1}`}
                assetId={item.assetId}
                campusId={campusId}
                onError={() =>
                  setFailedAssetIdentities((current) =>
                    new Set(current).add(failureIdentity),
                  )
                }
                resizeMode="cover"
                signedUrl={item.detailUrl}
                style={styles.galleryImage}
                userId={userId}
                variant="detail"
              />
            )}
          </View>
        );
      }}
      showsHorizontalScrollIndicator={false}
      windowSize={3}
    />
  );
}

export function PollNoticeMediaPanel({
  campusId,
  enabled,
  onRetry,
  state,
  userId,
}: {
  campusId: number;
  enabled: boolean;
  onRetry: () => Promise<boolean> | boolean;
  state:
    | {status: 'empty'}
    | {status: 'success'; assets: MediaAccessUrl[]}
    | {status: 'error'};
  userId: number;
}) {
  if (!enabled) return null;
  if (state.status === 'empty') return null;
  if (state.status === 'error') {
    return (
      <View style={styles.mediaError}>
        <Text style={styles.editorDescription}>이미지를 불러오지 못했습니다.</Text>
        <Pressable accessibilityLabel="투표 공지 이미지 다시 불러오기" accessibilityRole="button" onPress={() => { void onRetry(); }} style={styles.addButton}>
          <Text style={styles.addButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <PollNoticeGallery
      assets={state.assets}
      campusId={campusId}
      onRetry={() => onRetry()}
      userId={userId}
    />
  );
}

function getMediaFailureIdentity(asset: MediaAccessUrl) {
  return `${asset.assetId}:${asset.sha256}:detail`;
}

const styles = StyleSheet.create({
  addButton: {alignItems: 'center', backgroundColor: '#E8F3FF', borderRadius: radius.control, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12},
  addButtonText: {color: colors.primary, fontSize: 13, fontWeight: '800'},
  counter: {color: colors.textMuted, fontSize: 12, fontWeight: '600'},
  editorDescription: {color: colors.textSecondary, fontSize: 13, lineHeight: 18},
  editorHeading: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.gap},
  editorShell: {gap: spacing.gap},
  editorTitle: {...typography.cardTitle, color: colors.textPrimary},
  errorText: {color: colors.danger, fontSize: 12, lineHeight: 17},
  galleryImage: {aspectRatio: 4 / 3, backgroundColor: colors.borderSoft, borderRadius: radius.item, width: 304},
  galleryFallback: {alignItems: 'center', gap: spacing.gap, justifyContent: 'center', padding: spacing.gap},
  galleryItem: {paddingRight: spacing.gap},
  grow: {flex: 1, gap: 3, minWidth: 0},
  imageHeader: {alignItems: 'center', flexDirection: 'row', gap: spacing.gap, justifyContent: 'space-between'},
  imageTitle: {...typography.label, color: colors.textPrimary},
  inputError: {borderColor: colors.danger},
  dragIndicator: {alignItems: 'center', backgroundColor: 'rgba(17,24,39,0.58)', borderRadius: radius.pill, bottom: 5, height: 20, justifyContent: 'center', left: 22, position: 'absolute', width: 28},
  dragIndicatorText: {color: '#FFFFFF', fontSize: 12, fontWeight: '800'},
  mediaError: {alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.item, flexDirection: 'row', gap: spacing.gap, justifyContent: 'space-between', padding: 14},
  mediaCard: {gap: spacing.gap, paddingTop: spacing.gap},
  noticeBlock: {backgroundColor: '#F0F9FA', borderColor: colors.faith, borderRadius: radius.item, borderWidth: 1, gap: 6, padding: 16},
  noticeEyebrow: {color: colors.faith, fontSize: 13, fontWeight: '800'},
  noticeInput: {backgroundColor: colors.surface, borderColor: colors.borderSoft, borderRadius: radius.item, borderWidth: 1, color: colors.textPrimary, fontSize: 15, minHeight: 116, padding: 14},
  noticeText: {...typography.body, color: colors.textPrimary},
  pressed: {opacity: 0.72},
  previewRail: {gap: 8, paddingVertical: 2},
  photoButton: {alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.pill, justifyContent: 'center', minHeight: 44, minWidth: 44, paddingHorizontal: 12},
  photoButtonText: {color: '#FFFFFF', fontSize: 13, fontWeight: '800'},
  smallAction: {alignItems: 'center', borderColor: colors.borderSoft, borderRadius: radius.control, borderWidth: 1, justifyContent: 'center', minHeight: 44, minWidth: 44, paddingHorizontal: 8},
  smallActionText: {color: colors.textSecondary, fontSize: 12, fontWeight: '700'},
  previewRemoveButton: {alignItems: 'center', backgroundColor: 'rgba(17,24,39,0.82)', borderRadius: 12, height: 24, justifyContent: 'center', position: 'absolute', right: 0, top: -4, width: 24, zIndex: 2},
  previewRemoveText: {color: '#FFFFFF', fontSize: 18, fontWeight: '700', lineHeight: 20},
  retryRow: {gap: 4, marginTop: 6, width: 84},
  thumbnail: {backgroundColor: colors.borderSoft, borderRadius: radius.control, height: 76, width: 76},
  thumbnailLocked: {opacity: 0.6},
  thumbnailDragging: {elevation: 8, opacity: 0.96, shadowColor: '#000000', shadowOffset: {height: 6, width: 0}, shadowOpacity: 0.28, shadowRadius: 10, zIndex: 4},
  thumbnailShell: {borderRadius: radius.control, height: 76, width: 76},
  uploadFailedBadge: {alignItems: 'center', backgroundColor: colors.danger, borderRadius: 10, height: 20, justifyContent: 'center', left: 5, position: 'absolute', top: 5, width: 20},
  uploadFailedBadgeText: {color: '#FFFFFF', fontSize: 13, fontWeight: '900'},
  uploadProgressOverlay: {alignItems: 'center', backgroundColor: 'rgba(17,24,39,0.62)', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0},
  uploadProgressText: {color: '#FFFFFF', fontSize: 13, fontWeight: '800'},
  uploadRow: {paddingTop: 4, position: 'relative', width: 84},
});
