import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AccessibilityInfo,
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
  clearTokens,
  getAuthSessionGeneration,
  isAuthSessionGenerationCurrent,
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
  AdminWeeklyDevotionExportGate,
  formatAdminWeekRange,
  getAdminWeekStartDate,
  moveAdminWeek,
} from './adminWeeklyDevotion';
import {saveAndShareAdminWeeklyDevotionExport} from './adminWeeklyDevotionFile';

type WeeklyState =
  | {status: 'loading'}
  | {data: AdminWeeklyDevotion; status: 'success'}
  | {status: 'empty'}
  | {error: FaithLogApiError['detail']; status: 'error'}
  | {error: FaithLogApiError['detail']; status: 'permissionDenied'};

type Feedback = {
  message: string;
  tone: 'error' | 'success';
} | null;

type Props = {
  campusId: number;
  setAuthState: (state: AuthGateState) => void;
};

const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];

export function AdminWeeklyDevotionSection({campusId, setAuthState}: Props) {
  const latestWeekStartDate = useMemo(() => getAdminWeekStartDate(new Date()), []);
  const [weekStartDate, setWeekStartDate] = useState(latestWeekStartDate);
  const [state, setState] = useState<WeeklyState>({status: 'loading'});
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const adapter = useMemo(createRuntimeAdapter, []);
  const coordinator = useMemo(() => new AdminWeeklyDevotionCoordinator(adapter), [adapter]);
  const exportGate = useMemo(
    () => new AdminWeeklyDevotionExportGate(adapter.exportWeek),
    [adapter],
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setWeekStartDate(latestWeekStartDate);
    setExpandedUserId(null);
    setFeedback(null);
  }, [campusId, latestWeekStartDate]);

  const handleSessionExpired = useCallback(
    async (error: FaithLogApiError['detail']) => {
      if (error.kind !== 'sessionExpired') {
        return;
      }
      await clearTokens(error.authSessionGeneration);
      if (mountedRef.current) {
        setAuthState({status: 'sessionExpired', message: error.message});
      }
    },
    [setAuthState],
  );

  const resolveRequest = useCallback(
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

  const loadWeek = useCallback(
    async (selectedWeekStartDate: string, invalidate = false) => {
      const request = await resolveRequest(selectedWeekStartDate);
      if (!request || !mountedRef.current) {
        return;
      }

      if (invalidate) {
        coordinator.invalidate(request);
      }
      const cached = coordinator.peek(request);
      setState(
        cached
          ? cached.activeMemberCount === 0
            ? {status: 'empty'}
            : {data: cached, status: 'success'}
          : {status: 'loading'},
      );
      setFeedback(null);

      try {
        const result = await coordinator.select(
          request,
          latestWeekStartDate,
          (prefetchError) => {
            if (prefetchError instanceof FaithLogApiError) {
              void handleSessionExpired(prefetchError.detail);
            }
          },
        );

        if (
          result.status === 'stale' ||
          !mountedRef.current ||
          !isAuthSessionGenerationCurrent(request.authGeneration)
        ) {
          return;
        }

        setState(
          result.data.activeMemberCount === 0
            ? {status: 'empty'}
            : {data: result.data, status: 'success'},
        );
      } catch (error) {
        if (!mountedRef.current || !isAuthSessionGenerationCurrent(request.authGeneration)) {
          return;
        }
        const apiError = normalizeError(error);
        if (apiError.kind === 'sessionExpired') {
          await handleSessionExpired(apiError);
          return;
        }
        setState(
          apiError.kind === 'permissionDenied'
            ? {error: apiError, status: 'permissionDenied'}
            : {error: apiError, status: 'error'},
        );
      }
    },
    [coordinator, handleSessionExpired, latestWeekStartDate, resolveRequest],
  );

  useEffect(() => {
    void loadWeek(weekStartDate);
  }, [loadWeek, weekStartDate]);

  const moveWeek = (direction: -1 | 1) => {
    setExpandedUserId(null);
    setWeekStartDate((current) => moveAdminWeek(current, direction));
  };

  const exportExcel = async () => {
    if (exporting) {
      return;
    }
    const request = await resolveRequest(weekStartDate);
    if (!request || !mountedRef.current) {
      return;
    }

    setExporting(true);
    setFeedback(null);
    try {
      const exported = await exportGate.run(request);
      await saveAndShareAdminWeeklyDevotionExport(exported);
      if (!mountedRef.current || !isAuthSessionGenerationCurrent(request.authGeneration)) {
        return;
      }
      const message = 'Excel 파일을 저장하고 공유 화면을 열었습니다.';
      setFeedback({message, tone: 'success'});
      AccessibilityInfo.announceForAccessibility(message);
    } catch (error) {
      if (!mountedRef.current || !isAuthSessionGenerationCurrent(request.authGeneration)) {
        return;
      }
      const apiError = normalizeError(error);
      if (apiError.kind === 'sessionExpired') {
        await handleSessionExpired(apiError);
        return;
      }
      if (apiError.kind === 'permissionDenied') {
        setState({error: apiError, status: 'permissionDenied'});
      }
      const message =
        apiError.code === 'API_CONTRACT_PENDING'
          ? 'REST Docs 계약 확정 전에는 Excel을 다운로드할 수 없습니다.'
          : 'Excel 파일을 저장하거나 공유하지 못했습니다.';
      setFeedback({message, tone: 'error'});
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      if (mountedRef.current) {
        setExporting(false);
      }
    }
  };

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
          onPress={() => void exportExcel()}
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
        state,
      })}
    </View>
  );
}

function renderWeeklyState({
  expandedUserId,
  onRetry,
  onToggleDetails,
  state,
}: {
  expandedUserId: number | null;
  onRetry: () => void;
  onToggleDetails: (userId: number) => void;
  state: WeeklyState;
}) {
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
              ? '백엔드 REST Docs 계약이 아직 확정되지 않아 production 조회를 차단했습니다.'
              : '잠시 후 다시 시도해 주세요.'
          }
          onActionPress={onRetry}
          title={
            state.error.code === 'API_CONTRACT_PENDING'
              ? 'API 계약 확인 중입니다'
              : '현황을 불러오지 못했습니다'
          }
        />
      );
    case 'success':
      return (
        <WeeklySuccess
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
  return (
    <View style={styles.successContent}>
      <View accessibilityLabel="제출자 표" style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          제출자 {data.submittedMembers.length}명
        </Text>
        {data.submittedMembers.length === 0 ? (
          <Text style={styles.sectionEmpty}>선택한 주차의 제출자가 없습니다.</Text>
        ) : (
          <ScrollView
            accessibilityLabel="제출자 표 가로 스크롤"
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator>
            <View style={styles.table}>
              <WeeklyTableHeader />
              {data.submittedMembers.map((member) => (
                <View key={member.userId}>
                  <Pressable
                    accessibilityHint="선택하면 월요일부터 일요일까지 일별 상세를 확인합니다."
                    accessibilityLabel={`${member.name} 일별 상세 열기`}
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
        )}
      </View>

      <View accessibilityLabel="미제출자 목록" style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          미제출자 {data.missingMembers.length}명
        </Text>
        {data.missingMembers.length === 0 ? (
          <Text style={styles.sectionEmpty}>모든 활성 멤버가 제출했습니다.</Text>
        ) : (
          data.missingMembers.map((member) => (
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
          ))
        )}
      </View>
    </View>
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

function toCheckMark(value: boolean | undefined) {
  return value ? '✓' : '–';
}

function toLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
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
