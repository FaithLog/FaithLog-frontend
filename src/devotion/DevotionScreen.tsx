import {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';

import {
  FaithLogApiError,
  fetchWeeklyDevotionSummary,
  saveWeeklyDevotion,
} from '../api/client';
import {getApiErrorPresentation} from '../api/errorPolicy';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {ApiError, DevotionDailyCheck, WeeklyDevotionSummary} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {
  Conflict,
  ErrorState,
  Loading,
  Offline,
  PermissionDenied,
} from '../components/ui';
import {colors, radius, spacing} from '../theme';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type Notice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

type DevotionScreenProps = {
  onBackToHome: () => void;
  onOpenMonthlyCalendar: () => void;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
  state: AuthenticatedState;
};

type DevotionLoadState =
  | {status: 'idle' | 'loading'}
  | {status: 'success'; weekly: WeeklyDevotionSummary}
  | {status: 'error'; error: ApiError};

type DailyFormCheck = DevotionDailyCheck & {
  recordDate: string;
};

type SavingAction = 'draft' | 'submit' | null;

const REQUIRED_DAYS = 5;
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;
const DEVOTION_FIELD_LABELS = [
  ['quietTimeChecked', '큐티'],
  ['prayerChecked', '기도'],
  ['bibleReadingChecked', '말씀'],
] as const;

export function DevotionScreen({
  onBackToHome,
  onOpenMonthlyCalendar,
  setAuthState,
  setNotice,
  state,
}: DevotionScreenProps) {
  const [today, setToday] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(today));
  const selectedWeekStart = useMemo(() => getWeekStartDate(parseDate(selectedDate)), [selectedDate]);
  const [loadState, setLoadState] = useState<DevotionLoadState>({status: 'idle'});
  const [formChecks, setFormChecks] = useState<DailyFormCheck[]>([]);
  const [lateMinutesText, setLateMinutesText] = useState('0');
  const [savingAction, setSavingAction] = useState<SavingAction>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [submitComplete, setSubmitComplete] = useState(false);
  const campusId = state.selectedCampus.campusId;

  const loadDevotion = async () => {
    setLoadState({status: 'loading'});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const weekly = await fetchWeeklyDevotionSummary(accessToken, campusId, selectedWeekStart);
      setLoadState({status: 'success', weekly});
      setFormChecks(normalizeWeekChecks(weekly));
      setLateMinutesText(String(Math.max(0, weekly.saturdayLateMinutes)));
      setSubmitComplete(Boolean(weekly.submittedAt));
    } catch (error) {
      const apiError = toApiError(error, '경건생활 주간 기록을 불러오지 못했습니다.');
      setLoadState({status: 'error', error: apiError});
      handleAuthError(apiError, setAuthState);
    }
  };

  useEffect(() => {
    setToday(new Date());
  }, []);

  useEffect(() => {
    void loadDevotion();
  }, [campusId, selectedWeekStart]);

  const loadedWeekly = loadState.status === 'success' ? loadState.weekly : null;
  const locked = Boolean(loadedWeekly?.submittedAt);
  const lateMinutes = parseLateMinutes(lateMinutesText);
  const missingSummary = getMissingSummary(formChecks, lateMinutes ?? 0);
  const invalidLateMinutes = lateMinutes === null;

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setSubmitComplete(false);
  };

  const moveWeek = (direction: -1 | 1) => {
    setSelectedDate(formatLocalDate(addDays(parseDate(selectedWeekStart), direction * 7)));
    setSubmitComplete(false);
  };

  const toggleCheck = (
    recordDate: string,
    field: 'quietTimeChecked' | 'prayerChecked' | 'bibleReadingChecked',
  ) => {
    if (locked || savingAction) {
      return;
    }

    setSubmitComplete(false);
    setActionError(null);
    setFormChecks((current) =>
      current.map((check) =>
        check.recordDate === recordDate ? {...check, [field]: !check[field]} : check,
      ),
    );
  };

  const saveWeek = async (submit: boolean) => {
    if (locked || savingAction || invalidLateMinutes) {
      return;
    }

    setSavingAction(submit ? 'submit' : 'draft');
    setActionError(null);
    setSubmitComplete(false);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const nextWeekly = await saveWeeklyDevotion(accessToken, campusId, selectedWeekStart, {
        dailyChecks: formChecks.map((check) => ({
          recordDate: check.recordDate,
          quietTimeChecked: check.quietTimeChecked,
          prayerChecked: check.prayerChecked,
          bibleReadingChecked: check.bibleReadingChecked,
        })),
        saturdayLateMinutes: lateMinutes ?? 0,
        submit,
      });

      if (submit) {
        setSubmitComplete(true);
      }

      setNotice({
        tone: 'success',
        title: submit ? '경건생활 제출 완료' : '경건생활 임시저장',
        message: submit
          ? '제출 후에는 이 주차 기록을 수정할 수 없습니다.'
          : '주간 기록을 저장했습니다. 제출 전까지 다시 수정할 수 있습니다.',
      });
      setLoadState({status: 'success', weekly: nextWeekly});
      setFormChecks(normalizeWeekChecks(nextWeekly));
      setLateMinutesText(String(Math.max(0, nextWeekly.saturdayLateMinutes)));
      await loadDevotion();
    } catch (error) {
      const apiError = toApiError(
        error,
        submit ? '경건생활을 제출하지 못했습니다.' : '경건생활을 저장하지 못했습니다.',
      );
      setActionError(apiError);
      handleAuthError(apiError, setAuthState);
    } finally {
      setSavingAction(null);
    }
  };

  if (loadState.status !== 'success') {
    if (loadState.status === 'error') {
      return <DevotionErrorState error={loadState.error} onRetry={loadDevotion} />;
    }

    return <Loading message="경건생활 주간 기록을 불러오고 있어요." />;
  }

  const weekly = loadState.weekly;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.contextRow}>
          <View style={styles.campusChip}>
            <Text ellipsizeMode="tail" numberOfLines={1} style={styles.campusChipText}>
              {state.selectedCampus.region} {state.selectedCampus.campusName}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="경건생활에서 월간 캘린더로 이동"
            accessibilityRole="button"
            onPress={onOpenMonthlyCalendar}
            style={({pressed}) => [styles.headerAction, pressed ? styles.pressed : null]}>
            <Text style={styles.headerActionText}>캘린더</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>경건생활</Text>
      </View>

      <View style={styles.weekCard}>
        <View style={styles.weekRangeRow}>
          <Pressable
            accessibilityLabel="이전 주 경건생활 보기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => moveWeek(-1)}>
            <Text style={styles.weekChevron}>〈</Text>
          </Pressable>
          <Text style={styles.weekRange}>
            {formatShortDate(weekly.weekStartDate)} - {formatShortDate(weekly.weekEndDate)}
          </Text>
          <Pressable
            accessibilityLabel="다음 주 경건생활 보기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => moveWeek(1)}>
            <Text style={styles.weekChevron}>〉</Text>
          </Pressable>
        </View>
        <View style={styles.weekPolicyRow}>
          <Text style={styles.weekPolicyText}>벌금 기준 5일</Text>
          <Text style={styles.weekPolicyText}>
            {locked ? '제출 완료' : '5일 채우면 벌금 없음'}
          </Text>
        </View>
        <Text style={styles.weekProgress}>
          현재 큐티 {weekly.quietTimeCount}/{REQUIRED_DAYS} · 기도 {weekly.prayerCount}/
          {REQUIRED_DAYS} · 말씀 {weekly.bibleReadingCount}/{REQUIRED_DAYS}
        </Text>
      </View>

      {actionError ? <DevotionActionError error={actionError} onRetry={loadDevotion} /> : null}

      {savingAction === 'submit' ? (
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>제출 처리 중</Text>
          <Text style={styles.statusMessage}>
            주간 기록을 제출하고 있어요. 완료 전까지 화면을 닫지 말아 주세요.
          </Text>
        </View>
      ) : null}

      {submitComplete && !locked ? (
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>제출 처리 완료</Text>
          <Text style={styles.statusMessage}>최신 제출 상태를 다시 확인하고 있어요.</Text>
        </View>
      ) : null}

      {locked ? (
        <SubmittedWeekSummary checks={formChecks} weekly={weekly} />
      ) : (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>7일 기록</Text>
            <Text style={styles.sectionHelp}>한 화면에 다 안 들어가면 스크롤해서 입력해요</Text>
          </View>
          <View style={styles.dayList}>
            {formChecks.map((check, index) => (
              <DayCheckRow
                check={check}
                disabled={Boolean(savingAction)}
                isWeekend={index >= 5}
                key={check.recordDate}
                label={DAY_LABELS[index] ?? ''}
                onSelect={() => selectDate(check.recordDate)}
                onToggle={toggleCheck}
                selected={check.recordDate === selectedDate}
              />
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>토요 지각</Text>
            <Text style={styles.sectionHelp}>지각한 시간이 있다면 분 단위로 입력해요</Text>
          </View>
          <View style={styles.lateMinutesCard}>
            <View style={styles.lateMinutesText}>
              <Text style={styles.lateMinutesLabel}>지각 시간</Text>
              <Text style={styles.lateMinutesHelp}>토요 모임 지각 분</Text>
            </View>
            <TextInput
              accessibilityLabel="토요 목자 모임 지각 분 입력"
              editable={!savingAction}
              keyboardType="number-pad"
              onChangeText={(value) => {
                setSubmitComplete(false);
                setActionError(null);
                setLateMinutesText(value.replace(/[^\d]/g, '').slice(0, 4));
              }}
              placeholder="0"
              placeholderTextColor={colors.subtleText}
              style={[styles.lateMinutesInput, invalidLateMinutes ? styles.inputError : null]}
              value={lateMinutesText}
            />
          </View>
          {invalidLateMinutes ? (
            <Text style={styles.fieldError}>지각 시간은 0 이상 정수로 입력해 주세요.</Text>
          ) : null}

          <View style={styles.penaltyCard}>
            <View>
              <Text style={styles.penaltyLabel}>예상 벌금</Text>
              <Text style={styles.penaltyHelp}>서버 벌금 규칙 기준으로 제출 시 확정돼요</Text>
            </View>
            <Text style={styles.penaltyValue}>
              {missingSummary.missingTypes > 0
                ? `기준 미달 ${missingSummary.missingTypes}개`
                : '없음'}
            </Text>
          </View>

          <View style={styles.actionRow}>
            <WeekActionButton
              accessibilityLabel="경건생활 주간 임시저장"
              disabled={Boolean(savingAction) || invalidLateMinutes}
              onPress={() => void saveWeek(false)}
              variant="secondary">
              {savingAction === 'draft' ? '저장 중...' : '임시저장'}
            </WeekActionButton>
            <WeekActionButton
              accessibilityLabel="경건생활 주간 제출"
              disabled={Boolean(savingAction) || invalidLateMinutes}
              onPress={() => void saveWeek(true)}>
              {savingAction === 'submit' ? '제출 중...' : '제출하기'}
            </WeekActionButton>
          </View>
        </>
      )}

      <Pressable
        accessibilityLabel="경건생활에서 홈으로 이동"
        accessibilityRole="button"
        onPress={onBackToHome}
        style={({pressed}) => [styles.homeLink, pressed ? styles.pressed : null]}>
        <Text style={styles.homeLinkText}>홈으로</Text>
      </Pressable>
    </View>
  );
}

function WeekActionButton({
  accessibilityLabel,
  children,
  disabled,
  onPress,
  variant = 'primary',
}: {
  accessibilityLabel: string;
  children: string;
  disabled: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.weekActionButton,
        variant === 'secondary' ? styles.weekActionSecondary : styles.weekActionPrimary,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text
        style={[
          styles.weekActionText,
          variant === 'secondary' ? styles.weekActionTextSecondary : styles.weekActionTextPrimary,
        ]}>
        {children}
      </Text>
    </Pressable>
  );
}

function DayCheckRow({
  check,
  disabled,
  isWeekend,
  label,
  onSelect,
  onToggle,
  selected,
}: {
  check: DailyFormCheck;
  disabled: boolean;
  isWeekend: boolean;
  label: string;
  onSelect: () => void;
  onToggle: (
    recordDate: string,
    field: 'quietTimeChecked' | 'prayerChecked' | 'bibleReadingChecked',
  ) => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}요일 ${formatShortDate(check.recordDate)} 선택`}
      accessibilityRole="button"
      accessibilityState={{selected}}
      onPress={onSelect}
      style={({pressed}) => [
        styles.dayRow,
        isWeekend ? styles.dayRowWeekend : null,
        selected ? styles.dayRowSelected : null,
        pressed ? styles.pressed : null,
      ]}>
      <View style={styles.dayMeta}>
        <Text style={[styles.dayLabel, isWeekend ? styles.dayLabelWeekend : null]}>{label}</Text>
        <Text style={styles.dayDate}>{formatShortDate(check.recordDate)}</Text>
      </View>
      <View style={styles.checkPillRow}>
        {DEVOTION_FIELD_LABELS.map(([field, fieldLabel]) => (
          <CheckPill
            checked={check[field]}
            disabled={disabled}
            key={field}
            label={fieldLabel}
            onPress={() => onToggle(check.recordDate, field)}
          />
        ))}
      </View>
    </Pressable>
  );
}

function CheckPill({
  checked,
  disabled,
  label,
  onPress,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} ${checked ? '체크 해제' : '체크'}`}
      accessibilityRole="checkbox"
      accessibilityState={{checked, disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.checkPill,
        checked ? styles.checkPillChecked : null,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text style={[styles.checkPillText, checked ? styles.checkPillTextChecked : null]}>
        {checked ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

function SubmittedWeekSummary({
  checks,
  weekly,
}: {
  checks: DailyFormCheck[];
  weekly: WeeklyDevotionSummary;
}) {
  return (
    <View style={styles.lockedSection}>
      <View style={styles.lockedCard}>
        <View style={styles.lockedCardText}>
          <Text style={styles.lockedTitle}>{getWeekOrdinalLabel(weekly.weekStartDate)} 제출 완료</Text>
          <Text style={styles.lockedMessage}>제출 후에는 이번 주 기록을 수정할 수 없어요</Text>
        </View>
        <Text style={styles.lockedPill}>잠김</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>일별 체크</Text>
      </View>
      <View style={styles.lockedDayRow}>
        {checks.map((check, index) => {
          const complete = getDailyCompletionCount(check) >= 3;
          const weekend = index >= 5;

          return (
            <View
              key={check.recordDate}
              style={[styles.lockedDay, complete ? styles.lockedDayComplete : null]}>
              <Text style={[styles.lockedDayLabel, weekend ? styles.lockedDayWeekend : null]}>
                {DAY_LABELS[index] ?? ''}
              </Text>
              <Text style={styles.lockedDayMark}>{complete ? '✓' : '-'}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.lockedInfoCard}>
        <View>
          <Text style={styles.lockedInfoTitle}>제출 시간</Text>
          <Text style={styles.lockedInfoText}>{formatSubmittedAt(weekly.submittedAt)} 저장</Text>
        </View>
        <Text style={styles.donePill}>완료</Text>
      </View>
      <View style={styles.lockedInfoCard}>
        <View>
          <Text style={styles.lockedInfoTitle}>수정 제한</Text>
          <Text style={styles.lockedInfoText}>관리자에게 문의해야 해요</Text>
        </View>
        <Text style={styles.readOnlyPill}>읽기</Text>
      </View>
    </View>
  );
}

function DevotionErrorState({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  const presentation = getApiErrorPresentation(error, {
    conflictTitle: '최신 경건 기록 확인이 필요합니다',
    conflictMessage: '서버의 최신 경건생활 상태와 충돌했습니다. 다시 불러와 주세요.',
    permissionTitle: '경건생활 접근 권한이 없습니다',
    permissionMessage: 'ACTIVE 캠퍼스 멤버에게만 경건생활 화면이 열립니다.',
    defaultTitle: '경건생활을 불러오지 못했습니다',
  });

  switch (error.kind) {
    case 'sessionExpired':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="경건생활 세션 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'permissionDenied':
      return (
        <PermissionDenied
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="경건생활 권한 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="경건생활 충돌 후 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="경건생활 오프라인 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="경건생활 일반 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    default:
      return assertNever(error.kind);
  }
}

function DevotionActionError({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  if (error.code === 'BILLING_REQUIRED_PAYMENT_ACCOUNT_MISSING') {
    return (
      <PermissionDenied
        title="벌금 입금 계좌가 필요합니다"
        message="제출은 서버 벌금 계좌 설정이 필요합니다. 관리자에게 PENALTY 계좌 설정을 요청해 주세요."
        actionLabel="상태 다시 확인"
        actionAccessibilityLabel="벌금 계좌 누락 후 경건생활 다시 확인"
        onActionPress={onRetry}
      />
    );
  }

  if (error.code === 'DEVOTION_WEEKLY_ALREADY_SUBMITTED') {
    return (
      <Conflict
        title="이미 제출된 주차입니다"
        message="서버에서 제출 완료 주차로 응답했습니다. 최신 상태를 다시 불러오면 입력이 잠깁니다."
        actionLabel="다시 불러오기"
        actionAccessibilityLabel="이미 제출된 주차 다시 불러오기"
        onActionPress={onRetry}
      />
    );
  }

  return <DevotionErrorState error={error} onRetry={onRetry} />;
}

async function resolveAccessToken(setAuthState: (state: AuthGateState) => void) {
  const {accessToken} = await getStoredTokens();

  if (!accessToken) {
    await clearTokens();
    setAuthState({status: 'sessionExpired', message: '저장된 access token이 없습니다.'});
    return null;
  }

  return accessToken;
}

function handleAuthError(error: ApiError, setAuthState: (state: AuthGateState) => void) {
  if (error.kind === 'sessionExpired') {
    void clearTokens();
    setAuthState({status: 'sessionExpired', message: error.message});
  }
}

function normalizeWeekChecks(weekly: WeeklyDevotionSummary): DailyFormCheck[] {
  const start = parseDate(weekly.weekStartDate);

  return Array.from({length: 7}, (_, index) => {
    const recordDate = formatLocalDate(addDays(start, index));
    const existing = weekly.dailyChecks.find((check) => check.recordDate === recordDate);

    return {
      id: existing?.id ?? null,
      recordDate,
      quietTimeChecked: existing?.quietTimeChecked ?? false,
      prayerChecked: existing?.prayerChecked ?? false,
      bibleReadingChecked: existing?.bibleReadingChecked ?? false,
    };
  });
}

function getMissingSummary(checks: DailyFormCheck[], lateMinutes: number) {
  const counts = checks.reduce(
    (accumulator, check) => ({
      quietTime: accumulator.quietTime + Number(check.quietTimeChecked),
      prayer: accumulator.prayer + Number(check.prayerChecked),
      bibleReading: accumulator.bibleReading + Number(check.bibleReadingChecked),
    }),
    {quietTime: 0, prayer: 0, bibleReading: 0},
  );
  const deficits = [
    Math.max(0, REQUIRED_DAYS - counts.quietTime),
    Math.max(0, REQUIRED_DAYS - counts.prayer),
    Math.max(0, REQUIRED_DAYS - counts.bibleReading),
  ];

  return {
    missingTypes: deficits.filter((value) => value > 0).length + Number(lateMinutes > 0),
    missingCount: deficits.reduce((sum, value) => sum + value, 0),
  };
}

function getDailyCompletionCount(check: DailyFormCheck) {
  return Math.min(
    3,
    Number(check.quietTimeChecked) +
      Number(check.prayerChecked) +
      Number(check.bibleReadingChecked),
  );
}

function parseLateMinutes(value: string) {
  if (value.trim() === '') {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function getWeekStartDate(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);

  return formatLocalDate(start);
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function addDays(date: Date, amount: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);

  return nextDate;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatShortDate(value: string) {
  const date = parseDate(value);

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatSubmittedAt(value: string | null) {
  if (!value) {
    return '제출 시간 확인 중';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}.${month}.${day} ${hours}:${minutes}`;
}

function getWeekOrdinalLabel(weekStartDate: string) {
  const date = parseDate(weekStartDate);
  const month = date.getMonth() + 1;
  const ordinal = Math.ceil(date.getDate() / 7);

  return `${month}월 ${ordinal}주차`;
}

function toApiError(error: unknown, fallback: string): ApiError {
  if (error instanceof FaithLogApiError) {
    return error.detail;
  }

  return {kind: 'error', message: fallback};
}

function assertNever(value: never): never {
  throw new Error(`Unhandled state: ${String(value)}`);
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: -8,
  },
  campusChip: {
    alignItems: 'center',
    backgroundColor: '#E9F6F7',
    borderRadius: 12,
    justifyContent: 'center',
    maxWidth: 220,
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  campusChipText: {
    color: colors.faith,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  checkPill: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 62,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  checkPillChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkPillRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  checkPillText: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    textAlign: 'center',
  },
  checkPillTextChecked: {
    color: colors.surface,
  },
  contextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  dayDate: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  dayLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  dayLabelWeekend: {
    color: colors.faith,
  },
  dayList: {
    gap: 10,
  },
  dayMeta: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 10,
    minWidth: 72,
  },
  dayRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.gap,
    minHeight: 56,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  dayRowSelected: {
    borderColor: colors.primary,
  },
  dayRowWeekend: {
    backgroundColor: '#EEF8F9',
    borderColor: colors.mint,
  },
  disabled: {
    opacity: 0.45,
  },
  donePill: {
    backgroundColor: '#E9F6F7',
    borderRadius: radius.pill,
    color: colors.faith,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    minWidth: 62,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
    textAlign: 'center',
  },
  fieldError: {
    color: colors.danger,
    flexWrap: 'wrap',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  header: {
    gap: 10,
  },
  headerAction: {
    alignItems: 'center',
    backgroundColor: '#E8F3FF',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 12,
  },
  headerActionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  homeLink: {
    alignSelf: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  homeLinkText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  inputError: {
    borderColor: colors.danger,
  },
  lateMinutesCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
    minHeight: 76,
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  lateMinutesHelp: {
    color: colors.textMuted,
    flexWrap: 'wrap',
    fontSize: 12,
    lineHeight: 18,
  },
  lateMinutesInput: {
    backgroundColor: colors.background,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    minHeight: 38,
    paddingHorizontal: 12,
    textAlign: 'center',
    width: 96,
  },
  lateMinutesLabel: {
    color: colors.text,
    flexWrap: 'wrap',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  lateMinutesText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  lockedCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 102,
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  lockedCardText: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  lockedDay: {
    alignItems: 'center',
    backgroundColor: '#F2F4F6',
    borderRadius: 14,
    gap: 4,
    height: 64,
    justifyContent: 'center',
    width: 42,
  },
  lockedDayComplete: {
    backgroundColor: '#E8F3FF',
  },
  lockedDayLabel: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  lockedDayMark: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  lockedDayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  lockedDayWeekend: {
    color: colors.textMuted,
  },
  lockedInfoCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  lockedInfoText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  lockedInfoTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  lockedMessage: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  lockedPill: {
    backgroundColor: '#E8F3FF',
    borderRadius: radius.pill,
    color: colors.faith,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 6,
    textAlign: 'center',
  },
  lockedSection: {
    gap: 12,
  },
  lockedTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  penaltyCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  penaltyHelp: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  penaltyLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  penaltyValue: {
    color: colors.danger,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.78,
  },
  readOnlyPill: {
    backgroundColor: '#F2F4F6',
    borderRadius: radius.pill,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    minWidth: 62,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
    textAlign: 'center',
  },
  screen: {
    gap: 20,
  },
  sectionHeader: {
    gap: 4,
    marginTop: 20,
  },
  sectionHelp: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  statusMessage: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
  },
  weekCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    gap: 10,
    minHeight: 112,
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  weekActionButton: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  weekActionPrimary: {
    backgroundColor: colors.primary,
  },
  weekActionSecondary: {
    backgroundColor: colors.surface,
    borderColor: '#E5E7EB',
    borderWidth: 1,
  },
  weekActionText: {
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  weekActionTextPrimary: {
    color: colors.surface,
  },
  weekActionTextSecondary: {
    color: colors.text,
  },
  weekChevron: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  weekPolicyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  weekPolicyText: {
    color: colors.faith,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  weekProgress: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  weekRange: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
    textAlign: 'center',
  },
  weekRangeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
});
