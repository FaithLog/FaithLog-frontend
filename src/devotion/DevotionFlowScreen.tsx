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
import {Conflict, ErrorState, Loading, Offline, PermissionDenied} from '../components/ui';
import {colors, spacing} from '../theme';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type Notice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

type DevotionFlowScreenProps = {
  onBackToHome: () => void;
  onOpenPayments: () => void;
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
type FlowMode = 'calendar' | 'weekly' | 'penalty';
type DevotionField = 'quietTimeChecked' | 'prayerChecked' | 'bibleReadingChecked';

const REQUIRED_DAYS = 5;
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;
const DEVOTION_FIELD_LABELS = [
  ['quietTimeChecked', '큐티'],
  ['prayerChecked', '기도'],
  ['bibleReadingChecked', '말씀'],
] as const;

export function DevotionScreen({
  onBackToHome,
  onOpenPayments,
  setAuthState,
  setNotice,
  state,
}: DevotionFlowScreenProps) {
  const [today] = useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => getYearMonth(today));
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(today));
  const selectedWeekStart = useMemo(() => getWeekStartDate(parseDate(selectedDate)), [selectedDate]);
  const [loadState, setLoadState] = useState<DevotionLoadState>({status: 'idle'});
  const [formChecks, setFormChecks] = useState<DailyFormCheck[]>([]);
  const [lateMinutesText, setLateMinutesText] = useState('0');
  const [savingAction, setSavingAction] = useState<SavingAction>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [flowMode, setFlowMode] = useState<FlowMode>('calendar');
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
    } catch (error) {
      const apiError = toApiError(error, '경건생활 기록을 불러오지 못했습니다.');
      setLoadState({status: 'error', error: apiError});
      handleAuthError(apiError, setAuthState);
    }
  };

  useEffect(() => {
    void loadDevotion();
  }, [campusId, selectedWeekStart, visibleMonth.month, visibleMonth.year]);

  const moveMonth = (direction: -1 | 1) => {
    const nextMonth = shiftYearMonth(visibleMonth, direction);

    setVisibleMonth(nextMonth);
    setSelectedDate(formatLocalDate(new Date(nextMonth.year, nextMonth.month - 1, 1)));
    setFlowMode('calendar');
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setFlowMode('calendar');
  };

  const toggleCheck = (recordDate: string, field: DevotionField) => {
    const locked = loadState.status === 'success' && Boolean(loadState.weekly.submittedAt);

    if (locked || savingAction) {
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
    const selectedCheck = formChecks.find((check) => check.recordDate === selectedDate);
    const locked = loadState.status === 'success' && Boolean(loadState.weekly.submittedAt);

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
        title: '빠른 체크 저장',
        message: `${formatKoreanDate(selectedCheck.recordDate)} 기록을 저장했습니다.`,
      });
      await loadDevotion();
    } catch (error) {
      const apiError = toApiError(error, '빠른 체크를 저장하지 못했습니다.');
      setActionError(apiError);
      handleAuthError(apiError, setAuthState);
    } finally {
      setSavingAction(null);
    }
  };

  const saveWeek = async (submit: boolean) => {
    const locked = loadState.status === 'success' && Boolean(loadState.weekly.submittedAt);
    const lateMinutes = parseLateMinutes(lateMinutesText);

    if (locked || savingAction || lateMinutes === null) {
      return;
    }

    setSavingAction(submit ? 'submit' : 'draft');
    setActionError(null);
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
        saturdayLateMinutes: lateMinutes,
        submit,
      });

      setLoadState((current) =>
        current.status === 'success' ? {...current, weekly: nextWeekly} : current,
      );
      setFormChecks(normalizeWeekChecks(nextWeekly));
      setLateMinutesText(String(Math.max(0, nextWeekly.saturdayLateMinutes)));
      setNotice({
        tone: 'success',
        title: submit ? '경건생활 제출 완료' : '경건생활 임시저장',
        message: submit
          ? '제출 후에는 이 주차 기록을 수정할 수 없습니다.'
          : '주간 기록을 저장했습니다. 제출 전까지 다시 수정할 수 있습니다.',
      });
      await loadDevotion();

      if (submit) {
        setFlowMode('penalty');
      }
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

    return <Loading message="경건생활 캘린더와 주간 기록을 불러오고 있어요." />;
  }

  const {monthly, weekly} = loadState;
  const selectedCheck = formChecks.find((check) => check.recordDate === selectedDate);
  const locked = Boolean(weekly.submittedAt);
  const lateMinutes = parseLateMinutes(lateMinutesText);
  const invalidLateMinutes = lateMinutes === null;
  const missingSummary = getMissingSummary(formChecks, lateMinutes ?? 0);
  const campusLabel = `${state.selectedCampus.region} ${state.selectedCampus.campusName}`;
  const screenTitle =
    flowMode === 'penalty' ? '벌금 결과' : flowMode === 'weekly' ? '경건생활' : '월간 캘린더';

  return (
    <View style={styles.screen}>
      <TopHeader campusLabel={campusLabel} onBackToHome={onBackToHome} title={screenTitle} />

      {actionError ? <DevotionActionError error={actionError} onRetry={loadDevotion} /> : null}

      {flowMode === 'calendar' ? (
        <CalendarFlow
          disabled={locked || Boolean(savingAction) || !selectedCheck}
          formChecks={formChecks}
          monthly={monthly}
          moveMonth={moveMonth}
          onOpenWeekly={() => setFlowMode('weekly')}
          onSaveSelectedDay={() => void saveSelectedDay()}
          onSelectDate={selectDate}
          onToggle={toggleCheck}
          saving={savingAction === 'daily'}
          selectedCheck={selectedCheck}
          selectedDate={selectedDate}
          visibleMonth={visibleMonth}
          weekly={weekly}
        />
      ) : null}

      {flowMode === 'weekly' ? (
        <WeeklyFlow
          formChecks={formChecks}
          invalidLateMinutes={invalidLateMinutes}
          lateMinutesText={lateMinutesText}
          locked={locked}
          missingSummary={missingSummary}
          onBackToCalendar={() => setFlowMode('calendar')}
          onChangeLateMinutes={(value) => {
            setActionError(null);
            setLateMinutesText(value.replace(/[^\d]/g, '').slice(0, 4));
          }}
          onOpenPenalty={() => setFlowMode('penalty')}
          onSaveDraft={() => void saveWeek(false)}
          onSubmit={() => void saveWeek(true)}
          onToggle={toggleCheck}
          savingAction={savingAction}
          weekly={weekly}
        />
      ) : null}

      {flowMode === 'penalty' ? (
        <PenaltyResultFlow
          lateMinutes={lateMinutes ?? 0}
          missingSummary={missingSummary}
          onBackToWeekly={() => setFlowMode('weekly')}
          onOpenPayments={onOpenPayments}
          weekly={weekly}
        />
      ) : null}
    </View>
  );
}

