import {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {
  FaithLogApiError,
  fetchDevotionMonthlySummary,
  fetchWeeklyDevotionSummary,
  saveDevotionDailyCheck,
} from '../api/client';
import {getApiErrorPresentation} from '../api/errorPolicy';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {
  ApiError,
  DevotionDailyCheck,
  DevotionMonthlySummary,
  WeeklyDevotionSummary,
} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {
  Conflict,
  ErrorState,
  Loading,
  Offline,
  PermissionDenied,
} from '../components/ui';
import {IconexIcon} from '../components/IconexIcon';
import {colors} from '../theme';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type Notice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

type MonthlyCalendarScreenProps = {
  onBackToHome: () => void;
  onOpenWeeklyDevotion: () => void;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
  state: AuthenticatedState;
};

type MonthlyCalendarLoadState =
  | {status: 'idle' | 'loading'}
  | {status: 'success'; monthly: DevotionMonthlySummary; weekly: WeeklyDevotionSummary}
  | {status: 'error'; error: ApiError};

type DailyFormCheck = DevotionDailyCheck & {
  recordDate: string;
};

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;
const DEVOTION_FIELD_LABELS = [
  ['quietTimeChecked', '큐티'],
  ['prayerChecked', '기도'],
  ['bibleReadingChecked', '말씀'],
] as const;
const REQUIRED_DAYS = 5;

export function MonthlyCalendarScreen({
  onBackToHome,
  onOpenWeeklyDevotion,
  setAuthState,
  setNotice,
  state,
}: MonthlyCalendarScreenProps) {
  const [today] = useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => getYearMonth(today));
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(today));
  const selectedWeekStart = useMemo(() => getWeekStartDate(parseDate(selectedDate)), [selectedDate]);
  const [loadState, setLoadState] = useState<MonthlyCalendarLoadState>({status: 'idle'});
  const [formChecks, setFormChecks] = useState<DailyFormCheck[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const campusId = state.selectedCampus.campusId;

  const loadCalendar = async () => {
    setLoadState({status: 'loading'});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const [monthly, weekly] = await Promise.all([
        fetchDevotionMonthlySummary(accessToken, campusId, visibleMonth),
        fetchWeeklyDevotionSummary(accessToken, campusId, selectedWeekStart),
      ]);

      setLoadState({status: 'success', monthly, weekly});
      setFormChecks(normalizeWeekChecks(weekly));
    } catch (error) {
      const apiError = toApiError(error, '월간 경건생활 캘린더를 불러오지 못했습니다.');
      setLoadState({status: 'error', error: apiError});
      handleAuthError(apiError, setAuthState);
    }
  };

  useEffect(() => {
    void loadCalendar();
  }, [campusId, selectedWeekStart, visibleMonth.month, visibleMonth.year]);

  const selectedCheck = formChecks.find((check) => check.recordDate === selectedDate);
  const locked = loadState.status === 'success' && Boolean(loadState.weekly.submittedAt);
  const selectedDateLabel = formatKoreanDate(selectedDate);

  const moveMonth = (direction: -1 | 1) => {
    const nextMonth = shiftYearMonth(visibleMonth, direction);

    setVisibleMonth(nextMonth);
    setSelectedDate(formatLocalDate(new Date(nextMonth.year, nextMonth.month - 1, 1)));
  };

  const toggleCheck = (
    recordDate: string,
    field: 'quietTimeChecked' | 'prayerChecked' | 'bibleReadingChecked',
  ) => {
    if (locked || saving) {
      return;
    }

    setActionError(null);
    setFormChecks((current) =>
      current.map((check) =>
        check.recordDate === recordDate ? {...check, [field]: !check[field]} : check,
      ),
    );
  };

  const saveSelectedDay = async () => {
    if (!selectedCheck || locked || saving) {
      return;
    }

    setSaving(true);
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      await saveDevotionDailyCheck(accessToken, campusId, selectedCheck.recordDate, {
        quietTimeChecked: selectedCheck.quietTimeChecked,
        prayerChecked: selectedCheck.prayerChecked,
        bibleReadingChecked: selectedCheck.bibleReadingChecked,
      });
      setNotice({
        tone: 'success',
        title: '빠른 체크 저장',
        message: `${formatKoreanDate(selectedCheck.recordDate)} 기록을 저장했습니다.`,
      });
      await loadCalendar();
    } catch (error) {
      const apiError = toApiError(error, '빠른 체크를 저장하지 못했습니다.');
      setActionError(apiError);
      handleAuthError(apiError, setAuthState);
    } finally {
      setSaving(false);
    }
  };

  if (loadState.status !== 'success') {
    if (loadState.status === 'error') {
      return <MonthlyCalendarErrorState error={loadState.error} onRetry={loadCalendar} />;
    }

    return <Loading message="월간 경건생활 캘린더를 불러오고 있어요." />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.campusChip}>
          <Text style={styles.campusChipText}>
            {state.selectedCampus.region} {state.selectedCampus.campusName}
          </Text>
        </View>
        <Text style={styles.title}>월간 캘린더</Text>
      </View>

      <View style={styles.monthCard}>
        <Pressable
          accessibilityLabel="이전 달 경건생활 캘린더 보기"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => moveMonth(-1)}>
          <Text style={styles.monthChevron}>〈</Text>
        </Pressable>
        <Text style={styles.monthTitle}>
          {visibleMonth.year}년 {visibleMonth.month}월
        </Text>
        <Pressable
          accessibilityLabel="다음 달 경건생활 캘린더 보기"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => moveMonth(1)}>
          <Text style={styles.monthChevron}>〉</Text>
        </Pressable>
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.weekdayRow}>
          {DAY_LABELS.map((label) => (
            <Text key={label} style={styles.weekdayLabel}>
              {label}
            </Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {getMonthGridCells(visibleMonth.year, visibleMonth.month).map((cell, index) =>
            cell ? (
              <CalendarDay
                date={cell.date}
                day={cell.day}
                key={cell.date}
                monthly={loadState.monthly}
                onPress={() => setSelectedDate(cell.date)}
                selected={cell.date === selectedDate}
                selectedWeekChecks={formChecks}
              />
            ) : (
              <View key={`blank-${index}`} style={styles.calendarBlankCell} />
            ),
          )}
        </View>
        <View style={styles.legendRow}>
          {[0, 1, 2, 3].map((count) => (
            <View key={count} style={styles.legendItem}>
              <View style={[styles.legendSwatch, getCompletionToneStyle(count)]} />
              <Text style={styles.legendText}>{count}개</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{selectedDateLabel} 빠른 체크</Text>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.sectionHelper}>
            선택한 주차를 경건 탭에서 제출할 수 있어요
          </Text>
        </View>
        <Pressable
          accessibilityLabel="주간 경건생활 제출 화면으로 이동"
          accessibilityRole="button"
          onPress={onOpenWeeklyDevotion}
          style={({pressed}) => [styles.weekSubmitButton, pressed ? styles.pressed : null]}>
          <Text style={styles.weekSubmitButtonText}>주간 제출</Text>
        </Pressable>
      </View>

      <View style={styles.quickCard}>
        {selectedCheck ? (
          <>
            <View style={styles.quickActions}>
              {DEVOTION_FIELD_LABELS.map(([field, label]) => (
                <QuickCheckButton
                  checked={selectedCheck[field]}
                  disabled={locked || saving}
                  key={field}
                  label={label}
                  onPress={() => toggleCheck(selectedCheck.recordDate, field)}
                />
              ))}
            </View>
            {locked ? (
              <Text style={styles.lockedText}>제출 완료된 주차라 수정할 수 없어요.</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.lockedText}>선택한 날짜의 주차 기록을 불러오지 못했습니다.</Text>
        )}
      </View>

      {actionError ? <MonthlyCalendarActionError error={actionError} onRetry={loadCalendar} /> : null}

      <View style={styles.saveRow}>
        <Pressable
          accessibilityLabel="월간 캘린더에서 홈으로 이동"
          accessibilityRole="button"
          onPress={onBackToHome}
          style={({pressed}) => [styles.homeTextButton, pressed ? styles.pressed : null]}>
          <Text style={styles.homeTextButtonText}>홈</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="선택한 날짜 빠른 체크 저장"
          accessibilityRole="button"
          accessibilityState={{disabled: locked || saving || !selectedCheck}}
          disabled={locked || saving || !selectedCheck}
          onPress={() => void saveSelectedDay()}
          style={({pressed}) => [
            styles.saveButton,
            locked || saving || !selectedCheck ? styles.disabled : null,
            pressed ? styles.pressed : null,
          ]}>
          <Text style={styles.saveButtonText}>{saving ? '저장 중' : '저장'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CalendarDay({
  date,
  day,
  monthly,
  onPress,
  selected,
  selectedWeekChecks,
}: {
  date: string;
  day: number;
  monthly: DevotionMonthlySummary;
  onPress: () => void;
  selected: boolean;
  selectedWeekChecks: DailyFormCheck[];
}) {
  const selectedWeekCheck = selectedWeekChecks.find((check) => check.recordDate === date);
  const count = selectedWeekCheck
    ? getDailyCompletionCount(selectedWeekCheck)
    : getWeekCompletionCount(monthly, date);

  return (
    <Pressable
      accessibilityLabel={`${day}일 경건 체크 선택`}
      accessibilityRole="button"
      accessibilityState={{selected}}
      onPress={onPress}
      style={({pressed}) => [
        styles.calendarCell,
        getCompletionToneStyle(count),
        selected ? styles.calendarCellSelected : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text style={styles.calendarDayText}>{day}</Text>
    </Pressable>
  );
}

function QuickCheckButton({
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
        styles.quickButton,
        checked ? styles.quickButtonChecked : null,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <View style={styles.quickButtonContent}>
        {checked ? <IconexIcon color={calendarColors.card} name="check" size={14} strokeWidth={2.4} /> : null}
        <Text style={[styles.quickButtonText, checked ? styles.quickButtonTextChecked : null]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function MonthlyCalendarErrorState({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  const presentation = getApiErrorPresentation(error, {
    conflictTitle: '최신 경건 기록 확인이 필요합니다',
    conflictMessage: '서버의 최신 월간 캘린더 상태와 충돌했습니다. 다시 불러와 주세요.',
    permissionTitle: '월간 캘린더 접근 권한이 없습니다',
    permissionMessage: 'ACTIVE 캠퍼스 멤버에게만 월간 캘린더가 열립니다.',
    defaultTitle: '월간 캘린더를 불러오지 못했습니다',
  });

  switch (error.kind) {
    case 'sessionExpired':
    case 'error':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="월간 캘린더 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'permissionDenied':
      return (
        <PermissionDenied
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="월간 캘린더 권한 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="월간 캘린더 충돌 후 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="월간 캘린더 오프라인 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    default:
      return assertNever(error.kind);
  }
}

function MonthlyCalendarActionError({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  if (error.code === 'DEVOTION_WEEKLY_ALREADY_SUBMITTED') {
    return (
      <Conflict
        title="이미 제출된 주차입니다"
        message="서버에서 제출 완료 주차로 응답했습니다. 최신 상태를 다시 불러오면 빠른 체크가 잠깁니다."
        actionLabel="다시 불러오기"
        actionAccessibilityLabel="이미 제출된 주차 다시 불러오기"
        onActionPress={onRetry}
      />
    );
  }

  return <MonthlyCalendarErrorState error={error} onRetry={onRetry} />;
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

function getMonthGridCells(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlankCount = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const cells: Array<{date: string; day: number} | null> = Array.from(
    {length: leadingBlankCount},
    () => null,
  );

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      date: formatLocalDate(new Date(year, month - 1, day)),
      day,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function getDailyCompletionCount(check: DailyFormCheck) {
  return Math.min(
    3,
    Number(check.quietTimeChecked) +
      Number(check.prayerChecked) +
      Number(check.bibleReadingChecked),
  );
}

function getWeekCompletionCount(monthly: DevotionMonthlySummary, date: string) {
  const weekRecord = monthly.weeklyRecords.find((record) =>
    isDateWithin(date, record.weekStartDate, record.weekEndDate),
  );

  if (!weekRecord) {
    return 0;
  }

  return Math.min(
    3,
    Number(weekRecord.quietTimeCount >= REQUIRED_DAYS) +
      Number(weekRecord.prayerCount >= REQUIRED_DAYS) +
      Number(weekRecord.bibleReadingCount >= REQUIRED_DAYS),
  );
}

function getCompletionToneStyle(count: number) {
  if (count >= 3) {
    return styles.completion3;
  }

  if (count === 2) {
    return styles.completion2;
  }

  if (count === 1) {
    return styles.completion1;
  }

  return styles.completion0;
}

function isDateWithin(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function shiftYearMonth(current: {year: number; month: number}, direction: -1 | 1) {
  const date = new Date(current.year, current.month - 1 + direction, 1);

  return getYearMonth(date);
}

function getWeekStartDate(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);

  return formatLocalDate(start);
}

function getYearMonth(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
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

function formatKoreanDate(value: string) {
  const date = parseDate(value);

  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
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

const calendarColors = {
  background: colors.background,
  card: colors.surface,
  chip: colors.borderSoft,
  text: colors.textPrimary,
  muted: colors.textSecondary,
  border: colors.borderSoft,
  button: colors.primary,
  completion0: colors.borderSoft,
  completion1: colors.mint,
  completion2: colors.faith,
  completion3: colors.primary,
};

const styles = StyleSheet.create({
  screen: {
    backgroundColor: calendarColors.background,
    gap: 20,
    marginHorizontal: -24,
    marginTop: -28,
    minHeight: 736,
    paddingHorizontal: 24,
    paddingTop: 30,
  },
  header: {
    alignItems: 'flex-start',
    gap: 10,
  },
  title: {
    color: calendarColors.text,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 34,
  },
  campusChip: {
    alignItems: 'center',
    backgroundColor: calendarColors.chip,
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 86,
  },
  campusChipText: {
    color: calendarColors.muted,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  monthCard: {
    alignItems: 'center',
    backgroundColor: calendarColors.card,
    borderRadius: 22,
    flexDirection: 'row',
    height: 62,
    justifyContent: 'center',
    marginTop: 0,
    shadowColor: calendarColors.text,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  monthChevron: {
    color: calendarColors.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  monthTitle: {
    color: calendarColors.text,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    minWidth: 150,
    textAlign: 'center',
  },
  calendarCard: {
    backgroundColor: calendarColors.card,
    borderRadius: 22,
    gap: 14,
    minHeight: 280,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 16,
    shadowColor: calendarColors.text,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekdayLabel: {
    color: calendarColors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  calendarCell: {
    alignItems: 'center',
    borderRadius: 8,
    height: 26,
    justifyContent: 'center',
    width: 30,
  },
  calendarBlankCell: {
    height: 26,
    width: 30,
  },
  calendarCellSelected: {
    borderColor: calendarColors.text,
    borderWidth: 1,
  },
  calendarDayText: {
    color: calendarColors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  completion0: {
    backgroundColor: calendarColors.completion0,
  },
  completion1: {
    backgroundColor: calendarColors.completion1,
  },
  completion2: {
    backgroundColor: calendarColors.completion2,
  },
  completion3: {
    backgroundColor: calendarColors.completion3,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  legendSwatch: {
    borderRadius: 4,
    height: 14,
    width: 14,
  },
  legendText: {
    color: calendarColors.muted,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  sectionTitle: {
    color: calendarColors.text,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 16,
  },
  sectionHeaderText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  sectionHelper: {
    color: calendarColors.muted,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  weekSubmitButton: {
    alignItems: 'center',
    backgroundColor: calendarColors.chip,
    borderRadius: 12,
    flexShrink: 0,
    height: 34,
    justifyContent: 'center',
    width: 82,
  },
  weekSubmitButtonText: {
    color: calendarColors.button,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  quickCard: {
    backgroundColor: calendarColors.card,
    borderRadius: 22,
    justifyContent: 'center',
    minHeight: 112,
    paddingHorizontal: 24,
    shadowColor: calendarColors.text,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  quickButton: {
    alignItems: 'center',
    backgroundColor: calendarColors.card,
    borderColor: calendarColors.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    height: 52,
    justifyContent: 'center',
    minWidth: 0,
  },
  quickButtonChecked: {
    backgroundColor: calendarColors.button,
    borderColor: calendarColors.button,
  },
  quickButtonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minWidth: 0,
  },
  quickButtonText: {
    color: calendarColors.text,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  quickButtonTextChecked: {
    color: calendarColors.card,
  },
  lockedText: {
    color: calendarColors.muted,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 10,
  },
  saveRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
    paddingBottom: 8,
  },
  homeTextButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    minWidth: 44,
  },
  homeTextButtonText: {
    color: calendarColors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: calendarColors.button,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 62,
  },
  saveButtonText: {
    color: calendarColors.card,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  disabled: {
    opacity: 0.52,
  },
  pressed: {
    opacity: 0.78,
  },
});
