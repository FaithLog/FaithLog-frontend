import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {ScreenHeader} from '../components/ui';
import {formatAttachmentByteSize} from '../media/pdfAttachmentPolicy';
import {colors, radius, spacing, typography} from '../theme';
import {weeklyMaterialApi, type WeeklyMaterialApi} from './weeklyMaterialApi';
import {getSeoulCurrentWeekStartDate} from './weeklyMaterialDate';
import {WeeklyMaterialPager} from './WeeklyMaterialPager';
import {getWeeklyMaterialErrorMessage} from './weeklyMaterialErrors';
import {
  beginWeeklyMaterialRequest,
  createWeeklyMaterialRequestCoordinator,
  getAdjacentWeekStartDates,
  getWeeklyMaterialCacheKey,
  isWeeklyMaterialRequestCurrent,
} from './weeklyMaterialState';
import {
  type WeeklyMaterial,
  type WeeklyMaterialType,
  type WeeklyMaterialWeek,
  weeklyMaterialEmptySubjects,
  weeklyMaterialLabels,
  weeklyMaterialScopeLabels,
  weeklyMaterialTypes,
} from './weeklyMaterialTypes';

type WeekViewState =
  | {message: string; status: 'error'}
  | {status: 'loading'}
  | {status: 'ready'; week: WeeklyMaterialWeek};
type DocumentOpenState = 'error' | 'loading';

export function WeeklyMaterialsScreen({
  accessTokenProvider = defaultAccessTokenProvider,
  api = weeklyMaterialApi,
  campusId,
  currentWeekStartDate = getSeoulCurrentWeekStartDate(),
  highlightedType = null,
  initialWeekStartDate,
  onBack,
  openMaterial,
}: {
  accessTokenProvider?: () => Promise<string>;
  api?: WeeklyMaterialApi;
  campusId: number;
  currentWeekStartDate?: string;
  highlightedType?: WeeklyMaterialType | null;
  initialWeekStartDate?: string | undefined;
  onBack: () => void;
  openMaterial: (
    material: WeeklyMaterial,
    shouldOpen?: () => boolean,
  ) => Promise<void> | void;
}) {
  const initialWeek = initialWeekStartDate ?? currentWeekStartDate;
  const [selectedWeekStartDate, setSelectedWeekStartDate] = useState(initialWeek);
  const [states, setStates] = useState<Record<string, WeekViewState>>({});
  const [openStates, setOpenStates] = useState<Record<number, DocumentOpenState>>({});
  const openFlightsRef = useRef(new Set<string>());
  const openStateOwnersRef = useRef(new Map<number, string>());
  const coordinatorRef = useRef(createWeeklyMaterialRequestCoordinator());
  const campusRef = useRef(campusId);
  const campusGenerationRef = useRef(0);
  const selectedWeekStartDateRef = useRef(selectedWeekStartDate);
  const mountedRef = useRef(true);

  useLayoutEffect(() => {
    if (campusRef.current !== campusId) campusGenerationRef.current += 1;
    campusRef.current = campusId;
    setOpenStates({});
    openFlightsRef.current.clear();
    openStateOwnersRef.current.clear();
  }, [campusId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      openFlightsRef.current.clear();
      openStateOwnersRef.current.clear();
    };
  }, []);

  const loadWeek = useCallback(async (weekStartDate: string, foreground: boolean) => {
    const key = getWeeklyMaterialCacheKey(campusId, weekStartDate);
    if (foreground) {
      setStates((current) => current[key]?.status === 'ready'
        ? current
        : {...current, [key]: {status: 'loading'}});
    }
    const identity = beginWeeklyMaterialRequest(coordinatorRef.current, campusId, weekStartDate);
    try {
      const token = await accessTokenProvider();
      const week = await api.getWeek(token, campusId, weekStartDate);
      if (
        campusRef.current !== campusId ||
        !isWeeklyMaterialRequestCurrent(coordinatorRef.current, identity)
      ) return;
      setStates((current) => ({...current, [key]: {status: 'ready', week}}));
    } catch (error) {
      if (
        foreground && campusRef.current === campusId &&
        isWeeklyMaterialRequestCurrent(coordinatorRef.current, identity)
      ) {
        setStates((current) => ({
          ...current,
          [key]: {message: getWeeklyMaterialErrorMessage(error, 'read'), status: 'error'},
        }));
      }
    }
  }, [accessTokenProvider, api, campusId]);

  useEffect(() => {
    void loadWeek(selectedWeekStartDate, true).then(() => {
      for (const adjacent of getAdjacentWeekStartDates(selectedWeekStartDate)) {
        const key = getWeeklyMaterialCacheKey(campusId, adjacent);
        if (!states[key]) void loadWeek(adjacent, false);
      }
    });
  }, [campusId, loadWeek, selectedWeekStartDate]);

  const openOneMaterial = useCallback(async (material: WeeklyMaterial, weekStartDate: string) => {
    const operationCampusId = campusId;
    const operationGeneration = campusGenerationRef.current;
    const flightKey = `${operationGeneration}:${weekStartDate}:${material.mediaAssetId}`;
    const isCurrent = () => (
      mountedRef.current &&
      campusRef.current === operationCampusId &&
      campusGenerationRef.current === operationGeneration &&
      selectedWeekStartDateRef.current === weekStartDate
    );
    if (openFlightsRef.current.has(flightKey)) return;
    openFlightsRef.current.add(flightKey);
    openStateOwnersRef.current.set(material.mediaAssetId, flightKey);
    setOpenStates((current) => ({...current, [material.mediaAssetId]: 'loading'}));
    let keepError = false;
    try {
      await openMaterial(material, isCurrent);
    } catch {
      if (!isCurrent()) return;
      keepError = true;
      setOpenStates((current) => ({...current, [material.mediaAssetId]: 'error'}));
    } finally {
      openFlightsRef.current.delete(flightKey);
      if (openStateOwnersRef.current.get(material.mediaAssetId) === flightKey) {
        openStateOwnersRef.current.delete(material.mediaAssetId);
        if (mountedRef.current && !keepError) {
          setOpenStates((current) => {
            const next = {...current};
            delete next[material.mediaAssetId];
            return next;
          });
        }
      }
    }
  }, [campusId, openMaterial]);

  const renderWeek = useCallback((weekStartDate: string) => {
    const state = states[getWeeklyMaterialCacheKey(campusId, weekStartDate)] ?? {status: 'loading'};
    return (
      <WeeklyMaterialWeekPage
        current={weekStartDate === currentWeekStartDate}
        highlightedType={weekStartDate === selectedWeekStartDate ? highlightedType : null}
        onOpen={(material) => openOneMaterial(material, weekStartDate)}
        openStates={openStates}
        onRetry={() => void loadWeek(weekStartDate, true)}
        state={state}
      />
    );
  }, [campusId, currentWeekStartDate, highlightedType, loadWeek, openOneMaterial, openStates, selectedWeekStartDate, states]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ScreenHeader
        action={<BackButton onPress={onBack} />}
        eyebrow="캠퍼스 자료"
        subtitle="주차별 목자지침과 나눔 자료를 확인하세요."
        title="주간 자료"
      />
      <WeeklyMaterialPager
        currentWeekStartDate={currentWeekStartDate}
        onSelectWeek={(weekStartDate) => {
          selectedWeekStartDateRef.current = weekStartDate;
          setSelectedWeekStartDate(weekStartDate);
        }}
        renderWeek={renderWeek}
        selectedWeekStartDate={selectedWeekStartDate}
      />
    </ScrollView>
  );
}