function TopHeader({
  campusLabel,
  onBackToHome,
  title,
}: {
  campusLabel: string;
  onBackToHome: () => void;
  title: string;
}) {
  return (
    <View style={styles.topHeader}>
      <View style={styles.contextRow}>
        <View style={styles.campusChip}>
          <Text style={styles.campusChipText} numberOfLines={1}>
            {campusLabel}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="홈으로 이동"
          accessibilityRole="button"
          onPress={onBackToHome}
          style={({pressed}) => [styles.headerIconButton, pressed ? styles.pressed : null]}>
          <Text style={styles.headerIconText}>H</Text>
        </Pressable>
      </View>
      <Text style={styles.screenTitle}>{title}</Text>
    </View>
  );
}

function CalendarFlow({
  disabled,
  formChecks,
  monthly,
  moveMonth,
  onOpenWeekly,
  onSaveSelectedDay,
  onSelectDate,
  onToggle,
  saving,
  selectedCheck,
  selectedDate,
  visibleMonth,
  weekly,
}: {
  disabled: boolean;
  formChecks: DailyFormCheck[];
  monthly: DevotionMonthlySummary;
  moveMonth: (direction: -1 | 1) => void;
  onOpenWeekly: () => void;
  onSaveSelectedDay: () => void;
  onSelectDate: (date: string) => void;
  onToggle: (recordDate: string, field: DevotionField) => void;
  saving: boolean;
  selectedCheck: DailyFormCheck | undefined;
  selectedDate: string;
  visibleMonth: {year: number; month: number};
  weekly: WeeklyDevotionSummary;
}) {
  return (
    <>
      <View style={styles.monthSelector}>
        <Pressable
          accessibilityLabel="이전 달 경건생활 캘린더 보기"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => moveMonth(-1)}
          style={styles.monthChevronButton}>
          <Text style={styles.monthChevron}>〈</Text>
        </Pressable>
        <Text style={styles.monthTitle}>
          {visibleMonth.year}년 {visibleMonth.month}월
        </Text>
        <Pressable
          accessibilityLabel="다음 달 경건생활 캘린더 보기"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => moveMonth(1)}
          style={styles.monthChevronButton}>
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
                formChecks={formChecks}
                key={cell.date}
                monthly={monthly}
                onPress={() => onSelectDate(cell.date)}
                selected={cell.date === selectedDate}
              />
            ) : (
              <View key={`blank-${index}`} style={styles.calendarBlankCell} />
            ),
          )}
        </View>
        <Legend />
      </View>

      <View style={styles.quickHeader}>
        <View style={styles.quickHeaderText}>
          <Text style={styles.sectionTitle}>{formatKoreanDate(selectedDate)} 빠른 체크</Text>
          <Text style={styles.sectionHelper}>
            {weekly.submittedAt
              ? '제출 완료된 주차라 읽기만 가능합니다.'
              : '하루 체크 후 주간 제출로 이어집니다.'}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="주간 경건생활 제출 화면 열기"
          accessibilityRole="button"
          onPress={onOpenWeekly}
          style={({pressed}) => [styles.entryButton, pressed ? styles.pressed : null]}>
          <Text style={styles.entryButtonText}>주간 제출</Text>
        </Pressable>
      </View>

      <View style={styles.quickCard}>
        <View style={styles.quickActions}>
          {DEVOTION_FIELD_LABELS.map(([field, label]) => (
            <QuickCheckButton
              checked={Boolean(selectedCheck?.[field])}
              disabled={disabled}
              key={field}
              label={label}
              onPress={() => {
                if (selectedCheck) {
                  onToggle(selectedCheck.recordDate, field);
                }
              }}
            />
          ))}
        </View>
        <View style={styles.quickSaveRow}>
          <Pressable
            accessibilityLabel="선택한 날짜 빠른 체크 저장"
            accessibilityRole="button"
            accessibilityState={{disabled}}
            disabled={disabled}
            onPress={onSaveSelectedDay}
            style={({pressed}) => [
              styles.compactSaveButton,
              disabled ? styles.disabled : null,
              pressed ? styles.pressed : null,
            ]}>
            <Text style={styles.compactSaveButtonText}>{saving ? '저장 중' : '저장'}</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

