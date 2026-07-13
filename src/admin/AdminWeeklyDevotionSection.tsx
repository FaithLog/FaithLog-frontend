import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {FaithLogApiError} from '../api/apiError';
import {
  createMockAdminWeeklyDevotionAdapter,
  createProductionAdminWeeklyDevotionAdapter,
  type AdminWeeklyDevotion,
  type AdminWeeklyDevotionAdapter,
  type AdminWeeklyDevotionDailyCheck,
  type AdminWeeklyDevotionPenalty,
  type AdminWeeklyDevotionRequest,
  type AdminWeeklyDevotionSubmittedMember,
} from '../api/adminWeeklyDevotionApi';
import {isMockModeEnabled} from '../api/client';
import {
  getAuthSessionGeneration,
  isAuthSessionGenerationCurrent,
  StaleAuthSessionReadError,
} from '../api/tokenStorage';
import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import type {AuthGateState} from '../auth/authGate';
import {
  Empty,
  ErrorState,
  Loading,
  Offline,
  PermissionDenied,
} from '../components/ui';
import {IconexIcon} from '../components/IconexIcon';
import {colors, radius, spacing} from '../theme';
import {formatWon} from '../utils/money';
import {
  AdminWeeklyDevotionCoordinator,
  formatAdminWeekRange,
  getAdminWeekStartDate,
  moveAdminWeek,
} from './adminWeeklyDevotion';
import {saveAndShareAdminWeeklyDevotionExport} from './adminWeeklyDevotionFile';

type WeeklyState =
  | {contextKey: string; status: 'loading'; weekStartDate: string}
  | {contextKey: string; data: AdminWeeklyDevotion; status: 'success'; weekStartDate: string}
  | {contextKey: string; status: 'empty'; weekStartDate: string}
  | {contextKey: string; error: FaithLogApiError['detail']; status: 'error'; weekStartDate: string}
  | {
      contextKey: string;
      error: FaithLogApiError['detail'];
      status: 'permissionDenied';
      weekStartDate: string;
    };

type Feedback = {
  message: string;
  tone: 'error' | 'success';
} | null;

type Props = {
  campusId: number;
  dependencies?: {
    adapter?: AdminWeeklyDevotionAdapter;
    getNow?: () => Date;
    resolveRequest?: (
      selectedWeekStartDate: string,
    ) => Promise<AdminWeeklyDevotionRequest | null>;
    shareExport?: typeof saveAndShareAdminWeeklyDevotionExport;
  };
  setAuthState: (state: AuthGateState) => void;
};

const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];
const MEMBER_RENDER_BATCH_SIZE = 50;

