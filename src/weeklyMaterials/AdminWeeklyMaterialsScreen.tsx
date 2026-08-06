import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
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
import {getWeeklyMaterialErrorMessage} from './weeklyMaterialErrors';
import {
  applyWeeklyMaterialDelete,
  beginWeeklyMaterialRequest,
  createWeeklyMaterialRequestCoordinator,
  getAdjacentWeekStartDates,
  getWeeklyMaterialCacheKey,
  invalidateWeeklyMaterialCacheForMutation,
  isWeeklyMaterialRequestCurrent,
} from './weeklyMaterialState';
import type {
  WeeklyMaterial,
  WeeklyMaterialType,
  WeeklyMaterialWeek,
} from './weeklyMaterialTypes';
import {
  weeklyMaterialEmptySubjects,
  weeklyMaterialLabels,
  weeklyMaterialScopeLabels,
  weeklyMaterialTypes,
} from './weeklyMaterialTypes';

type WeekState =
  | {message: string; status: 'error'}
  | {status: 'loading'}
  | {status: 'ready'; week: WeeklyMaterialWeek};
type DraftState = {
  candidate: PdfUploadCandidate;
  error?: string;
  progress: number;
  selectionRevision: number;
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
  onOpenMaterial: (
    material: WeeklyMaterial,
    shouldOpen?: () => boolean,
  ) => Promise<void> | void;
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
  const [selectionErrors, setSelectionErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [pendingWeekStartDate, setPendingWeekStartDate] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteFlightRef = useRef<{key: string; operationId: symbol} | null>(null);
  const coordinatorRef = useRef(createWeeklyMaterialRequestCoordinator());
  const uploadOperationsRef = useRef(new Map<string, symbol>());
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const mountedRef = useRef(true);
  const committedCampusIdRef = useRef(campusId);
  const campusGenerationRef = useRef(0);
  const draftSelectionSequenceRef = useRef(0);
  const selectedWeekStartDateRef = useRef(selectedWeekStartDate);

  useLayoutEffect(() => {
    if (committedCampusIdRef.current === campusId) return;
    committedCampusIdRef.current = campusId;
    campusGenerationRef.current += 1;
    for (const controller of uploadControllersRef.current.values()) controller.abort();
    uploadControllersRef.current.clear();
    uploadOperationsRef.current.clear();
    deleteFlightRef.current = null;
    selectedWeekStartDateRef.current = currentWeekStartDate;
    setSelectedWeekStartDate(currentWeekStartDate);
    setDrafts({});
    setSelectionErrors({});
    setNotice(null);
    setDeleteTarget(null);
    setPendingWeekStartDate(null);
    setDeleting(false);
  }, [campusId, currentWeekStartDate]);

  const loadWeek = useCallback(async (weekStartDate: string, foreground: boolean) => {
    const operationGeneration = campusGenerationRef.current;
    const key = getWeeklyMaterialCacheKey(campusId, weekStartDate);
    if (foreground) setWeeks((current) => current[key]?.status === 'ready' ? current : {...current, [key]: {status: 'loading'}});
    const identity = beginWeeklyMaterialRequest(coordinatorRef.current, campusId, weekStartDate);
    try {
      const token = await accessTokenProvider();
      const week = await api.getWeek(token, campusId, weekStartDate);
      if (
        !mountedRef.current ||
        committedCampusIdRef.current !== campusId ||
        campusGenerationRef.current !== operationGeneration ||
        !isWeeklyMaterialRequestCurrent(coordinatorRef.current, identity)
      ) return;
      setWeeks((current) => ({...current, [key]: {status: 'ready', week}}));
    } catch (error) {
      if (
        foreground &&
        mountedRef.current &&
        committedCampusIdRef.current === campusId &&
        campusGenerationRef.current === operationGeneration &&
        isWeeklyMaterialRequestCurrent(coordinatorRef.current, identity)
      ) {
        setWeeks((current) => ({
          ...current,
          [key]: {message: getWeeklyMaterialErrorMessage(error, 'read'), status: 'error'},
        }));
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
    uploadOperationsRef.current.clear();
  }, []);

  const hasUpload = Array.from(uploadOperationsRef.current.keys()).some((key) =>
    key.startsWith(`${campusId}:${selectedWeekStartDate}:`));
  const hasDraft = weeklyMaterialTypes.some((type) =>
    drafts[draftKey(campusId, selectedWeekStartDate, type)] !== undefined);

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
    selectedWeekStartDateRef.current = nextWeek;
    setSelectedWeekStartDate(nextWeek);
    return true;
  };

  const selectPdf = async (type: WeeklyMaterialType) => {
    if (hasUpload) return;
    const operationCampusId = campusId;
    const operationGeneration = campusGenerationRef.current;
    const key = draftKey(operationCampusId, selectedWeekStartDate, type);
    setNotice(null);
    setSelectionErrors((current) => {
      if (!current[key]) return current;
      const next = {...current};
      delete next[key];
      return next;
    });
    try {
      const candidate = await pickPdf(type);
      if (
        !candidate ||
        !mountedRef.current ||
        committedCampusIdRef.current !== operationCampusId ||
        campusGenerationRef.current !== operationGeneration
      ) return;
      setDrafts((current) => ({
        ...current,
        [key]: {
          candidate,
          progress: 0,
          selectionRevision: ++draftSelectionSequenceRef.current,
          status: 'ready',
        },
      }));
    } catch (error) {
      if (
        mountedRef.current &&
        committedCampusIdRef.current === operationCampusId &&
        campusGenerationRef.current === operationGeneration
      ) {
        const message = getWeeklyMaterialSelectionErrorMessage(error);
        setSelectionErrors((current) => ({...current, [key]: message}));
      }
    }
  };

  const upload = async (type: WeeklyMaterialType) => {
    const operationCampusId = campusId;
    const operationGeneration = campusGenerationRef.current;
    const operationWeekStartDate = selectedWeekStartDate;
    const key = draftKey(operationCampusId, operationWeekStartDate, type);
    const draft = drafts[key];
    if (
      !draft ||
      uploadOperationsRef.current.has(key) ||
      deleteFlightRef.current?.key === key
    ) return;
    const operationId = Symbol(key);
    uploadOperationsRef.current.set(key, operationId);
    const controller = new AbortController();
    uploadControllersRef.current.set(key, controller);
    setDrafts((current) => {
      const {error: _error, ...withoutError} = draft;
      return {...current, [key]: {...withoutError, progress: 0, status: 'uploading'}};
    });
    try {
      const token = await accessTokenProvider();
      const ready = await uploadPdf(draft.candidate, (progress) => {
        if (
          !mountedRef.current ||
          committedCampusIdRef.current !== operationCampusId ||
          campusGenerationRef.current !== operationGeneration ||
          uploadOperationsRef.current.get(key) !== operationId
        ) return;
        setDrafts((current) => current[key]
          ? {...current, [key]: {...current[key], progress}}
          : current);
      }, controller.signal);
      if (controller.signal.aborted) return;
      const week = await api.putMaterial(
        token,
        operationCampusId,
        operationWeekStartDate,
        type,
        ready.assetId,
      );
      if (
        !mountedRef.current ||
        committedCampusIdRef.current !== operationCampusId ||
        campusGenerationRef.current !== operationGeneration ||
        controller.signal.aborted ||
        uploadOperationsRef.current.get(key) !== operationId
      ) return;
      const cacheKey = getWeeklyMaterialCacheKey(operationCampusId, operationWeekStartDate);
      setWeeks((current) => ({
        ...invalidateWeeklyMaterialCacheForMutation(current, operationCampusId, type),
        [cacheKey]: {status: 'ready', week},
      }));
      setDrafts((current) => {
        const next = {...current};
        delete next[key];
        return next;
      });
      setNotice(`${weeklyMaterialLabels[type]}가 등록되었습니다.`);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (
        mountedRef.current &&
        committedCampusIdRef.current === operationCampusId &&
        campusGenerationRef.current === operationGeneration &&
        uploadOperationsRef.current.get(key) === operationId
      ) {
        setDrafts((current) => current[key]
          ? {...current, [key]: {
            ...current[key],
            error: getWeeklyMaterialErrorMessage(error, 'upload'),
            status: 'failed',
          }}
          : current);
      }
    } finally {
      if (uploadOperationsRef.current.get(key) === operationId) {
        uploadOperationsRef.current.delete(key);
      }
      if (uploadControllersRef.current.get(key) === controller) uploadControllersRef.current.delete(key);
      if (
        mountedRef.current &&
        committedCampusIdRef.current === operationCampusId &&
        campusGenerationRef.current === operationGeneration
      ) {
        setDrafts((current) => ({...current}));
      }
    }
  };

  const cancelUpload = (weekStartDate: string, type: WeeklyMaterialType) => {
    const key = draftKey(campusId, weekStartDate, type);
    uploadControllersRef.current.get(key)?.abort();
    uploadControllersRef.current.delete(key);
    uploadOperationsRef.current.delete(key);
    setDrafts((current) => current[key]
      ? {...current, [key]: {...current[key], error: '업로드가 취소되었습니다.', progress: 0, status: 'ready'}}
      : current);
    setNotice(`${weeklyMaterialLabels[type]} 업로드를 취소했습니다.`);
  };

  const openMaterialForCurrentCampus = (material: WeeklyMaterial, weekStartDate: string) => {
    const operationCampusId = campusId;
    const operationGeneration = campusGenerationRef.current;
    void onOpenMaterial(material, () => (
      mountedRef.current &&
      committedCampusIdRef.current === operationCampusId &&
      campusGenerationRef.current === operationGeneration &&
      selectedWeekStartDateRef.current === weekStartDate
    ));
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target || deleteFlightRef.current) return;
    const operationCampusId = campusId;
    const operationGeneration = campusGenerationRef.current;
    const key = draftKey(operationCampusId, target.weekStartDate, target.materialType);
    if (uploadOperationsRef.current.has(key)) {
      setDeleteTarget(null);
      setNotice('업로드가 진행 중입니다. 완료 후 삭제해 주세요.');
      return;
    }
    const operationId = Symbol(key);
    deleteFlightRef.current = {key, operationId};
    setDeleting(true);
    try {
      const token = await accessTokenProvider();
      await api.deleteMaterial(
        token,
        operationCampusId,
        target.weekStartDate,
        target.materialType,
      );
      if (
        !mountedRef.current ||
        committedCampusIdRef.current !== operationCampusId ||
        campusGenerationRef.current !== operationGeneration ||
        deleteFlightRef.current?.operationId !== operationId
      ) return;
      const cacheKey = getWeeklyMaterialCacheKey(operationCampusId, target.weekStartDate);
      setWeeks((current) => {
        const state = current[cacheKey];
        const invalidated = invalidateWeeklyMaterialCacheForMutation(
          current,
          operationCampusId,
          target.materialType,
        );
        if (!state || state.status !== 'ready') return invalidated;
        return {
          ...invalidated,
          [cacheKey]: {
            status: 'ready',
            week: applyWeeklyMaterialDelete(state.week, target.materialType),
          },
        };
      });
      setDeleteTarget(null);
      setNotice(`${weeklyMaterialLabels[target.materialType]}가 삭제되었습니다.`);
      void loadWeek(target.weekStartDate, false);
    } catch (error) {
      if (
        committedCampusIdRef.current === operationCampusId &&
        campusGenerationRef.current === operationGeneration &&
        deleteFlightRef.current?.operationId === operationId
      ) {
        setNotice(getWeeklyMaterialErrorMessage(error, 'delete'));
      }
    } finally {
      const ownsDelete = deleteFlightRef.current?.operationId === operationId;
      if (ownsDelete) deleteFlightRef.current = null;
      if (
        ownsDelete &&
        mountedRef.current &&
        committedCampusIdRef.current === operationCampusId &&
        campusGenerationRef.current === operationGeneration
      ) {
        setDeleting(false);
      }
    }
  };

  const renderWeek = (weekStartDate: string) => {
    const state: WeekState = weeks[getWeeklyMaterialCacheKey(campusId, weekStartDate)] ?? {status: 'loading'};
    if (state.status === 'loading') return <AdminSkeleton />;
    if (state.status === 'error') {
      return (
        <AdminLoadError
          message={state.message}
          onRetry={() => void loadWeek(weekStartDate, true)}
        />
      );
    }
    const byType = new Map(state.week.materials.map((material) => [material.materialType, material]));
    return (
      <View style={styles.sections}>
        {weeklyMaterialTypes.map((type) => {
          const draft = drafts[draftKey(campusId, weekStartDate, type)];
          const selectionError = selectionErrors[draftKey(campusId, weekStartDate, type)];
          const material = byType.get(type);
          const key = draftKey(campusId, weekStartDate, type);
          const mutationBusy = uploadOperationsRef.current.has(key) || deleteFlightRef.current?.key === key;
          return (
            <AdminMaterialSection
              {...(draft ? {draft} : {})}
              key={type}
              {...(material ? {material} : {})}
              mutationBusy={mutationBusy}
              onDelete={() => {
                if (mutationBusy) return;
                setDeleteTarget({materialType: type, weekStartDate});
              }}
              onCancelUpload={() => cancelUpload(weekStartDate, type)}
              onOpen={(openedMaterial) => openMaterialForCurrentCampus(openedMaterial, weekStartDate)}
              onRemoveDraft={() => setDrafts((current) => {
                const next = {...current};
                delete next[draftKey(campusId, weekStartDate, type)];
                return next;
              })}
              onSelect={() => void selectPdf(type)}
              onUpload={() => void upload(type)}
              {...(selectionError ? {selectionError} : {})}
              type={type}
            />
          );
        })}
      </View>
    );
  };

  const deleteLabel = deleteTarget ? weeklyMaterialLabels[deleteTarget.materialType] : '';
  const deleteDate = deleteTarget ? formatWeeklyMaterialDeletionDate(deleteTarget.weekStartDate) : '';
  const pagerContentRevision = getAdminPagerContentRevision(weeks, drafts, selectionErrors);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ScreenHeader action={<BackButton onPress={onBack} />} eyebrow="관리자" subtitle="주차별 자료를 각각 등록하고 관리합니다." title="주간 자료 관리" />
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      <WeeklyMaterialPager
        contentRevision={pagerContentRevision}
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
            for (const type of weeklyMaterialTypes) {
              delete next[draftKey(campusId, selectedWeekStartDate, type)];
            }
            return next;
          });
          selectedWeekStartDateRef.current = pendingWeekStartDate;
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