function WeeklyMaterialWeekPage({
  current,
  highlightedType,
  onOpen,
  openStates,
  onRetry,
  state,
}: {
  current: boolean;
  highlightedType: WeeklyMaterialType | null;
  onOpen: (material: WeeklyMaterial) => Promise<void> | void;
  openStates: Record<number, DocumentOpenState>;
  onRetry: () => void;
  state: WeekViewState;
}) {
  if (state.status === 'loading') {
    return (
      <View accessibilityLabel="주간 자료 불러오는 중" style={styles.weekList}>
        <View style={styles.skeletonRow} />
        <View style={styles.divider} />
        <View style={styles.skeletonRow} />
        <View style={styles.divider} />
        <View style={styles.skeletonRow} />
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <View style={styles.errorState}>
        <Text style={styles.errorTitle}>{state.message}</Text>
        <Text style={styles.muted}>다른 주차는 계속 확인할 수 있습니다.</Text>
        <Pressable accessibilityLabel="이 주차 자료 다시 불러오기" accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }
  const byType = new Map(state.week.materials.map((material) => [material.materialType, material]));
  return (
    <View style={styles.weekList}>
      {weeklyMaterialTypes.map((type, index) => {
        const material = byType.get(type);
        return (
          <View key={type}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <MaterialRow
              current={current}
              highlighted={highlightedType === type}
              {...(material ? {material} : {})}
              onOpen={onOpen}
              {...(material && openStates[material.mediaAssetId]
                ? {openState: openStates[material.mediaAssetId]}
                : {})}
              type={type}
            />
          </View>
        );
      })}
    </View>
  );
}

function MaterialRow({
  current,
  highlighted,
  material,
  onOpen,
  openState,
  type,
}: {
  current: boolean;
  highlighted: boolean;
  material?: WeeklyMaterial;
  onOpen: (material: WeeklyMaterial) => Promise<void> | void;
  openState?: DocumentOpenState;
  type: WeeklyMaterialType;
}) {
  const label = weeklyMaterialLabels[type];
  if (!material) {
    const subject = weeklyMaterialEmptySubjects[type];
    return (
      <View accessibilityLabel={`${label} 미등록`} style={styles.materialRow}>
        <PdfIcon muted />
        <View style={styles.materialCopy}>
          <Text style={styles.materialTitle}>{label}</Text>
          {weeklyMaterialScopeLabels[type] ? <Text style={styles.scopeLabel}>{weeklyMaterialScopeLabels[type]}</Text> : null}
          <Text style={styles.muted}>{current ? '이번 주' : '선택한 주차의'} {subject} 아직 등록되지 않았어요</Text>
        </View>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityLabel={`${label} PDF 열기`}
      accessibilityRole="button"
      onPress={() => void onOpen(material)}
      style={[styles.materialRow, highlighted ? styles.highlighted : null]}>
      <PdfIcon />
      <View style={styles.materialCopy}>
        <Text style={styles.materialTitle}>{label}</Text>
        {weeklyMaterialScopeLabels[type] ? <Text style={styles.scopeLabel}>{weeklyMaterialScopeLabels[type]}</Text> : null}
        <Text ellipsizeMode="tail" numberOfLines={2} style={styles.fileName}>{material.fileName}</Text>
        <Text style={styles.muted}>{formatAttachmentByteSize(material.byteSize)} · {formatUpdatedAt(material.updatedAt)}</Text>
      </View>
      <Text style={[styles.openText, openState === 'error' ? styles.openError : null]}>
        {openState === 'loading' ? '여는 중' : openState === 'error' ? '다시 시도' : '열기'}
      </Text>
    </Pressable>
  );
}

function PdfIcon({muted = false}: {muted?: boolean}) {
  return <View accessibilityElementsHidden style={[styles.pdfIcon, muted ? styles.pdfIconMuted : null]}><Text style={styles.pdfIconText}>PDF</Text></View>;
}

function BackButton({onPress}: {onPress: () => void}) {
  return <Pressable accessibilityLabel="주간 자료 닫기" accessibilityRole="button" onPress={onPress} style={styles.backButton}><Text style={styles.backText}>뒤로</Text></Pressable>;
}

async function defaultAccessTokenProvider() {
  const token = await resolveCurrentAccessToken(() => undefined);
  if (!token) throw new Error('Missing access token');
  return token;
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  backButton: {alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 8},
  backText: {...typography.body, color: colors.primary, fontWeight: '700'},
  divider: {backgroundColor: colors.border, height: 1},
  errorState: {alignItems: 'center', gap: 8, justifyContent: 'center', minHeight: 220, padding: spacing.card},
  errorTitle: {...typography.cardTitle, color: colors.textPrimary},
  fileName: {...typography.body, color: colors.textPrimary, fontWeight: '700'},
  highlighted: {backgroundColor: colors.primarySoft},
  materialCopy: {flex: 1, gap: 3, minWidth: 0},
  materialRow: {alignItems: 'center', flexDirection: 'row', gap: spacing.gap, minHeight: 90, paddingHorizontal: 14, paddingVertical: 11},
  materialTitle: {...typography.caption, color: colors.textSecondary, fontWeight: '700'},
  muted: {...typography.caption, color: colors.textMuted},
  openText: {...typography.body, color: colors.primary, fontWeight: '700'},
  openError: {color: colors.danger},
  pdfIcon: {alignItems: 'center', backgroundColor: '#FEECEC', borderRadius: radius.control, height: 44, justifyContent: 'center', width: 44},
  pdfIconMuted: {backgroundColor: colors.neutralSoft},
  pdfIconText: {...typography.caption, color: '#D83939', fontWeight: '800'},
  retryButton: {alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 16},
  retryText: {...typography.body, color: colors.primary, fontWeight: '700'},
  screen: {gap: spacing.card, paddingBottom: 32, paddingHorizontal: 8, paddingTop: 20},
  scopeLabel: {...typography.caption, color: colors.primary, fontWeight: '700'},
  skeletonRow: {backgroundColor: colors.neutralSoft, borderRadius: radius.item, height: 82, margin: spacing.gap},
  weekList: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, minHeight: 270, overflow: 'hidden'},
});