export function AdminWeeklyDevotionSection({campusId, dependencies, setAuthState}: Props) {
  const getNow = dependencies?.getNow ?? getSystemNow;
  const [initialLatestWeekStartDate] = useState(() =>
    getAdminWeekStartDate(getNow()),
  );
  const [weekStartDate, setWeekStartDate] = useState(initialLatestWeekStartDate);
  const [state, setState] = useState<WeeklyState>({
    contextKey: createViewContextKey(
      campusId,
      getAuthSessionGeneration(),
      initialLatestWeekStartDate,
    ),
    status: 'loading',
    weekStartDate: initialLatestWeekStartDate,
  });
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [exportingContextKeys, setExportingContextKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [feedback, setFeedback] = useState<Feedback>(null);
  const runtimeAdapter = useMemo(createRuntimeAdapter, []);
  const adapter = dependencies?.adapter ?? runtimeAdapter;
  const shareExport =
    dependencies?.shareExport ?? saveAndShareAdminWeeklyDevotionExport;
  const coordinator = useMemo(() => new AdminWeeklyDevotionCoordinator(adapter), [adapter]);
  const mountedRef = useRef(true);
  const latestWeekStartDateRef = useRef(initialLatestWeekStartDate);
  const weekStartDateRef = useRef(weekStartDate);
  const campusIdRef = useRef(campusId);
  const loadOperationRef = useRef(0);
  const exportInFlightRef = useRef(new Map<string, Promise<void>>());

  useLayoutEffect(() => {
    if (campusIdRef.current === campusId) {
      return;
    }
    campusIdRef.current = campusId;
    loadOperationRef.current += 1;
  }, [campusId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const defaultResolveRequest = useCallback(
    async (selectedWeekStartDate: string): Promise<AdminWeeklyDevotionRequest | null> => {
      const authGeneration = getAuthSessionGeneration();
      const accessToken = await resolveCurrentAccessToken(() => {
        setAuthState({status: 'sessionExpired', message: '저장된 로그인 정보가 없습니다.'});
      });

      if (!accessToken || !isAuthSessionGenerationCurrent(authGeneration)) {
        return null;
      }

      return {accessToken, authGeneration, campusId, weekStartDate: selectedWeekStartDate};
    },
    [campusId, setAuthState],
  );
  const resolveRequest = dependencies?.resolveRequest ?? defaultResolveRequest;

  const showWeekImmediately = useCallback(
    (selectedWeekStartDate: string) => {
      loadOperationRef.current += 1;
      weekStartDateRef.current = selectedWeekStartDate;
      const authGeneration = getAuthSessionGeneration();
      const cached = coordinator.peek({
        accessToken: '',
        authGeneration,
        campusId,
        weekStartDate: selectedWeekStartDate,
      });
      setState(
        toWeeklyState(
          createViewContextKey(campusId, authGeneration, selectedWeekStartDate),
          selectedWeekStartDate,
          cached,
        ),
      );
      setExpandedUserId(null);
      setFeedback(null);
    },
    [campusId, coordinator],
  );

  const previousCampusIdRef = useRef(campusId);
  useEffect(() => {
    if (previousCampusIdRef.current === campusId) {
      return;
    }
    previousCampusIdRef.current = campusId;
    showWeekImmediately(latestWeekStartDateRef.current);
    setWeekStartDate(latestWeekStartDateRef.current);
  }, [campusId, showWeekImmediately]);

  const refreshLatestWeek = useCallback(() => {
    const nextLatestWeekStartDate = getAdminWeekStartDate(getNow());
    const previousLatestWeekStartDate = latestWeekStartDateRef.current;
    if (nextLatestWeekStartDate === previousLatestWeekStartDate) {
      return;
    }

    latestWeekStartDateRef.current = nextLatestWeekStartDate;
    if (weekStartDateRef.current === previousLatestWeekStartDate) {
      showWeekImmediately(nextLatestWeekStartDate);
      setWeekStartDate(nextLatestWeekStartDate);
    }
  }, [getNow, showWeekImmediately]);

  useEffect(() => {
    let rolloverTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRollover = () => {
      if (rolloverTimer) {
        clearTimeout(rolloverTimer);
      }
      rolloverTimer = setTimeout(() => {
        refreshLatestWeek();
        scheduleRollover();
      }, millisecondsUntilNextLocalDay(getNow()));
    };
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshLatestWeek();
        scheduleRollover();
      }
    });
    scheduleRollover();

    return () => {
      subscription.remove();
      if (rolloverTimer) {
        clearTimeout(rolloverTimer);
      }
    };
  }, [getNow, refreshLatestWeek]);

  const loadWeek = useCallback(
    async (selectedWeekStartDate: string, invalidate = false) => {
      const operationId = ++loadOperationRef.current;
      const operationCampusId = campusId;
      let request: AdminWeeklyDevotionRequest | null = null;

      try {
        request = await resolveRequest(selectedWeekStartDate);
        if (
          !request ||
          !isCurrentLoad(
            operationId,
            selectedWeekStartDate,
            loadOperationRef,
            weekStartDateRef,
            campusIdRef,
            mountedRef,
            operationCampusId,
          )
        ) {
          return;
        }

        if (
          request.campusId !== operationCampusId ||
          request.weekStartDate !== selectedWeekStartDate
        ) {
          throw new FaithLogApiError({
            kind: 'error',
            code: 'INVALID_REQUEST_CONTEXT',
            message: '요청한 주차별 현황 범위가 현재 화면과 일치하지 않습니다.',
          });
        }

        if (invalidate) {
          coordinator.invalidate(request);
        }
        const requestContextKey = createViewContextKey(
          request.campusId,
          request.authGeneration,
          request.weekStartDate,
        );
        setState(
          toWeeklyState(requestContextKey, selectedWeekStartDate, coordinator.peek(request)),
        );
        setFeedback(null);

        const result = await coordinator.select(request, latestWeekStartDateRef.current);

        if (
          result.status === 'stale' ||
          !isCurrentLoad(
            operationId,
            selectedWeekStartDate,
            loadOperationRef,
            weekStartDateRef,
            campusIdRef,
            mountedRef,
            operationCampusId,
          ) ||
          !isAuthSessionGenerationCurrent(request.authGeneration)
        ) {
          return;
        }

        setState(toWeeklyState(requestContextKey, selectedWeekStartDate, result.data));
      } catch (error) {
        if (
          error instanceof StaleAuthSessionReadError ||
          !isCurrentLoad(
            operationId,
            selectedWeekStartDate,
            loadOperationRef,
            weekStartDateRef,
            campusIdRef,
            mountedRef,
            operationCampusId,
          )
        ) {
          return;
        }
        const apiError = normalizeError(error);
        if (
          apiError.kind === 'sessionExpired' ||
          apiError.code === 'AUTH_SESSION_CHANGED' ||
          (request && !isAuthSessionGenerationCurrent(request.authGeneration))
        ) {
          return;
        }
        setState(
          apiError.kind === 'permissionDenied'
            ? {
                contextKey: createViewContextKey(
                  operationCampusId,
                  request?.authGeneration ?? getAuthSessionGeneration(),
                  selectedWeekStartDate,
                ),
                error: apiError,
                status: 'permissionDenied',
                weekStartDate: selectedWeekStartDate,
              }
            : {
                contextKey: createViewContextKey(
                  operationCampusId,
                  request?.authGeneration ?? getAuthSessionGeneration(),
                  selectedWeekStartDate,
                ),
                error: apiError,
                status: 'error',
                weekStartDate: selectedWeekStartDate,
              },
        );
      }
    },
    [coordinator, resolveRequest],
  );

  useEffect(() => {
    void loadWeek(weekStartDate);
  }, [loadWeek, weekStartDate]);

  const moveWeek = (direction: -1 | 1) => {
    const nextWeekStartDate = moveAdminWeek(weekStartDateRef.current, direction);
    showWeekImmediately(nextWeekStartDate);
    setWeekStartDate(nextWeekStartDate);
  };

  const exportExcel = () => {
    const selectedWeekStartDate = weekStartDateRef.current;
    const selectedCampusId = campusIdRef.current;
    const selectedContextKey = createViewContextKey(
      selectedCampusId,
      getAuthSessionGeneration(),
      selectedWeekStartDate,
    );
    const existing = exportInFlightRef.current.get(selectedContextKey);
    if (existing) {
      return existing;
    }

    const operation = (async () => {
      let request: AdminWeeklyDevotionRequest | null = null;
      setExportingContextKeys((current) => {
        const next = new Set(current);
        next.add(selectedContextKey);
        return next;
      });
      setFeedback(null);
      try {
        request = await resolveRequest(selectedWeekStartDate);
        if (
          !request ||
          !isCurrentExport(
            selectedCampusId,
            selectedWeekStartDate,
            campusIdRef,
            weekStartDateRef,
            mountedRef,
          ) ||
          request.campusId !== selectedCampusId ||
          request.weekStartDate !== selectedWeekStartDate ||
          !isAuthSessionGenerationCurrent(request.authGeneration)
        ) {
          return;
        }
        const exported = await adapter.exportWeek(request);
        if (
          !isCurrentExport(
            selectedCampusId,
            selectedWeekStartDate,
            campusIdRef,
            weekStartDateRef,
            mountedRef,
          ) ||
          !isAuthSessionGenerationCurrent(request.authGeneration)
        ) {
          return;
        }
        await shareExport(exported);
        if (
          !isCurrentExport(
            selectedCampusId,
            selectedWeekStartDate,
            campusIdRef,
            weekStartDateRef,
            mountedRef,
          ) ||
          !isAuthSessionGenerationCurrent(request.authGeneration)
        ) {
          return;
        }
        const message = 'Excel 파일을 저장하고 공유 화면을 열었습니다.';
        setFeedback({message, tone: 'success'});
        AccessibilityInfo.announceForAccessibility(message);
      } catch (error) {
        if (
          error instanceof StaleAuthSessionReadError ||
          !isCurrentExport(
            selectedCampusId,
            selectedWeekStartDate,
            campusIdRef,
            weekStartDateRef,
            mountedRef,
          )
        ) {
          return;
        }
        const apiError = normalizeError(error);
        if (
          apiError.kind === 'sessionExpired' ||
          apiError.code === 'AUTH_SESSION_CHANGED' ||
          (request && !isAuthSessionGenerationCurrent(request.authGeneration))
        ) {
          return;
        }
        if (apiError.kind === 'permissionDenied') {
          setState({
            contextKey: createViewContextKey(
              selectedCampusId,
              request?.authGeneration ?? getAuthSessionGeneration(),
              selectedWeekStartDate,
            ),
            error: apiError,
            status: 'permissionDenied',
            weekStartDate: selectedWeekStartDate,
          });
        }
        const message =
          apiError.code === 'API_CONTRACT_PENDING'
            ? '현재 Excel 다운로드를 사용할 수 없습니다.'
            : 'Excel 파일을 저장하거나 공유하지 못했습니다.';
        setFeedback({message, tone: 'error'});
        AccessibilityInfo.announceForAccessibility(message);
      }
    })();
    const inFlight = operation.finally(() => {
      if (exportInFlightRef.current.get(selectedContextKey) === inFlight) {
        exportInFlightRef.current.delete(selectedContextKey);
        if (mountedRef.current) {
          setExportingContextKeys((current) => {
            const next = new Set(current);
            next.delete(selectedContextKey);
            return next;
          });
        }
      }
    });
    exportInFlightRef.current.set(selectedContextKey, inFlight);
    return inFlight;
  };

  const selectedContextKey = createViewContextKey(
    campusId,
    getAuthSessionGeneration(),
    weekStartDate,
  );
  const exporting = exportingContextKeys.has(selectedContextKey);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.weekNavigator}>
          <WeekMoveButton
            accessibilityLabel="이전 주 주차별 현황 조회"
            disabled={exporting}
            direction="previous"
            onPress={() => moveWeek(-1)}
          />
          <View style={styles.rangeBlock}>
            <Text accessibilityRole="header" style={styles.rangeTitle}>
              주차별 현황
            </Text>
            <Text numberOfLines={1} style={styles.rangeText}>
              {formatAdminWeekRange(weekStartDate)}
            </Text>
          </View>
          <WeekMoveButton
            accessibilityLabel="다음 주 주차별 현황 조회"
            disabled={exporting}
            direction="next"
            onPress={() => moveWeek(1)}
          />
        </View>
        <WeeklyIconButton
          accessibilityLabel="주차별 경건 현황 Excel 다운로드"
          disabled={exporting}
          onPress={exportExcel}
          tooltip="Excel 다운로드">
          <IconexIcon color={colors.textPrimary} name="download" size={22} />
        </WeeklyIconButton>
      </View>

      {feedback ? (
        <View
          accessibilityRole="alert"
          style={[styles.feedback, feedback.tone === 'error' ? styles.feedbackError : null]}>
          <Text style={styles.feedbackText}>{feedback.message}</Text>
        </View>
      ) : null}

      {renderWeeklyState({
        expandedUserId,
        onRetry: () => void loadWeek(weekStartDate, true),
        onToggleDetails: (userId) =>
          setExpandedUserId((current) => (current === userId ? null : userId)),
        selectedWeekStartDate: weekStartDate,
        selectedContextKey,
        state,
      })}
    </View>
  );
}

