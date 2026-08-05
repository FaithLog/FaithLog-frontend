import {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {DangerConfirmSheet, ScreenHeader} from '../components/ui';
import type {PdfUploadCandidate, ReadyDocumentAsset} from '../media/documentMediaTypes';
import {formatAttachmentByteSize} from '../media/pdfAttachmentPolicy';
import {colors, radius, spacing, typography} from '../theme';
import {weeklyMaterialApi, type WeeklyMaterialApi} from './weeklyMaterialApi';
import {
  formatWeeklyMaterialDeletionDate,
  getSeoulCurrentWeekStartDate,
} from './weeklyMaterialDate';
import {WeeklyMaterialPager} from './WeeklyMaterialPager';
import {
  applyWeeklyMaterialDelete,
  beginWeeklyMaterialRequest,
  createWeeklyMaterialRequestCoordinator,
  getAdjacentWeekStartDates,
  getWeeklyMaterialCacheKey,
  isWeeklyMaterialRequestCurrent,
} from './weeklyMaterialState';
import type {
  WeeklyMaterial,
  WeeklyMaterialType,
  WeeklyMaterialWeek,
} from './weeklyMaterialTypes';
import {weeklyMaterialLabels, weeklyMaterialTypes} from './weeklyMaterialTypes';

type WeekState =
  | {status: 'error'}
  | {status: 'loading'}
  | {status: 'ready'; week: WeeklyMaterialWeek};
type DraftState = {
  candidate: PdfUploadCandidate;
  error?: string;
  progress: number;
  status: 'failed' | 'ready' | 'uploading';
};
type DeleteTarget = {materialType: WeeklyMaterialType; weekStartDate: string};

export function AdminWeeklyMaterialsScreen({
  accessTokenProvider = defaultAccessTokenProvider,
  api = weeklyMaterialApi,
  campusId,
  currentWeekStartDate = getSeoulCurrentWeekStartDate(),
  onBack,
  onOpenMaterial,
  pickPdf,
  uploadPdf,
}: {
  accessTokenProvider?: () => Promise<string>;
  api?: WeeklyMaterialApi;
  campusId: number;
  currentWeekStartDate?: string;
  onBack: () => void;
  onOpenMaterial: (material: WeeklyMaterial) => Promise<void> | void;
  pickPdf: (materialType: WeeklyMaterialType) => Promise<PdfUploadCandidate | null>;
  uploadPdf: (
    candidate: PdfUploadCandidate,
    onProgress: (progress: number) => void,
    signal: AbortSignal,
  ) => Promise<ReadyDocumentAsset>;
}) {
  const [selectedWeekStartDate, setSelectedWeekStartDate] = useState(currentWeekStartDate);
  const [weeks, setWeeks] = useState<Record<string, WeekState>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [pendingWeekStartDate, setPendingWeekStartDate] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const coordinatorRef = useRef(createWeeklyMaterialRequestCoordinator());
  const inFlightRef = useRef(new Set<string>());
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const mountedRef = useRef(true);

  const loadWeek = useCallback(async (weekStartDate: string, foreground: boolean) => {
    const key = getWeeklyMaterialCacheKey(campusId, weekStartDate);
    if (foreground) setWeeks((current) => current[key]?.status === 'ready' ? current : {...current, [key]: {status: 'loading'}});
    const identity = beginWeeklyMaterialRequest(coordinatorRef.current, campusId, weekStartDate);
    try {
      const token = await accessTokenProvider();
      const week = await api.getWeek(token, campusId, weekStartDate);
      if (!mountedRef.current || !isWeeklyMaterialRequestCurrent(coordinatorRef.current, identity)) return;
      setWeeks((current) => ({...current, [key]: {status: 'ready', week}}));
    } catch {
      if (foreground && mountedRef.current && isWeeklyMaterialRequestCurrent(coordinatorRef.current, identity)) {
        setWeeks((current) => ({...current, [key]: {status: 'error'}}));
      }
    }
  }, [accessTokenProvider, api, campusId]);

  useEffect(() => {
    mountedRef.current = true;
    void loadWeek(selectedWeekStartDate, true).then(() => {
      for (const adjacent of getAdjacentWeekStartDates(selectedWeekStartDate)) {
        const key = getWeeklyMaterialCacheKey(campusId, adjacent);
        if (!weeks[key]) void loadWeek(adjacent, false);
      }
    });
    return () => { mountedRef.current = false; };
  }, [campusId, loadWeek, selectedWeekStartDate]);

  useEffect(() => () => {
    for (const controller of uploadControllersRef.current.values()) controller.abort();
    uploadControllersRef.current.clear();
    inFlightRef.current.clear();
  }, []);

  const hasUpload = Array.from(inFlightRef.current).some((key) => key.startsWith(`${selectedWeekStartDate}:`));
  const hasDraft = weeklyMaterialTypes.some((type) => drafts[draftKey(selectedWeekStartDate, type)] !== undefined);

  const selectWeek = (nextWeek: string) => {
    if (hasUpload) {
      setNotice('업로드가 진행 중입니다. 완료 후 주차를 이동해 주세요.');
      return false;
    }
    if (hasDraft) {
      setNotice('선택한 파일이 있습니다. 등록하거나 삭제한 뒤 주차를 이동해 주세요.');
      setPendingWeekStartDate(nextWeek);
      return false;
    }
    setNotice(null);
    setSelectedWeekStartDate(nextWeek);
    return true;
  };

  const selectPdf = async (type: WeeklyMaterialType) => {
    if (hasUpload) return;
    setNotice(null);
    const candidate = await pickPdf(type);
    if (!candidate || !mountedRef.current) return;
    setDrafts((current) => ({
      ...current,
      [draftKey(selectedWeekStartDate, type)]: {candidate, progress: 0, status: 'ready'},
    }));
  };

  const upload = async (type: WeeklyMaterialType) => {
    const key = draftKey(selectedWeekStartDate, type);
    const draft = drafts[key];
    if (!draft || inFlightRef.current.has(key)) return;
    inFlightRef.current.add(key);
    const controller = new AbortController();
    uploadControllersRef.current.set(key, controller);
    setDrafts((current) => {
      const {error: _error, ...withoutError} = draft;
      return {...current, [key]: {...withoutError, progress: 0, status: 'uploading'}};
    });
    try {
      const token = await accessTokenProvider();
      const ready = await uploadPdf(draft.candidate, (progress) => {
        if (!mountedRef.current || !inFlightRef.current.has(key)) return;
        setDrafts((current) => current[key]
          ? {...current, [key]: {...current[key], progress}}
          : current);
      }, controller.signal);
      if (controller.signal.aborted) return;
      const week = await api.putMaterial(token, campusId, selectedWeekStartDate, type, ready.assetId);
      if (!mountedRef.current || controller.signal.aborted || !inFlightRef.current.has(key)) return;
      const cacheKey = getWeeklyMaterialCacheKey(campusId, selectedWeekStartDate);
      setWeeks((current) => ({...current, [cacheKey]: {status: 'ready', week}}));
      setDrafts((current) => {
        const next = {...current};
        delete next[key];
        return next;
      });
      setNotice(`${weeklyMaterialLabels[type]}가 등록되었습니다.`);
    } catch {
      if (controller.signal.aborted) return;
      if (mountedRef.current && inFlightRef.current.has(key)) {
        setDrafts((current) => current[key]
          ? {...current, [key]: {...current[key], error: '업로드하지 못했습니다. 다시 시도해 주세요.', status: 'failed'}}
          : current);
      }
    } finally {
      inFlightRef.current.delete(key);
      if (uploadControllersRef.current.get(key) === controller) uploadControllersRef.current.delete(key);
      if (mountedRef.current) setDrafts((current) => ({...current}));
    }
  };

  const cancelUpload = (weekStartDate: string, type: WeeklyMaterialType) => {
    const key = draftKey(weekStartDate, type);
    uploadControllersRef.current.get(key)?.abort();
    uploadControllersRef.current.delete(key);
    inFlightRef.current.delete(key);
    setDrafts((current) => current[key]
      ? {...current, [key]: {...current[key], error: '업로드가 취소되었습니다.', progress: 0, status: 'ready'}}
      : current);
    setNotice(`${weeklyMaterialLabels[type]} 업로드를 취소했습니다.`);
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target || deleting) return;
    setDeleting(true);
    try {
      const token = await accessTokenProvider();
      await api.deleteMaterial(token, campusId, target.weekStartDate, target.materialType);
      if (!mountedRef.current) return;
      const cacheKey = getWeeklyMaterialCacheKey(campusId, target.weekStartDate);
      setWeeks((current) => {
        const state = current[cacheKey];
        if (!state || state.status !== 'ready') return current;
        return {...current, [cacheKey]: {status: 'ready', week: applyWeeklyMaterialDelete(state.week, target.materialType)}};
      });
      setDeleteTarget(null);
      setNotice(`${weeklyMaterialLabels[target.materialType]}가 삭제되었습니다.`);
    } catch {
      setNotice('자료를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      if (mountedRef.current) setDeleting(false);
    }
  };

  const renderWeek = (weekStartDate: string) => {
    const state: WeekState = weeks[getWeeklyMaterialCacheKey(campusId, weekStartDate)] ?? {status: 'loading'};
    if (state.status === 'loading') return <AdminSkeleton />;
    if (state.status === 'error') return <AdminLoadError onRetry={() => void loadWeek(weekStartDate, true)} />;
    const byType = new Map(state.week.materials.map((material) => [material.materialType, material]));
    return (
      <View style={styles.sections}>
        {weeklyMaterialTypes.map((type) => {
          const draft = drafts[draftKey(weekStartDate, type)];
          const material = byType.get(type);
          return (
            <AdminMaterialSection
              {...(draft ? {draft} : {})}
              key={type}
              {...(material ? {material} : {})}
              onDelete={() => setDeleteTarget({materialType: type, weekStartDate})}
              onCancelUpload={() => cancelUpload(weekStartDate, type)}
              onOpen={onOpenMaterial}
              onRemoveDraft={() => setDrafts((current) => {
                const next = {...current}; delete next[draftKey(weekStartDate, type)]; return next;
              })}
              onSelect={() => void selectPdf(type)}
              onUpload={() => void upload(type)}
              type={type}
            />
          );
        })}
      </View>
    );
  };

  const deleteLabel = deleteTarget ? weeklyMaterialLabels[deleteTarget.materialType] : '';
  const deleteDate = deleteTarget ? formatWeeklyMaterialDeletionDate(deleteTarget.weekStartDate) : '';

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ScreenHeader action={<BackButton onPress={onBack} />} eyebrow="관리자" subtitle="주차별 자료를 각각 등록하고 관리합니다." title="주간 자료 관리" />
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      <WeeklyMaterialPager
        currentWeekStartDate={currentWeekStartDate}
        navigationDisabled={hasUpload}
        onBlockedNavigation={() => setNotice('업로드가 진행 중입니다. 완료 후 주차를 이동해 주세요.')}
        onSelectWeek={selectWeek}
        renderWeek={renderWeek}
        selectedWeekStartDate={selectedWeekStartDate}
      />
      <DangerConfirmSheet
        cancelLabel="취소"
        confirmAccessibilityLabel={`${deleteLabel} 영구 삭제 확인`}
        confirmLabel="삭제"
        loading={deleting}
        message={`${deleteDate}의 ${deleteLabel}를 삭제할까요? 다른 자료에는 영향을 주지 않습니다.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title={`${deleteLabel}를 삭제할까요?`}
        visible={deleteTarget !== null}
      />
      <DangerConfirmSheet
        cancelLabel="계속 작성"
        confirmAccessibilityLabel="선택한 주간 자료 파일을 삭제하고 주차 이동"
        confirmLabel="파일 삭제 후 이동"
        message="선택한 PDF 파일은 등록되지 않습니다. 삭제하고 다른 주차로 이동할까요?"
        onCancel={() => setPendingWeekStartDate(null)}
        onConfirm={() => {
          if (!pendingWeekStartDate) return;
          setDrafts((current) => {
            const next = {...current};
            for (const type of weeklyMaterialTypes) delete next[draftKey(selectedWeekStartDate, type)];
            return next;
          });
          setSelectedWeekStartDate(pendingWeekStartDate);
          setPendingWeekStartDate(null);
          setNotice(null);
        }}
        title="선택한 파일을 삭제할까요?"
        visible={pendingWeekStartDate !== null}
      />
    </ScrollView>
  );
}

function AdminMaterialSection({draft, material, onCancelUpload, onDelete, onOpen, onRemoveDraft, onSelect, onUpload, type}: {
  draft?: DraftState;
  material?: WeeklyMaterial;
  onCancelUpload: () => void;
  onDelete: () => void;
  onOpen: (material: WeeklyMaterial) => Promise<void> | void;
  onRemoveDraft: () => void;
  onSelect: () => void;
  onUpload: () => void;
  type: WeeklyMaterialType;
}) {
  const label = weeklyMaterialLabels[type];
  const busy = draft?.status === 'uploading';
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.headingCopy}>
          <Text style={styles.sectionTitle}>{label}</Text>
          <Text style={styles.muted}>{type === 'SHARING_SHEET' ? '최초 등록 시에만 서버가 알림을 보냅니다.' : '등록 알림은 전송되지 않습니다.'}</Text>
        </View>
        <SmallButton accessibilityLabel={`${label} PDF 선택`} disabled={busy} label={material ? '교체 선택' : 'PDF 선택'} onPress={onSelect} />
      </View>
      {material ? (
        <Pressable accessibilityLabel={`등록된 ${label} PDF 열기`} accessibilityRole="button" onPress={() => void onOpen(material)} style={styles.currentFile}>
          <PdfIcon />
          <View style={styles.fileCopy}>
            <Text numberOfLines={2} style={styles.fileName}>{material.fileName}</Text>
            <Text style={styles.muted}>{formatAttachmentByteSize(material.byteSize)} · {material.uploadedByName}</Text>
          </View>
          <Text style={styles.openText}>열기</Text>
        </Pressable>
      ) : <Text style={styles.empty}>{label === '나눔지' ? '나눔지가' : '목자지침이'} 아직 등록되지 않았어요</Text>}
      {draft ? (
        <View style={styles.draft}>
          <View style={styles.replaceCopy}>
            {material ? <Text style={styles.muted}>현재: {material.fileName}</Text> : null}
            <Text numberOfLines={2} style={styles.fileName}>새 파일: {draft.candidate.fileName}</Text>
            <Text style={draft.status === 'failed' ? styles.error : styles.muted}>
              {draft.status === 'uploading' ? `업로드 중 ${Math.round(draft.progress * 100)}%` : draft.error ?? formatAttachmentByteSize(draft.candidate.byteSize)}
            </Text>
          </View>
          <View style={styles.actionRow}>
            <SmallButton accessibilityLabel={busy ? `${label} 업로드 취소` : `${label} 선택 취소`} label="취소" onPress={busy ? onCancelUpload : onRemoveDraft} />
            <SmallButton accessibilityLabel={`${label} 등록`} disabled={busy} label={material ? '교체' : '등록'} onPress={onUpload} primary />
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, {width: `${Math.round(draft.progress * 100)}%`}]} /></View>
        </View>
      ) : null}
      {material ? <SmallButton accessibilityLabel={`${label} 삭제`} label="삭제" onPress={onDelete} /> : null}
    </View>
  );
}

function AdminSkeleton() { return <View style={styles.sections}><View style={styles.skeleton} /><View style={styles.skeleton} /></View>; }
function AdminLoadError({onRetry}: {onRetry: () => void}) { return <View style={styles.loadError}><Text style={styles.sectionTitle}>이 주차 자료를 불러오지 못했습니다</Text><SmallButton accessibilityLabel="관리자 주간 자료 다시 불러오기" label="다시 시도" onPress={onRetry} /></View>; }
function PdfIcon() { return <View accessibilityElementsHidden style={styles.pdfIcon}><Text style={styles.pdfIconText}>PDF</Text></View>; }
function BackButton({onPress}: {onPress: () => void}) { return <SmallButton accessibilityLabel="주간 자료 관리 닫기" label="뒤로" onPress={onPress} />; }
function SmallButton({accessibilityLabel, disabled = false, label, onPress, primary = false}: {accessibilityLabel: string; disabled?: boolean; label: string; onPress: () => void; primary?: boolean}) {
  return <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.button, primary ? styles.primaryButton : null, disabled ? styles.disabled : null]}><Text style={[styles.buttonText, primary ? styles.primaryButtonText : null]}>{label}</Text></Pressable>;
}
async function defaultAccessTokenProvider() { const token = await resolveCurrentAccessToken(() => undefined); if (!token) throw new Error('Missing access token'); return token; }
function draftKey(weekStartDate: string, type: WeeklyMaterialType) { return `${weekStartDate}:${type}`; }

const styles = StyleSheet.create({
  actionRow: {alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'flex-end'},
  button: {alignItems: 'center', borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14},
  buttonText: {...typography.caption, color: colors.textPrimary, fontWeight: '700'},
  currentFile: {alignItems: 'center', backgroundColor: colors.neutralSoft, borderRadius: radius.item, flexDirection: 'row', gap: spacing.gap, minHeight: 76, padding: spacing.gap},
  disabled: {opacity: 0.45},
  draft: {backgroundColor: colors.neutralSoft, borderRadius: radius.item, gap: spacing.gap, minHeight: 132, padding: spacing.gap},
  empty: {...typography.body, color: colors.textMuted, minHeight: 52, paddingVertical: 14},
  error: {...typography.caption, color: colors.danger},
  fileCopy: {flex: 1, gap: 3, minWidth: 0},
  fileName: {...typography.body, color: colors.textPrimary, fontWeight: '700'},
  headingCopy: {flex: 1, gap: 3, minWidth: 0},
  loadError: {alignItems: 'center', gap: spacing.gap, justifyContent: 'center', minHeight: 260},
  muted: {...typography.caption, color: colors.textMuted},
  notice: {...typography.body, backgroundColor: colors.primarySoft, borderRadius: radius.control, color: colors.textPrimary, padding: spacing.gap},
  openText: {...typography.body, color: colors.primary, fontWeight: '700'},
  pdfIcon: {alignItems: 'center', backgroundColor: '#FEECEC', borderRadius: radius.control, height: 44, justifyContent: 'center', width: 44},
  pdfIconText: {...typography.caption, color: '#D83939', fontWeight: '800'},
  primaryButton: {backgroundColor: colors.primary, borderColor: colors.primary},
  primaryButtonText: {color: colors.surface},
  progressFill: {backgroundColor: colors.primary, height: 4},
  progressTrack: {backgroundColor: colors.border, borderRadius: radius.pill, height: 4, overflow: 'hidden'},
  replaceCopy: {gap: 3},
  screen: {gap: spacing.card, paddingBottom: 40, paddingHorizontal: spacing.screenX, paddingTop: 20},
  section: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, gap: spacing.gap, padding: spacing.card},
  sectionHeading: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.gap, justifyContent: 'space-between'},
  sectionTitle: {...typography.cardTitle, color: colors.textPrimary},
  sections: {gap: spacing.gap, minHeight: 520},
  skeleton: {backgroundColor: colors.neutralSoft, borderRadius: radius.card, height: 230},
});
