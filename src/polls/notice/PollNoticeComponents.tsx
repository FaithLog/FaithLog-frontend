import {memo, useMemo, useRef, useState} from 'react';
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
import {colors, radius, spacing, typography} from '../../theme';
import {
  getPollNoticeValidationMessage,
  normalizePollNotice,
  POLL_NOTICE_MAX_LENGTH,
} from './pollNoticeContract';

export const PollNoticeBadge = memo(function PollNoticeBadge({
  enabled,
  hasNotice,
}: {
  enabled: boolean;
  hasNotice?: boolean | undefined;
}) {
  if (!enabled || hasNotice !== true) return null;
  return (
    <View accessibilityLabel="공지 있음" accessibilityRole="text" style={styles.badge}>
      <Text style={styles.badgeText}>공지 있음</Text>
    </View>
  );
});

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
      <Text style={styles.noticeText}>{normalized}</Text>
    </View>
  );
});

export function PollNoticeEditorSection({
  disabled,
  notice,
  onAddImages,
  onChangeNotice,
  onMove,
  onRemove,
  onRetry,
  uploadItems,
}: {
  disabled: boolean;
  notice: string;
  onAddImages: () => void;
  onChangeNotice: (value: string) => void;
  onMove: (localId: string, direction: 'up' | 'down') => void;
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
  uploadItems: MediaUploadItem[];
}) {
  const validationMessage = getPollNoticeValidationMessage(notice);
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
      <View style={styles.imageHeader}>
        <View style={styles.grow}>
          <Text style={styles.editorTitle}>이미지</Text>
          <Text style={styles.editorDescription}>여러 장을 추가하고 표시 순서를 바꿀 수 있어요.</Text>
        </View>
        <Pressable
          accessibilityLabel="투표 공지 이미지 추가"
          accessibilityRole="button"
          accessibilityState={{disabled}}
          disabled={disabled}
          onPress={onAddImages}
          style={({pressed}) => [styles.addButton, pressed ? styles.pressed : null]}>
          <Text style={styles.addButtonText}>이미지 추가</Text>
        </Pressable>
      </View>
      <FlatList
        data={uploadItems}
        horizontal
        initialNumToRender={3}
        keyExtractor={(item) => item.localId}
        maxToRenderPerBatch={4}
        renderItem={({item, index}) => (
          <UploadItemRow
            disabled={disabled}
            index={index}
            item={item}
            onMove={onMove}
            onRemove={onRemove}
            onRetry={onRetry}
            total={uploadItems.length}
          />
        )}
        showsHorizontalScrollIndicator={false}
        windowSize={5}
      />
    </View>
  );
}

const UploadItemRow = memo(function UploadItemRow({
  disabled,
  index,
  item,
  onMove,
  onRemove,
  onRetry,
  total,
}: {
  disabled: boolean;
  index: number;
  item: MediaUploadItem;
  onMove: (localId: string, direction: 'up' | 'down') => void;
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
  total: number;
}) {
  return (
    <View style={styles.uploadRow}>
      <Image source={{uri: item.previewUri}} style={styles.thumbnail} />
      <View style={styles.grow}>
        <Text style={styles.uploadStatus}>{getUploadStatusLabel(item)}</Text>
        {item.status === 'uploading' ? (
          <Text style={styles.uploadMeta}>{Math.round(item.progress * 100)}%</Text>
        ) : null}
        {item.status === 'failed' ? <Text style={styles.errorText}>{item.errorMessage}</Text> : null}
      </View>
      <View style={styles.itemActions}>
        {item.status === 'failed' ? (
          <SmallAction accessibilityLabel="선택한 이미지 업로드 재시도" disabled={disabled} label="재시도" onPress={() => onRetry(item.localId)} />
        ) : null}
        <SmallAction accessibilityLabel={`이미지 ${index + 1} 앞으로 이동`} disabled={disabled || index === 0} label="↑" onPress={() => onMove(item.localId, 'up')} />
        <SmallAction accessibilityLabel={`이미지 ${index + 1} 뒤로 이동`} disabled={disabled || index === total - 1} label="↓" onPress={() => onMove(item.localId, 'down')} />
        <SmallAction accessibilityLabel={`이미지 ${index + 1} 제거`} disabled={disabled} label="삭제" onPress={() => onRemove(item.localId)} />
      </View>
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
  onRetry,
}: {
  assets: MediaAccessUrl[];
  onRetry: (assetId: number) => Promise<boolean> | boolean;
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
              <Image
                accessibilityLabel={`투표 공지 이미지 ${index + 1}`}
                onError={() =>
                  setFailedAssetIdentities((current) =>
                    new Set(current).add(failureIdentity),
                  )
                }
                resizeMode="cover"
                source={{uri: item.detailUrl}}
                style={styles.galleryImage}
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
  enabled,
  onRetry,
  state,
}: {
  enabled: boolean;
  onRetry: () => Promise<boolean> | boolean;
  state:
    | {status: 'empty'}
    | {status: 'success'; assets: MediaAccessUrl[]}
    | {status: 'error'};
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
  return <PollNoticeGallery assets={state.assets} onRetry={() => onRetry()} />;
}

function getMediaFailureIdentity(asset: MediaAccessUrl) {
  return `${asset.assetId}:${asset.detailUrl}`;
}

function getUploadStatusLabel(item: MediaUploadItem) {
  switch (item.status) {
    case 'pending': return '업로드 대기';
    case 'uploading': return '업로드 중';
    case 'failed': return '업로드 실패';
    case 'ready': return '업로드 완료';
  }
}

const styles = StyleSheet.create({
  addButton: {alignItems: 'center', backgroundColor: '#E8F3FF', borderRadius: radius.control, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12},
  addButtonText: {color: colors.primary, fontSize: 13, fontWeight: '800'},
  badge: {alignSelf: 'flex-start', backgroundColor: '#E8F3FF', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5},
  badgeText: {color: colors.primary, fontSize: 12, fontWeight: '800'},
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
  imageHeader: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.gap},
  inputError: {borderColor: colors.danger},
  itemActions: {alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end'},
  mediaError: {alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.item, flexDirection: 'row', gap: spacing.gap, justifyContent: 'space-between', padding: 14},
  noticeBlock: {backgroundColor: '#F0F9FA', borderColor: colors.faith, borderRadius: radius.item, borderWidth: 1, gap: 6, padding: 16},
  noticeEyebrow: {color: colors.faith, fontSize: 13, fontWeight: '800'},
  noticeInput: {backgroundColor: colors.surface, borderColor: colors.borderSoft, borderRadius: radius.item, borderWidth: 1, color: colors.textPrimary, fontSize: 15, minHeight: 116, padding: 14},
  noticeText: {...typography.body, color: colors.textPrimary},
  pressed: {opacity: 0.72},
  smallAction: {alignItems: 'center', borderColor: colors.borderSoft, borderRadius: radius.control, borderWidth: 1, justifyContent: 'center', minHeight: 44, minWidth: 44, paddingHorizontal: 8},
  smallActionText: {color: colors.textSecondary, fontSize: 12, fontWeight: '700'},
  thumbnail: {backgroundColor: colors.borderSoft, borderRadius: 12, height: 64, width: 64},
  uploadMeta: {color: colors.textMuted, fontSize: 12},
  uploadRow: {alignItems: 'center', borderColor: colors.borderSoft, borderRadius: radius.item, borderWidth: 1, flexDirection: 'row', gap: 10, marginRight: spacing.gap, minHeight: 76, padding: 8, width: 292},
  uploadStatus: {color: colors.textPrimary, fontSize: 13, fontWeight: '700'},
});