function AdminMaterialSection({draft, material, mutationBusy, onCancelUpload, onDelete, onOpen, onRemoveDraft, onSelect, onUpload, selectionError, type}: {
  draft?: DraftState;
  material?: WeeklyMaterial;
  mutationBusy: boolean;
  onCancelUpload: () => void;
  onDelete: () => void;
  onOpen: (material: WeeklyMaterial) => Promise<void> | void;
  onRemoveDraft: () => void;
  onSelect: () => void;
  onUpload: () => void;
  selectionError?: string;
  type: WeeklyMaterialType;
}) {
  const label = weeklyMaterialLabels[type];
  const uploading = draft?.status === 'uploading';
  const busy = mutationBusy || uploading;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.headingCopy}>
          <Text style={styles.sectionTitle}>{label}</Text>
          {weeklyMaterialScopeLabels[type] ? (
            <Text style={styles.scopeLabel}>{weeklyMaterialScopeLabels[type]}</Text>
          ) : null}
          <Text style={styles.muted}>{type === 'SUNDAY_SHARING_SHEET' ? '최초 등록 시에만 서버가 알림을 보냅니다.' : '등록 알림은 전송되지 않습니다.'}</Text>
        </View>
        <SmallButton accessibilityLabel={`${label} PDF 선택`} disabled={busy} label={material ? '교체 선택' : 'PDF 선택'} onPress={onSelect} />
      </View>
      {material ? (
        <Pressable accessibilityLabel={`등록된 ${label} PDF 열기`} accessibilityRole="button" onPress={() => void onOpen(material)} style={styles.currentFile}>
          <PdfIcon />
          <View style={styles.fileCopy}>
            <Text numberOfLines={2} style={styles.fileName}>{material.fileName}</Text>
            <Text style={styles.muted}>{formatAttachmentByteSize(material.byteSize)} · {formatUpdatedAt(material.updatedAt)}</Text>
          </View>
          <Text style={styles.openText}>열기</Text>
        </Pressable>
      ) : <Text style={styles.empty}>{weeklyMaterialEmptySubjects[type]} 아직 등록되지 않았어요</Text>}
      {selectionError ? (
        <Text
          accessibilityLabel={`${label} PDF 선택 오류`}
          accessibilityRole="alert"
          style={styles.error}>
          {selectionError}
        </Text>
      ) : null}
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
            <SmallButton accessibilityLabel={uploading ? `${label} 업로드 취소` : `${label} 선택 취소`} disabled={mutationBusy && !uploading} label="취소" onPress={uploading ? onCancelUpload : onRemoveDraft} />
            <SmallButton accessibilityLabel={`${label} 등록`} disabled={busy} label={material ? '교체' : '등록'} onPress={onUpload} primary />
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, {width: `${Math.round(draft.progress * 100)}%`}]} /></View>
        </View>
      ) : null}
      {material ? <SmallButton accessibilityLabel={`${label} 삭제`} disabled={mutationBusy} label="삭제" onPress={onDelete} /> : null}
    </View>
  );
}

