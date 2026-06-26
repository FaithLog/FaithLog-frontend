import {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';

import {
  FaithLogApiError,
  fetchDevotionMonthlySummary,
  fetchWeeklyDevotionSummary,
  saveDevotionDailyCheck,
  saveWeeklyDevotion,
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
  Body,
  Button,
  Card,
  Chip,
  Conflict,
  Empty,
  ErrorState,
  Eyebrow,
  ListRow,
  Loading,
  Offline,
  PermissionDenied,
  Title,
} from '../components/ui';
import {IconexIcon} from '../components/IconexIcon';
import {colors, radius, spacing} from '../theme';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type Notice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

type DevotionScreenProps = {
  onBackToHome: () => void;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
  state: AuthenticatedState;
};

type DevotionLoadState =
  | {status: 'idle' | 'loading'}
  | {status: 'success'; weekly: WeeklyDevotionSummary; monthly: DevotionMonthlySummary}
  | {status: 'error'; error: ApiError};

type DailyFormCheck = DevotionDailyCheck & {
  recordDate: string;
};

type SavingAction = 'daily' | 'draft' | 'submit' | null;

const REQUIRED_DAYS = 5;
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;
const DEVOTION_FIELD_LABELS = [
  ['quietTimeChecked', '큐티'],
  ['prayerChecked', '기도'],
  ['bibleReadingChecked', '말씀'],
] as const;

export function DevotionScreen({onBackToHome, setAuthState, setNotice, state}: DevotionScreenProps) {
  const [today, setToday] = useState(() => new Date());
  const initialMonth = useMemo(() => getYearMonth(today), [today]);
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
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

      const [weekly, monthly] = await Promise.all([
        fetchWeeklyDevotionSummary(accessToken, campusId, selectedWeekStart),
        fetchDevotionMonthlySummary(accessToken, campusId, visibleMonth),
      ]);
      setLoadState({status: 'success', weekly, monthly});
      setFormChecks(normalizeWeekChecks(weekly));
      setLateMinutesText(String(Math.max(0, weekly.saturdayLateMinutes)));
      setSubmitComplete(Boolean(weekly.submittedAt));
    } catch (error) {
      const apiError = toApiError(error, '경건생활 기록을 불러오지 못했습니다.');
      setLoadState({status: 'error', error: apiError});
      handleAuthError(apiError, setAuthState);
    }
  };

  useEffect(() => {
    setToday(new Date());
  }, []);

  useEffect(() => {
    void loadDevotion();
  }, [campusId, selectedWeekStart, visibleMonth.month, visibleMonth.year]);

  const loadedWeekly = loadState.status === 'success' ? loadState.weekly : null;
  const locked = Boolean(loadedWeekly?.submittedAt);
  const selectedCheck = formChecks.find((check) => check.recordDate === selectedDate);
  const lateMinutes = parseLateMinutes(lateMinutesText);
  const missingSummary = getMissingSummary(formChecks, lateMinutes ?? 0);
  const invalidLateMinutes = lateMinutes === null;
  const selectedDateInCurrentWeek = formChecks.some((check) => check.recordDate === selectedDate);

  const moveMonth = (direction: -1 | 1) => {
    setVisibleMonth((current) => shiftYearMonth(current, direction));
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
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

  const saveSelectedDay = async () => {
    if (!selectedCheck || locked || savingAction) {
      return;
    }

    setSavingAction('daily');
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
        title: '하루 체크 저장',
        message: `${formatShortDate(selectedCheck.recordDate)} 기록을 저장했습니다.`,
      });
      await loadDevotion();
    } catch (error) {
      const apiError = toApiError(error, '하루 체크를 저장하지 못했습니다.');
      setActionError(apiError);
      handleAuthError(apiError, setAuthState);
    } finally {
      setSavingAction(null);
    }
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
      setLoadState((current) =>
        current.status === 'success' ? {...current, weekly: nextWeekly} : current,
      );
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
      return (
        <DevotionErrorState
          error={loadState.error}
          onRetry={loadDevotion}
        />
      );
    }

    return <Loading message="경건생활 주간 기록과 월간 통계를 불러오고 있어요." />;
  }

  const weekly = loadState.weekly;
  const monthly = loadState.monthly;

  return (
    <>
      <Card>
        <Eyebrow>월간 기록</Eyebrow>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Chip label={`${state.selectedCampus.region} ${state.selectedCampus.campusName}`} tone="info" />
            <Title>월간 캘린더</Title>
            <Body>주차별 제출 여부와 이번 달 경건생활 요약을 확인합니다.</Body>
          </View>
          <Button
            accessibilityLabel="경건생활에서 홈으로 이동"
            onPress={onBackToHome}
            variant="ghost">
            홈
          </Button>
        </View>
        <View style={styles.monthControls}>
          <Button
            accessibilityLabel="이전 달 경건생활 보기"
            onPress={() => moveMonth(-1)}
            variant="secondary">
            이전
          </Button>
          <Text style={styles.monthTitle}>{visibleMonth.year}년 {visibleMonth.month}월</Text>
          <Button
            accessibilityLabel="다음 달 경건생활 보기"
            onPress={() => moveMonth(1)}
            variant="secondary">
            다음
          </Button>
        </View>
        {monthly.weeklyRecords.length === 0 ? (
          <Empty
            title="월간 기록이 없습니다"
            message="아직 이 달에 조회된 주간 경건 기록이 없습니다."
          />
        ) : (
          <MonthCalendar
            monthly={monthly}
            onSelectDate={selectDate}
            selectedDate={selectedDate}
            visibleMonth={visibleMonth}
          />
        )}
        <View style={styles.metaGrid}>
          <ListRow
            label="큐티"
            supportingText="월간 합계"
            value={`${monthly.devotion.quietTimeCount}회`}
          />
          <ListRow
            label="기도"
            supportingText="월간 합계"
            value={`${monthly.devotion.prayerCount}회`}
          />
          <ListRow
            label="말씀"
            supportingText="월간 합계"
            value={`${monthly.devotion.bibleReadingCount}회`}
          />
        </View>
      </Card>

      <Card>
        <Eyebrow>주간 기록</Eyebrow>
        <Title>경건생활</Title>
        <Body>
          {formatShortDate(weekly.weekStartDate)} - {formatShortDate(weekly.weekEndDate)} 주차입니다.
        </Body>
        <View style={styles.weekSummary}>
          <Chip label="벌금 기준 5일" tone="info" />
          <Chip
            label={locked ? '제출 완료' : '제출 전'}
            tone={locked ? 'success' : 'warning'}
          />
        </View>
        <Body>
          현재 큐티 {weekly.quietTimeCount}/{REQUIRED_DAYS} · 기도 {weekly.prayerCount}/{REQUIRED_DAYS} · 말씀 {weekly.bibleReadingCount}/{REQUIRED_DAYS}
        </Body>
      </Card>

      {locked ? (
        <Conflict
          title="제출 완료된 주차입니다"
          message="제출 후에는 하루 기록과 주간 저장을 수정할 수 없습니다. 수정이 필요하면 관리자에게 문의해 주세요."
        />
      ) : null}

      {actionError ? <DevotionActionError error={actionError} onRetry={loadDevotion} /> : null}

      {submitComplete || locked ? (
        <Card>
          <Eyebrow>제출 상태</Eyebrow>
          <Title>{locked ? '제출이 완료됐어요' : '제출 처리 완료'}</Title>
          <Body>제출 완료 후에는 이 주차 입력을 잠급니다.</Body>
        </Card>
      ) : null}

      {savingAction === 'submit' ? (
        <Card>
          <Eyebrow>제출 상태</Eyebrow>
          <Title>제출 처리 중</Title>
          <Body>주간 기록을 제출하고 있어요. 완료 전까지 화면을 닫지 말아 주세요.</Body>
        </Card>
      ) : null}

      <Card>
        <Eyebrow>7일 기록</Eyebrow>
        <Title>한 주 입력</Title>
        <Body>각 날짜의 큐티, 기도, 말씀을 체크하고 하루 저장 또는 주간 저장을 할 수 있어요.</Body>
        <View style={styles.dayList}>
          {formChecks.map((check, index) => (
            <DayCheckRow
              check={check}
              disabled={locked || Boolean(savingAction)}
              key={check.recordDate}
              label={DAY_LABELS[index] ?? ''}
              onToggle={toggleCheck}
              selected={check.recordDate === selectedDate}
              onSelect={() => selectDate(check.recordDate)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Eyebrow>빠른 체크</Eyebrow>
        <Title>{formatShortDate(selectedDate)} 기록</Title>
        {selectedDateInCurrentWeek && selectedCheck ? (
          <>
            <Body>캘린더나 주간 목록에서 선택한 날짜를 하루 단위로 저장합니다.</Body>
            <View style={styles.quickActions}>
              {DEVOTION_FIELD_LABELS.map(([field, label]) => (
                <CheckPill
                  checked={selectedCheck[field]}
                  disabled={locked || Boolean(savingAction)}
                  key={field}
                  label={label}
                  onPress={() => toggleCheck(selectedCheck.recordDate, field)}
                />
              ))}
            </View>
            <Button
              accessibilityLabel="선택한 날짜 하루 체크 저장"
              disabled={locked || Boolean(savingAction)}
              onPress={saveSelectedDay}
              variant="secondary">
              {savingAction === 'daily' ? '저장 중...' : '하루 저장'}
            </Button>
          </>
        ) : (
          <Body>현재 선택한 날짜는 표시 중인 주차 밖입니다. 주간 목록에서 날짜를 선택해 주세요.</Body>
        )}
      </Card>

      <Card>
        <Eyebrow>제출 전 확인</Eyebrow>
        <Title>제출 전 확인</Title>
        <Body>벌금 금액은 서버의 벌금 규칙과 계좌 설정을 기준으로 제출 시 확정됩니다.</Body>
        <View style={styles.lateMinutesRow}>
          <View style={styles.lateMinutesText}>
            <Text style={styles.lateMinutesLabel}>토요 목자 모임 지각</Text>
            <Text style={styles.lateMinutesHelp}>0 이상 정수만 입력합니다.</Text>
          </View>
          <TextInput
            accessibilityLabel="토요 목자 모임 지각 분 입력"
            editable={!locked && !savingAction}
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
          <Text style={styles.fieldError}>saturdayLateMinutes는 0 이상이어야 합니다.</Text>
        ) : null}
        <View style={styles.metaGrid}>
          <ListRow label="기준 미달 항목" supportingText="5일 기준" value={`${missingSummary.missingTypes}개`} />
          <ListRow label="부족 체크 합계" supportingText="큐티/기도/말씀 부족분" value={`${missingSummary.missingCount}회`} />
          <ListRow label="지각 분" supportingText="별도 벌금 항목" value={`${lateMinutes ?? 0}분`} />
        </View>
        <View style={styles.actionRow}>
          <Button
            accessibilityLabel="경건생활 주간 임시저장"
            disabled={locked || Boolean(savingAction) || invalidLateMinutes}
            onPress={() => void saveWeek(false)}
            variant="secondary">
            {savingAction === 'draft' ? '저장 중...' : '임시저장'}
          </Button>
          <Button
            accessibilityLabel="경건생활 주간 제출"
            disabled={locked || Boolean(savingAction) || invalidLateMinutes}
            onPress={() => void saveWeek(true)}>
            {savingAction === 'submit' ? '제출 중...' : '제출하기'}
          </Button>
        </View>
      </Card>
    </>
  );
}

function MonthCalendar({
  monthly,
  onSelectDate,
  selectedDate,
  visibleMonth,
}: {
  monthly: DevotionMonthlySummary;
  onSelectDate: (date: string) => void;
  selectedDate: string;
  visibleMonth: {year: number; month: number};
}) {
  const cells = getMonthCells(visibleMonth.year, visibleMonth.month);

  return (
    <View style={styles.calendar}>
      <View style={styles.weekdayRow}>
        {DAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>{label}</Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {cells.map((cell) => {
          const weekRecord = monthly.weeklyRecords.find((record) =>
            isDateWithin(cell.date, record.weekStartDate, record.weekEndDate),
          );
          const activeMonth = cell.month === visibleMonth.month;
          const selected = cell.date === selectedDate;
          const completeCount = weekRecord
            ? Math.min(
                3,
                Number(weekRecord.quietTimeCount >= REQUIRED_DAYS) +
                  Number(weekRecord.prayerCount >= REQUIRED_DAYS) +
                  Number(weekRecord.bibleReadingCount >= REQUIRED_DAYS),
              )
            : 0;

          return (
            <Pressable
              accessibilityLabel={`${cell.day}일 경건 주차 선택`}
              accessibilityRole="button"
              key={cell.date}
              onPress={() => onSelectDate(cell.date)}
              style={[
                styles.calendarCell,
                !activeMonth ? styles.calendarCellMuted : null,
                selected ? styles.calendarCellSelected : null,
              ]}>
              <Text style={[styles.calendarDay, selected ? styles.calendarDaySelected : null]}>
                {cell.day}
              </Text>
              <Text style={styles.calendarCount}>
                {weekRecord?.submittedAt ? '제출' : `${completeCount}개`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DayCheckRow({
  check,
  disabled,
  label,
  onSelect,
  onToggle,
  selected,
}: {
  check: DailyFormCheck;
  disabled: boolean;
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
      onPress={onSelect}
      style={[styles.dayRow, selected ? styles.dayRowSelected : null]}>
      <View style={styles.dayMeta}>
        <Text style={[styles.dayLabel, selected ? styles.dayLabelSelected : null]}>{label}</Text>
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
      <View style={styles.checkPillContent}>
        {checked ? <IconexIcon color={colors.surface} name="check" size={14} strokeWidth={2.4} /> : null}
        <Text style={[styles.checkPillText, checked ? styles.checkPillTextChecked : null]}>
          {label}
        </Text>
      </View>
    </Pressable>
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

function getMonthCells(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  const start = new Date(firstDay);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);

  return Array.from({length: 42}, (_, index) => {
    const date = addDays(start, index);

    return {
      date: formatLocalDate(date),
      day: date.getDate(),
      month: date.getMonth() + 1,
    };
  });
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

function formatShortDate(value: string) {
  const date = parseDate(value);

  return `${date.getMonth() + 1}/${date.getDate()}`;
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
    gap: 10,
    marginTop: 6,
  },
  calendar: {
    gap: 10,
  },
  calendarCell: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
    minHeight: 48,
    justifyContent: 'center',
    width: '13.1%',
  },
  calendarCellMuted: {
    opacity: 0.4,
  },
  calendarCellSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  calendarCount: {
    color: colors.mutedText,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  calendarDay: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  calendarDaySelected: {
    color: colors.primary,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  checkPill: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 62,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  checkPillChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkPillContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minWidth: 0,
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
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  checkPillTextChecked: {
    color: colors.surface,
  },
  dayDate: {
    color: colors.mutedText,
    fontSize: 15,
  },
  dayLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  dayLabelSelected: {
    color: colors.teal,
  },
  dayList: {
    gap: 10,
  },
  dayMeta: {
    minWidth: 54,
  },
  dayRow: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.item,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.gap,
    padding: 12,
  },
  dayRowSelected: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.teal,
  },
  disabled: {
    opacity: 0.45,
  },
  fieldError: {
    color: colors.danger,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '700',
  },
  headerRow: {
    alignItems: 'flex-start',
    gap: spacing.gap,
  },
  headerText: {
    gap: spacing.gap,
  },
  inputError: {
    borderColor: colors.danger,
  },
  lateMinutesHelp: {
    color: colors.mutedText,
    flexWrap: 'wrap',
    fontSize: 15,
  },
  lateMinutesInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    minHeight: 44,
    paddingHorizontal: 12,
    textAlign: 'center',
    width: 72,
  },
  lateMinutesLabel: {
    color: colors.text,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '600',
  },
  lateMinutesRow: {
    alignItems: 'center',
    backgroundColor: colors.tealSoft,
    borderColor: colors.border,
    borderRadius: radius.item,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.gap,
    padding: 14,
  },
  lateMinutesText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  metaGrid: {
    gap: 8,
  },
  monthControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  monthTitle: {
    color: colors.text,
    flex: 1,
    flexWrap: 'wrap',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weekdayLabel: {
    color: colors.mutedText,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 5,
  },
  weekSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