function CalendarDay({
  date,
  day,
  formChecks,
  monthly,
  onPress,
  selected,
}: {
  date: string;
  day: number;
  formChecks: DailyFormCheck[];
  monthly: DevotionMonthlySummary;
  onPress: () => void;
  selected: boolean;
}) {
  const weekCheck = formChecks.find((check) => check.recordDate === date);
  const count = weekCheck ? getDailyCompletionCount(weekCheck) : getWeekCompletionCount(monthly, date);

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
      <Text style={[styles.calendarDayText, selected ? styles.calendarDayTextSelected : null]}>
        {day}
      </Text>
    </Pressable>
  );
}

function Legend() {
  return (
    <View style={styles.legendRow}>
      {[0, 1, 2, 3].map((count) => (
        <View key={count} style={styles.legendItem}>
          <View style={[styles.legendSwatch, getCompletionToneStyle(count)]} />
          <Text style={styles.legendText}>{count}개</Text>
        </View>
      ))}
    </View>
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
      <Text style={[styles.quickButtonText, checked ? styles.quickButtonTextChecked : null]}>
        {checked ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

function WeeklyFlow({
  formChecks,
  invalidLateMinutes,
  lateMinutesText,
  locked,
  missingSummary,
  onBackToCalendar,
  onChangeLateMinutes,
  onOpenPenalty,
  onSaveDraft,
  onSubmit,
  onToggle,
  savingAction,
  weekly,
}: {
  formChecks: DailyFormCheck[];
  invalidLateMinutes: boolean;
  lateMinutesText: string;
  locked: boolean;
  missingSummary: {missingCount: number; missingTypes: number};
  onBackToCalendar: () => void;
  onChangeLateMinutes: (value: string) => void;
  onOpenPenalty: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onToggle: (recordDate: string, field: DevotionField) => void;
  savingAction: SavingAction;
  weekly: WeeklyDevotionSummary;
}) {
  return (
    <>
      <Pressable
        accessibilityLabel="월간 캘린더로 돌아가기"
        accessibilityRole="button"
        onPress={onBackToCalendar}
        style={({pressed}) => [styles.backLink, pressed ? styles.pressed : null]}>
        <Text style={styles.backLinkText}>〈 월간 캘린더</Text>
      </Pressable>

      <View style={styles.weekHeroCard}>
        <View style={styles.weekHeroTitleRow}>
          <View style={styles.weekHeroText}>
            <Text style={styles.weekHeroTitle}>
              {getWeekTitle(weekly.weekStartDate)} {locked ? '제출 완료' : '주간 제출'}
            </Text>
            <Text style={styles.weekHeroDesc}>
              {formatShortDate(weekly.weekStartDate)} - {formatShortDate(weekly.weekEndDate)}
              {locked ? ' 기록이 잠겼습니다.' : ' 기록을 확인하고 제출합니다.'}
            </Text>
          </View>
          <View style={[styles.statusPill, locked ? styles.lockedPill : styles.readyPill]}>
            <Text style={[styles.statusPillText, locked ? styles.lockedPillText : null]}>
              {locked ? '잠김' : '작성'}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>일별 체크</Text>
      <View style={styles.weekdayCheckRow}>
        {formChecks.map((check, index) => (
          <WeekdayCheckPill
            check={check}
            key={check.recordDate}
            label={DAY_LABELS[index] ?? ''}
            locked={locked || Boolean(savingAction)}
            onToggle={onToggle}
          />
        ))}
      </View>

      {locked ? (
        <>
          <InfoRow
            label="제출 시간"
            supportingText={formatSubmittedAt(weekly.submittedAt)}
            value="완료"
          />
          <InfoRow
            label="수정 제한"
            supportingText="제출 후에는 이 주차 기록을 수정할 수 없습니다."
            value="읽기"
          />
          <Pressable
            accessibilityLabel="경건생활 벌금 결과 보기"
            accessibilityRole="button"
            onPress={onOpenPenalty}
            style={({pressed}) => [styles.primaryWideButton, pressed ? styles.pressed : null]}>
            <Text style={styles.primaryWideButtonText}>벌금 결과 보기</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.weekSubmitCard}>
          <Text style={styles.weekSubmitTitle}>제출 전 확인</Text>
          <Text style={styles.weekSubmitBody}>
            기준 미달 {missingSummary.missingTypes}개 · 부족 체크 {missingSummary.missingCount}
            회를 확인했습니다.
          </Text>
          <View style={styles.lateMinutesRow}>
            <View style={styles.lateMinutesText}>
              <Text style={styles.lateMinutesLabel}>토요 목자 모임 지각</Text>
              <Text style={styles.lateMinutesHelp}>0 이상 정수만 입력합니다.</Text>
            </View>
            <TextInput
              accessibilityLabel="토요 목자 모임 지각 분 입력"
              editable={!savingAction}
              keyboardType="number-pad"
              onChangeText={onChangeLateMinutes}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={[styles.lateMinutesInput, invalidLateMinutes ? styles.inputError : null]}
              value={lateMinutesText}
            />
          </View>
          {invalidLateMinutes ? (
            <Text style={styles.fieldError}>지각 분은 0 이상이어야 합니다.</Text>
          ) : null}
          <View style={styles.actionRow}>
            <Pressable
              accessibilityLabel="경건생활 주간 임시저장"
              accessibilityRole="button"
              accessibilityState={{disabled: Boolean(savingAction) || invalidLateMinutes}}
              disabled={Boolean(savingAction) || invalidLateMinutes}
              onPress={onSaveDraft}
              style={({pressed}) => [
                styles.secondaryButton,
                Boolean(savingAction) || invalidLateMinutes ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={styles.secondaryButtonText}>
                {savingAction === 'draft' ? '저장 중' : '임시저장'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="경건생활 주간 제출"
              accessibilityRole="button"
              accessibilityState={{disabled: Boolean(savingAction) || invalidLateMinutes}}
              disabled={Boolean(savingAction) || invalidLateMinutes}
              onPress={onSubmit}
              style={({pressed}) => [
                styles.primaryButton,
                Boolean(savingAction) || invalidLateMinutes ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={styles.primaryButtonText}>
                {savingAction === 'submit' ? '제출 중' : '제출하기'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  );
}

function WeekdayCheckPill({
  check,
  label,
  locked,
  onToggle,
}: {
  check: DailyFormCheck;
  label: string;
  locked: boolean;
  onToggle: (recordDate: string, field: DevotionField) => void;
}) {
  const completed = getDailyCompletionCount(check);

  return (
    <View style={[styles.weekdayCheckPill, completed >= 3 ? styles.weekdayCheckPillComplete : null]}>
      <Text style={styles.weekdayCheckLabel}>{label}</Text>
      <Text style={styles.weekdayCheckCount}>{completed}/3</Text>
      <View style={styles.weekdayDots}>
        {DEVOTION_FIELD_LABELS.map(([field, labelText]) => (
          <Pressable
            accessibilityLabel={`${label}요일 ${labelText} ${check[field] ? '체크 해제' : '체크'}`}
            accessibilityRole="checkbox"
            accessibilityState={{checked: check[field], disabled: locked}}
            disabled={locked}
            hitSlop={6}
            key={field}
            onPress={() => onToggle(check.recordDate, field)}
            style={({pressed}) => [
              styles.weekdayDot,
              check[field] ? styles.weekdayDotChecked : null,
              locked ? styles.weekdayDotLocked : null,
              pressed ? styles.pressed : null,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function InfoRow({
  label,
  supportingText,
  value,
}: {
  label: string;
  supportingText: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRowText}>
        <Text style={styles.infoRowLabel}>{label}</Text>
        <Text style={styles.infoRowSupporting}>{supportingText}</Text>
      </View>
      <View style={styles.infoRowPill}>
        <Text style={styles.infoRowPillText}>{value}</Text>
      </View>
    </View>
  );
}

function PenaltyResultFlow({
  lateMinutes,
  missingSummary,
  onBackToWeekly,
  onOpenPayments,
  weekly,
}: {
  lateMinutes: number;
  missingSummary: {missingCount: number; missingTypes: number};
  onBackToWeekly: () => void;
  onOpenPayments: () => void;
  weekly: WeeklyDevotionSummary;
}) {
  const counts = getDevotionCounts(weekly.dailyChecks);
  const deficits = [
    {
      label: '큐티',
      supportingText: `${counts.quietTime}/${REQUIRED_DAYS}일 완료`,
      value: getPenaltyValueLabel(REQUIRED_DAYS - counts.quietTime),
    },
    {
      label: '기도',
      supportingText: `${counts.prayer}/${REQUIRED_DAYS}일 완료`,
      value: getPenaltyValueLabel(REQUIRED_DAYS - counts.prayer),
    },
    {
      label: '말씀',
      supportingText: `${counts.bibleReading}/${REQUIRED_DAYS}일 완료`,
      value: getPenaltyValueLabel(REQUIRED_DAYS - counts.bibleReading),
    },
    {
      label: '토요 지각',
      supportingText: `${lateMinutes}분 입력`,
      value: lateMinutes > 0 ? '청구 확인' : '0원',
    },
  ];

  return (
    <>
      <Pressable
        accessibilityLabel="주간 제출 상태로 돌아가기"
        accessibilityRole="button"
        onPress={onBackToWeekly}
        style={({pressed}) => [styles.backLink, pressed ? styles.pressed : null]}>
        <Text style={styles.backLinkText}>〈 주간 제출</Text>
      </Pressable>

      <View style={styles.penaltyHeroCard}>
        <View style={styles.weekHeroTitleRow}>
          <View style={styles.weekHeroText}>
            <Text style={styles.weekHeroTitle}>
              {missingSummary.missingTypes > 0 ? '이번 주 벌금 확인' : '이번 주 벌금 없음'}
            </Text>
            <Text style={styles.weekHeroDesc}>
              실제 금액은 서버 청구가 생성된 뒤 납부 탭에서 확인합니다.
            </Text>
          </View>
          <View style={styles.chargePill}>
            <Text style={styles.chargePillText}>
              {missingSummary.missingTypes > 0 ? '청구' : '완료'}
            </Text>
          </View>
        </View>
      </View>

      {deficits.map((item) => (
        <InfoRow
          key={item.label}
          label={item.label}
          supportingText={item.supportingText}
          value={item.value}
        />
      ))}

      <Pressable
        accessibilityLabel="납부 탭에서 청구 상세 보기"
        accessibilityRole="button"
        onPress={onOpenPayments}
        style={({pressed}) => [styles.primaryWideButton, pressed ? styles.pressed : null]}>
        <Text style={styles.primaryWideButtonText}>청구 상세 보기</Text>
      </Pressable>
    </>
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
    case 'error':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="경건생활 오류 후 다시 시도"
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
  const counts = getDevotionCounts(checks);
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

function getDevotionCounts(checks: Array<Pick<DevotionDailyCheck, 'quietTimeChecked' | 'prayerChecked' | 'bibleReadingChecked'>>) {
  return checks.reduce(
    (accumulator, check) => ({
      quietTime: accumulator.quietTime + Number(check.quietTimeChecked),
      prayer: accumulator.prayer + Number(check.prayerChecked),
      bibleReading: accumulator.bibleReading + Number(check.bibleReadingChecked),
    }),
    {quietTime: 0, prayer: 0, bibleReading: 0},
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

function getDailyCompletionCount(check: Pick<DailyFormCheck, 'quietTimeChecked' | 'prayerChecked' | 'bibleReadingChecked'>) {
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

function getPenaltyValueLabel(deficit: number) {
  return deficit > 0 ? '청구 확인' : '0원';
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

function formatShortDate(value: string) {
  const date = parseDate(value);

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getWeekTitle(weekStartDate: string) {
  const date = parseDate(weekStartDate);
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstWeekOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const weekNumber = Math.floor((date.getDate() + firstWeekOffset - 1) / 7) + 1;

  return `${date.getMonth() + 1}월 ${weekNumber}주차`;
}

function formatSubmittedAt(value: string | null) {
  if (!value) {
    return '제출 시간이 아직 없습니다.';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '제출 완료';
  }

  return date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  },
  backLink: {
    alignSelf: 'flex-start',
    minHeight: 34,
    justifyContent: 'center',
  },
  backLinkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  calendarBlankCell: {
    height: 26,
    width: 30,
  },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  calendarCell: {
    alignItems: 'center',
    borderRadius: 9,
    height: 26,
    justifyContent: 'center',
    width: 30,
  },
  calendarCellSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  calendarDayText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  calendarDayTextSelected: {
    color: colors.primary,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  campusChip: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 999,
    justifyContent: 'center',
    maxWidth: 220,
    minHeight: 28,
    paddingHorizontal: 10,
  },
  campusChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  chargePill: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 72,
    paddingHorizontal: 14,
  },
  chargePillText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '800',
  },
  compactSaveButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 62,
    paddingHorizontal: 14,
  },
  compactSaveButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '800',
  },
  completion0: {
    backgroundColor: colors.borderSoft,
  },
  completion1: {
    backgroundColor: colors.mint,
  },
  completion2: {
    backgroundColor: colors.faith,
  },
  completion3: {
    backgroundColor: colors.primary,
  },
  contextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  disabled: {
    opacity: 0.45,
  },
  entryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 82,
    paddingHorizontal: 12,
  },
  entryButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '800',
  },
  fieldError: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  headerIconButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerIconText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '800',
  },
  infoRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    flexDirection: 'row',
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  infoRowLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  infoRowPill: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 62,
    paddingHorizontal: 12,
  },
  infoRowPillText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  infoRowSupporting: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 18,
  },
  infoRowText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  inputError: {
    borderColor: colors.danger,
  },
  lateMinutesHelp: {
    color: colors.textMuted,
    fontSize: 14,
  },
  lateMinutesInput: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    height: 44,
    paddingHorizontal: 12,
    textAlign: 'center',
    width: 72,
  },
  lateMinutesLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  lateMinutesRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 16,
    flexDirection: 'row',
    gap: spacing.gap,
    padding: 14,
  },
  lateMinutesText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  legendSwatch: {
    borderRadius: 4,
    height: 14,
    width: 14,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  lockedPill: {
    backgroundColor: colors.borderSoft,
  },
  lockedPillText: {
    color: colors.textSecondary,
  },
  monthChevron: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  monthChevronButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  monthSelector: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    flexDirection: 'row',
    height: 62,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  monthTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  penaltyHeroCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    minHeight: 102,
    padding: 24,
  },
  pressed: {
    opacity: 0.78,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  primaryWideButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 18,
  },
  primaryWideButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  quickButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 14,
    flex: 1,
    height: 52,
    justifyContent: 'center',
    minWidth: 0,
  },
  quickButtonChecked: {
    backgroundColor: colors.primary,
  },
  quickButtonText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  quickButtonTextChecked: {
    color: colors.surface,
  },
  quickCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    gap: 20,
    minHeight: 112,
    padding: 24,
  },
  quickHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  quickHeaderText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  quickSaveRow: {
    alignItems: 'flex-end',
  },
  readyPill: {
    backgroundColor: colors.primary,
  },
  screen: {
    gap: 18,
    paddingBottom: 24,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  sectionHelper: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 18,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  statusPill: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 72,
    paddingHorizontal: 14,
  },
  statusPillText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '800',
  },
  topHeader: {
    gap: 8,
  },
  weekHeroCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    minHeight: 102,
    padding: 24,
  },
  weekHeroDesc: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 20,
  },
  weekHeroText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  weekHeroTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
  },
  weekHeroTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  weekSubmitBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 20,
  },
  weekSubmitCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    gap: 14,
    padding: 20,
  },
  weekSubmitTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  weekdayCheckCount: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  weekdayCheckLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  weekdayCheckPill: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    height: 64,
    justifyContent: 'center',
    width: 42,
  },
  weekdayCheckPillComplete: {
    backgroundColor: colors.borderSoft,
    borderColor: colors.primary,
  },
  weekdayCheckRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekdayDot: {
    backgroundColor: colors.borderSoft,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  weekdayDotChecked: {
    backgroundColor: colors.primary,
  },
  weekdayDotLocked: {
    opacity: 0.85,
  },
  weekdayDots: {
    flexDirection: 'row',
    gap: 3,
  },
  weekdayLabel: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
});
