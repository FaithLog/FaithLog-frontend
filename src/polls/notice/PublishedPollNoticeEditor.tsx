import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';

import type {PollDetail} from '../../api/types';
import {resolveCurrentAccessToken} from '../../auth/accessTokenResolver';
import {mediaApi} from '../../media/mediaApi';
import type {MediaUploadItem} from '../../media/mediaUploadPolicy';
import {colors, radius, spacing, typography} from '../../theme';
import {PollNoticeEditorSection} from './PollNoticeComponents';
import {buildPollNoticeMutationFields} from './pollNoticeContract';
import {getPollNoticeCapabilities} from './pollNoticeCapabilities';
import {usePollNoticeMediaUploads} from './usePollNoticeMediaUploads';

export type PublishedPollNoticeUpdateDraft = {
  title: string;
  notice: string | null;
  imageAssetIds: number[];
};

export function PublishedPollNoticeEditor({
  onCancel,
  onSave,
  onSaved,
  poll,
}: {
  onCancel: () => void;
  onSave: (draft: PublishedPollNoticeUpdateDraft) => Promise<PollDetail>;
  onSaved: (poll: PollDetail) => void;
  poll: PollDetail;
}) {
  const [title, setTitle] = useState(poll.title);
  const [notice, setNotice] = useState(poll.notice ?? '');
  const [images, setImages] = useState<MediaUploadItem[]>(() => toSavedImages(poll));
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const capabilities = getPollNoticeCapabilities();
  const lifecycle = useRef({mounted: true, saveRequestId: 0});
  const saveFlight = useRef<Promise<void> | null>(null);

  useLayoutEffect(() => {
    lifecycle.current.mounted = true;
    return () => {
      lifecycle.current.mounted = false;
      lifecycle.current.saveRequestId += 1;
    };
  }, []);

  const noticeMediaUploads = usePollNoticeMediaUploads({
    campusId: poll.campusId,
    enabled: capabilities.canAccessMedia && saveState !== 'saving',
    items: images,
    onChange: setImages,
  });

  useEffect(() => {
    if (!capabilities.canAccessMedia || !poll.imageAssetIds?.length) return;
    let active = true;
    void resolveCurrentAccessToken(() => undefined)
      .then((accessToken) => accessToken
        ? mediaApi.getAccessUrls(accessToken, poll.campusId, poll.imageAssetIds ?? [])
        : [])
      .then((assets) => {
        if (!active || assets.length === 0) return;
        const assetsById = new Map(assets.map((asset) => [asset.assetId, asset]));
        setImages((current) => current.map((item) => {
          if (!item.assetId) return item;
          const asset = assetsById.get(item.assetId);
          return asset
            ? {...item, previewUri: asset.thumbnailUrl, sha256: asset.sha256}
            : item;
        }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [capabilities.canAccessMedia, poll.campusId, poll.imageAssetIds]);

  const save = () => {
    if (saveFlight.current) return saveFlight.current;
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setSaveState('error');
      return Promise.resolve();
    }
    const saveRequestId = ++lifecycle.current.saveRequestId;
    const isCurrentSave = () =>
      lifecycle.current.mounted && lifecycle.current.saveRequestId === saveRequestId;
    setSaveState('saving');

    const request = Promise.resolve()
      .then(() => {
        const noticeFields = buildPollNoticeMutationFields({
          notice,
          imageAssetIds: images.flatMap((item) =>
            item.status === 'ready' && item.assetId ? [item.assetId] : []),
        });
        return onSave({title: normalizedTitle, ...noticeFields});
      })
      .then((updated) => {
        if (!isCurrentSave()) return;
        setSaveState('idle');
        onSaved(updated);
      })
      .catch(() => {
        if (isCurrentSave()) setSaveState('error');
      });
    let flight!: Promise<void>;
    flight = request.finally(() => {
      if (saveFlight.current === flight) saveFlight.current = null;
    });
    saveFlight.current = flight;
    return flight;
  };
  const busy = saveState === 'saving';

  return (
    <View style={styles.shell}>
      <View style={styles.heading}>
        <Text style={styles.title}>게시된 투표 공지 수정</Text>
        <Text style={styles.description}>기존 투표 응답과 선택지는 그대로 유지됩니다.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>투표 제목</Text>
        <TextInput
          accessibilityLabel="게시된 투표 제목"
          editable={!busy}
          onChangeText={setTitle}
          style={styles.input}
          value={title}
        />
      </View>
      <View style={styles.card}>
        <PollNoticeEditorSection
          disabled={busy}
          mediaEnabled={capabilities.canAccessMedia}
          notice={notice}
          onAddImages={() => void noticeMediaUploads.add()}
          onChangeNotice={setNotice}
          onMove={(localId, direction) => setImages((current) =>
            moveImage(current, localId, direction))}
          onRemove={noticeMediaUploads.remove}
          onRetry={(localId) => void noticeMediaUploads.retry(localId)}
          uploadItems={images}
        />
      </View>
      {saveState === 'error' ? (
        <Text accessibilityRole="alert" style={styles.error}>
          공지를 저장하지 못했습니다. 입력한 내용은 유지되니 다시 시도해 주세요.
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="게시된 투표 공지 수정 취소"
          accessibilityRole="button"
          disabled={busy}
          onPress={onCancel}
          style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>취소</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="게시된 투표 공지 저장"
          accessibilityRole="button"
          accessibilityState={{busy, disabled: busy}}
          disabled={busy}
          onPress={() => void save()}
          style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{busy ? '저장 중' : '저장'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function toSavedImages(poll: PollDetail): MediaUploadItem[] {
  return (poll.imageAssetIds ?? []).map((assetId, index) => ({
    localId: `saved-${assetId}`,
    previewUri: `mock://poll-notice/${assetId}`,
    status: 'ready',
    progress: 1,
    assetId,
    sha256: String(index + 1).padStart(64, '0'),
  }));
}

function moveImage(
  images: MediaUploadItem[],
  localId: string,
  direction: 'up' | 'down',
) {
  const currentIndex = images.findIndex((item) => item.localId === localId);
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= images.length) return images;
  const next = [...images];
  const [moving] = next.splice(currentIndex, 1);
  if (!moving) return images;
  next.splice(targetIndex, 0, moving);
  return next;
}

const styles = StyleSheet.create({
  actions: {flexDirection: 'row', gap: spacing.gap},
  card: {backgroundColor: colors.surface, borderRadius: radius.card, gap: spacing.gap, padding: spacing.card},
  description: {color: colors.textSecondary, fontSize: 14, lineHeight: 20},
  error: {color: colors.danger, fontSize: 13, fontWeight: '700', lineHeight: 18},
  heading: {gap: 4},
  input: {backgroundColor: colors.surface, borderColor: colors.borderSoft, borderRadius: radius.control, borderWidth: 1, color: colors.textPrimary, minHeight: 48, paddingHorizontal: 14},
  label: {color: colors.textPrimary, fontSize: 14, fontWeight: '700'},
  primaryButton: {alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.control, flex: 1, minHeight: 48, justifyContent: 'center'},
  primaryButtonText: {color: colors.surface, fontSize: 15, fontWeight: '800'},
  secondaryButton: {alignItems: 'center', backgroundColor: colors.borderSoft, borderRadius: radius.control, flex: 1, minHeight: 48, justifyContent: 'center'},
  secondaryButtonText: {color: colors.textPrimary, fontSize: 15, fontWeight: '700'},
  shell: {gap: spacing.gap},
  title: {...typography.cardTitle, color: colors.textPrimary},
});