function renderWeeklyState({
  expandedUserId,
  onRetry,
  onToggleDetails,
  selectedWeekStartDate,
  selectedContextKey,
  state,
}: {
  expandedUserId: number | null;
  onRetry: () => void;
  onToggleDetails: (userId: number) => void;
  selectedWeekStartDate: string;
  selectedContextKey: string;
  state: WeeklyState;
}) {
  if (
    state.contextKey !== selectedContextKey ||
    state.weekStartDate !== selectedWeekStartDate
  ) {
    return <Loading message="주차별 경건 현황을 불러오고 있어요." />;
  }

  switch (state.status) {
    case 'loading':
      return <Loading message="주차별 경건 현황을 불러오고 있어요." />;
    case 'empty':
      return (
        <Empty
          actionAccessibilityLabel="빈 주차별 경건 현황 다시 조회"
          actionLabel="다시 불러오기"
          message="선택한 주차에 표시할 활성 멤버가 없습니다."
          onActionPress={onRetry}
          title="주차별 현황이 없습니다"
        />
      );
    case 'permissionDenied':
      return (
        <PermissionDenied
          actionAccessibilityLabel="주차별 경건 현황 권한 다시 확인"
          actionLabel="다시 확인"
          message="현재 계정에는 이 캠퍼스의 주차별 현황을 볼 권한이 없습니다."
          onActionPress={onRetry}
          title="관리자 권한이 필요합니다"
        />
      );
    case 'error':
      return state.error.kind === 'offline' ? (
        <Offline
          actionAccessibilityLabel="주차별 경건 현황 네트워크 오류 후 다시 시도"
          actionLabel="다시 시도"
          message="네트워크 연결을 확인한 뒤 다시 시도해 주세요."
          onActionPress={onRetry}
          title="현황을 불러오지 못했습니다"
        />
      ) : (
        <ErrorState
          actionAccessibilityLabel="주차별 경건 현황 오류 후 다시 시도"
          actionLabel="다시 시도"
          message={
            state.error.code === 'API_CONTRACT_PENDING'
              ? '현재 이 기능을 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.'
              : '잠시 후 다시 시도해 주세요.'
          }
          onActionPress={onRetry}
          title={
            state.error.code === 'API_CONTRACT_PENDING'
              ? '기능 준비 중입니다'
              : '현황을 불러오지 못했습니다'
          }
        />
      );
    case 'success':
      return (
        <WeeklySuccess
          key={state.contextKey}
          data={state.data}
          expandedUserId={expandedUserId}
          onToggleDetails={onToggleDetails}
        />
      );
    default:
      return assertNever(state);
  }
}