function AdminSkeleton() { return <View style={styles.sections}><View style={styles.skeleton} /><View style={styles.skeleton} /><View style={styles.skeleton} /></View>; }
function AdminLoadError({message, onRetry}: {message: string; onRetry: () => void}) { return <View style={styles.loadError}><Text style={styles.sectionTitle}>{message}</Text><SmallButton accessibilityLabel="관리자 주간 자료 다시 불러오기" label="다시 시도" onPress={onRetry} /></View>; }
function PdfIcon() { return <View accessibilityElementsHidden style={styles.pdfIcon}><Text style={styles.pdfIconText}>PDF</Text></View>; }
function BackButton({onPress}: {onPress: () => void}) { return <SmallButton accessibilityLabel="주간 자료 관리 닫기" label="뒤로" onPress={onPress} />; }
function SmallButton({accessibilityLabel, disabled = false, label, onPress, primary = false}: {accessibilityLabel: string; disabled?: boolean; label: string; onPress: () => void; primary?: boolean}) {
  return <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.button, primary ? styles.primaryButton : null, disabled ? styles.disabled : null]}><Text style={[styles.buttonText, primary ? styles.primaryButtonText : null]}>{label}</Text></Pressable>;
}
async function defaultAccessTokenProvider() { const token = await resolveCurrentAccessToken(() => undefined); if (!token) throw new Error('Missing access token'); return token; }
function draftKey(campusId: number, weekStartDate: string, type: WeeklyMaterialType) {
  return `${campusId}:${weekStartDate}:${type}`;
}
function getWeeklyMaterialSelectionErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message === 'PDF는 30MB 이하여야 합니다.') return error.message;
    if (error.message === 'PDF 파일을 확인해 주세요.') return error.message;
  }
  return 'PDF 파일을 선택하지 못했습니다. 다시 시도해 주세요.';
}
function getAdminPagerContentRevision(
  weeks: Record<string, WeekState>,
  drafts: Record<string, DraftState>,
  selectionErrors: Record<string, string>,
) {
  const weekRevision = Object.entries(weeks).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, state]) => state.status === 'ready'
      ? `${key}:ready:${state.week.materials.map((material) => `${material.materialType}:${material.mediaAssetId}:${material.updatedAt}`).join(',')}`
      : `${key}:${state.status}`)
    .join('|');
  const draftRevision = Object.entries(drafts).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, draft]) => `${key}:${draft.selectionRevision}:${draft.status}:${Math.round(draft.progress * 100)}:${draft.error ? 'error' : 'ok'}`)
    .join('|');
  return `${weekRevision}#${draftRevision}#${Object.keys(selectionErrors).sort().join('|')}`;
}
function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'numeric', timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  actionRow: {alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'flex-end'},
  button: {alignItems: 'center', borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14},
  buttonText: {...typography.caption, color: colors.textPrimary, fontWeight: '700'},
  currentFile: {alignItems: 'center', backgroundColor: colors.neutralSoft, borderRadius: radius.item, flexDirection: 'row', gap: spacing.gap, minHeight: 68, padding: 10},
  disabled: {opacity: 0.45},
  draft: {backgroundColor: colors.neutralSoft, borderRadius: radius.item, gap: spacing.gap, minHeight: 132, padding: spacing.gap},
  empty: {...typography.body, color: colors.textMuted, minHeight: 36, paddingVertical: 6},
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
  screen: {gap: spacing.card, paddingBottom: 40, paddingHorizontal: 8, paddingTop: 20},
  scopeLabel: {...typography.caption, color: colors.primary, fontWeight: '700'},
  section: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, gap: 9, padding: 14},
  sectionHeading: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.gap, justifyContent: 'space-between'},
  sectionTitle: {...typography.cardTitle, color: colors.textPrimary},
  sections: {gap: 10, minHeight: 650},
  skeleton: {backgroundColor: colors.neutralSoft, borderRadius: radius.card, height: 230},
});