function WeeklySuccess({
  data,
  expandedUserId,
  onToggleDetails,
}: {
  data: AdminWeeklyDevotion;
  expandedUserId: number | null;
  onToggleDetails: (userId: number) => void;
}) {
  const [submittedRenderLimit, setSubmittedRenderLimit] = useState(
    MEMBER_RENDER_BATCH_SIZE,
  );
  const [missingRenderLimit, setMissingRenderLimit] = useState(
    MEMBER_RENDER_BATCH_SIZE,
  );
  const visibleSubmittedMembers = data.submittedMembers.slice(0, submittedRenderLimit);
  const visibleMissingMembers = data.missingMembers.slice(0, missingRenderLimit);

  return (
    <View style={styles.successContent}>
      <View accessibilityLabel="제출자 표" style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          제출자 {data.submittedMembers.length}명
        </Text>
        {data.submittedMembers.length === 0 ? (
          <Text style={styles.sectionEmpty}>선택한 주차의 제출자가 없습니다.</Text>
        ) : (
          <>
            <ScrollView
              accessibilityLabel="제출자 표 가로 스크롤"
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator>
              <View style={styles.table}>
                <WeeklyTableHeader />
                {visibleSubmittedMembers.map((member) => (
                  <View key={member.userId}>
                    <Pressable
                      accessibilityHint="선택하면 월요일부터 일요일까지 일별 상세를 확인합니다."
                      accessibilityLabel={formatSubmittedMemberAccessibilityLabel(member)}
                      accessibilityRole="button"
                      accessibilityState={{expanded: expandedUserId === member.userId}}
                      onPress={() => onToggleDetails(member.userId)}
                      style={({pressed}) => [styles.tableRow, pressed ? styles.pressed : null]}>
                      <TableText name numberOfLines={1} value={member.name} />
                      <TableText value={String(member.quietTimeCount)} />
                      <TableText value={String(member.bibleReadingCount)} />
                      <TableText value={String(member.prayerCount)} />
                      <TableText value={`${member.saturdayLateMinutes}분`} />
                      <TableText
                        penalty
                        value={`${formatWon(member.penalty?.amount ?? 0)} · ${formatPenaltyStatus(
                          member.penalty?.status ?? null,
                        )}`}
                      />
                    </Pressable>
                    {expandedUserId === member.userId ? (
                      <DailyDetails member={member} weekStartDate={data.weekStartDate} />
                    ) : null}
                  </View>
                ))}
              </View>
            </ScrollView>
            {submittedRenderLimit < data.submittedMembers.length ? (
              <MemberLoadMoreButton
                label="제출자 더 보기"
                onPress={() =>
                  setSubmittedRenderLimit((current) => current + MEMBER_RENDER_BATCH_SIZE)
                }
              />
            ) : null}
          </>
        )}
      </View>

      <View accessibilityLabel="미제출자 목록" style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          미제출자 {data.missingMembers.length}명
        </Text>
        {data.missingMembers.length === 0 ? (
          <Text style={styles.sectionEmpty}>모든 활성 멤버가 제출했습니다.</Text>
        ) : (
          <>
            {visibleMissingMembers.map((member) => (
              <View key={member.userId} style={styles.missingRow}>
                <View style={styles.missingTextBlock}>
                  <Text ellipsizeMode="tail" numberOfLines={1} style={styles.missingName}>
                    {member.name}
                  </Text>
                  <Text ellipsizeMode="tail" numberOfLines={1} style={styles.missingEmail}>
                    {member.email}
                  </Text>
                </View>
                <Text style={styles.missingBadge}>미제출</Text>
              </View>
            ))}
            {missingRenderLimit < data.missingMembers.length ? (
              <MemberLoadMoreButton
                label="미제출자 더 보기"
                onPress={() =>
                  setMissingRenderLimit((current) => current + MEMBER_RENDER_BATCH_SIZE)
                }
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function MemberLoadMoreButton({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.moreButton, pressed ? styles.pressed : null]}>
      <Text style={styles.moreButtonText}>{label}</Text>
    </Pressable>
  );
}

function WeeklyTableHeader() {
  return (
    <View accessibilityRole="header" style={[styles.tableRow, styles.tableHeader]}>
      <TableText header name value="이름" />
      <TableText header value="큐티" />
      <TableText header value="성경" />
      <TableText header value="기도" />
      <TableText header value="토 지각" />
      <TableText header penalty value="벌금/상태" />
    </View>
  );
}

function TableText({
  header = false,
  name = false,
  numberOfLines,
  penalty = false,
  value,
}: {
  header?: boolean;
  name?: boolean;
  numberOfLines?: number;
  penalty?: boolean;
  value: string;
}) {
  return (
    <Text
      ellipsizeMode="tail"
      numberOfLines={numberOfLines ?? 2}
      style={[
        styles.tableCell,
        name ? styles.nameCell : null,
        penalty ? styles.penaltyCell : null,
        header ? styles.tableHeaderText : null,
      ]}>
      {value}
    </Text>
  );
}

function DailyDetails({
  member,
  weekStartDate,
}: {
  member: AdminWeeklyDevotionSubmittedMember;
  weekStartDate: string;
}) {
  const checksByDate = new Map(member.dailyChecks.map((check) => [check.recordDate, check]));
  const monday = new Date(`${weekStartDate}T12:00:00`);

  return (
    <View accessibilityLabel={`${member.name} 일별 상세`} style={styles.dailyDetails}>
      {dayLabels.map((label, index) => {
        const date = Number.isNaN(monday.getTime()) ? null : new Date(monday);
        date?.setDate(date.getDate() + index);
        const dateKey = date ? toLocalDate(date) : '';
        const check = checksByDate.get(dateKey);
        return (
          <DailyCheckItem
            {...(check ? {check} : {})}
            key={`${member.userId}-${label}`}
            label={label}
          />
        );
      })}
    </View>
  );
}

function DailyCheckItem({
  check,
  label,
}: {
  check?: AdminWeeklyDevotionDailyCheck;
  label: string;
}) {
  return (
    <View style={styles.dailyItem}>
      <Text style={styles.dailyDay}>{label}</Text>
      <Text style={styles.dailyValue}>
        큐 {toCheckMark(check?.quietTime)} · 성 {toCheckMark(check?.bibleReading)} · 기{' '}
        {toCheckMark(check?.prayer)}
      </Text>
    </View>
  );
}

function WeekMoveButton({
  accessibilityLabel,
  direction,
  disabled,
  onPress,
}: {
  accessibilityLabel: string;
  direction: 'next' | 'previous';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.weekButton,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text style={styles.weekButtonText}>{direction === 'previous' ? '‹' : '›'}</Text>
    </Pressable>
  );
}

function WeeklyIconButton({
  accessibilityLabel,
  children,
  disabled,
  onPress,
  tooltip,
}: {
  accessibilityLabel: string;
  children: React.ReactNode;
  disabled: boolean;
  onPress: () => void;
  tooltip: string;
}) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const showTooltip = () => {
    setTooltipVisible(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setTooltipVisible(false), 1800);
  };

  return (
    <View style={styles.iconButtonWrap}>
      <Pressable
        accessibilityHint={tooltip}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{busy: disabled, disabled}}
        disabled={disabled}
        onLongPress={showTooltip}
        onPress={onPress}
        style={({pressed}) => [
          styles.iconButton,
          disabled ? styles.disabled : null,
          pressed ? styles.pressed : null,
        ]}>
        {children}
      </Pressable>
      {tooltipVisible ? (
        <View accessibilityRole="alert" style={styles.tooltip}>
          <Text style={styles.tooltipText}>{tooltip}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createRuntimeAdapter(): AdminWeeklyDevotionAdapter {
  return isMockModeEnabled()
    ? createMockAdminWeeklyDevotionAdapter()
    : createProductionAdminWeeklyDevotionAdapter();
}

function normalizeError(error: unknown): FaithLogApiError['detail'] {
  if (error instanceof FaithLogApiError) {
    return error.detail;
  }
  return {kind: 'error', message: '주차별 경건 현황을 처리하지 못했습니다.'};
}

function formatPenaltyStatus(status: AdminWeeklyDevotionPenalty['status'] | null) {
  switch (status) {
    case 'UNPAID':
      return '미납';
    case 'PAID':
      return '납부';
    case 'WAIVED':
      return '면제';
    case 'CANCELED':
      return '취소';
    case null:
      return '없음';
    default:
      return assertNever(status);
  }
}

export function formatSubmittedMemberAccessibilityLabel(
  member: AdminWeeklyDevotionSubmittedMember,
) {
  return `${member.name}, 큐티 ${member.quietTimeCount}회, 성경 ${
    member.bibleReadingCount
  }회, 기도 ${member.prayerCount}회, 토요일 지각 ${
    member.saturdayLateMinutes
  }분, 벌금 ${formatWon(member.penalty?.amount ?? 0)}, 상태 ${formatPenaltyStatus(
    member.penalty?.status ?? null,
  )}, 일별 상세 열기`;
}

function toCheckMark(value: boolean | undefined) {
  return value ? '✓' : '–';
}

function toLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function toWeeklyState(
  contextKey: string,
  weekStartDate: string,
  data?: AdminWeeklyDevotion,
): WeeklyState {
  if (!data) {
    return {contextKey, status: 'loading', weekStartDate};
  }
  return data.activeMemberCount === 0
    ? {contextKey, status: 'empty', weekStartDate}
    : {contextKey, data, status: 'success', weekStartDate};
}

function isCurrentLoad(
  operationId: number,
  selectedWeekStartDate: string,
  loadOperationRef: React.RefObject<number>,
  weekStartDateRef: React.RefObject<string>,
  campusIdRef: React.RefObject<number>,
  mountedRef: React.RefObject<boolean>,
  expectedCampusId: number,
) {
  return (
    mountedRef.current &&
    campusIdRef.current === expectedCampusId &&
    weekStartDateRef.current === selectedWeekStartDate &&
    loadOperationRef.current === operationId
  );
}

function isCurrentExport(
  selectedCampusId: number,
  selectedWeekStartDate: string,
  campusIdRef: React.RefObject<number>,
  weekStartDateRef: React.RefObject<string>,
  mountedRef: React.RefObject<boolean>,
) {
  return (
    mountedRef.current &&
    campusIdRef.current === selectedCampusId &&
    weekStartDateRef.current === selectedWeekStartDate
  );
}

function createViewContextKey(
  campusId: number,
  authGeneration: number,
  weekStartDate: string,
) {
  return `${campusId}:${authGeneration}:${weekStartDate}`;
}

function getSystemNow() {
  return new Date();
}

function millisecondsUntilNextLocalDay(now: Date) {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 1, 0);
  return Math.max(1_000, nextDay.getTime() - now.getTime());
}

function assertNever(value: never): never {
  throw new Error(`Unhandled weekly devotion state: ${String(value)}`);
}

const styles = StyleSheet.create({
  container: {gap: spacing.gap},
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  weekNavigator: {alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8},
  rangeBlock: {alignItems: 'center', flex: 1, minWidth: 0},
  rangeTitle: {color: colors.textPrimary, fontSize: 17, fontWeight: '700'},
  rangeText: {color: colors.textSecondary, fontSize: 13, marginTop: 2},
  weekButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  weekButtonText: {color: colors.textPrimary, fontSize: 30, lineHeight: 32},
  iconButtonWrap: {position: 'relative'},
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  tooltip: {
    backgroundColor: colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'absolute',
    right: 0,
    top: 52,
    zIndex: 20,
  },
  tooltipText: {color: colors.surface, fontSize: 12, fontWeight: '600'},
  feedback: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  feedbackError: {backgroundColor: colors.dangerSoft},
  feedbackText: {color: colors.textSecondary, fontSize: 14, lineHeight: 20},
  successContent: {gap: 18},
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.item,
    gap: 10,
    padding: 16,
  },
  sectionTitle: {color: colors.textPrimary, fontSize: 16, fontWeight: '700'},
  sectionEmpty: {color: colors.textMuted, fontSize: 14, lineHeight: 20},
  moreButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  moreButtonText: {color: colors.textPrimary, fontSize: 14, fontWeight: '600'},
  table: {minWidth: 620},
  tableRow: {
    alignItems: 'stretch',
    borderBottomColor: colors.borderSoft,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
  },
  tableHeader: {backgroundColor: colors.background, minHeight: 42},
  tableCell: {
    color: colors.textSecondary,
    fontSize: 13,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    textAlign: 'center',
    width: 68,
  },
  nameCell: {color: colors.textPrimary, textAlign: 'left', width: 112},
  penaltyCell: {width: 168},
  tableHeaderText: {color: colors.textMuted, fontWeight: '600'},
  dailyDetails: {
    backgroundColor: colors.background,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
  },
  dailyItem: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    minWidth: 138,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dailyDay: {color: colors.textPrimary, fontSize: 13, fontWeight: '700'},
  dailyValue: {color: colors.textSecondary, fontSize: 12, marginTop: 3},
  missingRow: {
    alignItems: 'center',
    borderBottomColor: colors.borderSoft,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingVertical: 8,
  },
  missingTextBlock: {flex: 1, minWidth: 0},
  missingName: {color: colors.textPrimary, fontSize: 14, fontWeight: '600'},
  missingEmail: {color: colors.textMuted, fontSize: 12, marginTop: 2},
  missingBadge: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.pill,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  disabled: {opacity: 0.45},
  pressed: {opacity: 0.72},
});
