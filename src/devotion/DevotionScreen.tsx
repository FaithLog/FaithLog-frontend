import {useEffect, useMemo, useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';

import {
  FaithLogApiError,
  fetchPenaltyRules,
  fetchWeeklyDevotionSummary,
  saveWeeklyDevotion,
} from '../api/client';
import {getApiErrorPresentation} from '../api/errorPolicy';
import {clearTokens} from '../api/tokenStorage';
import type {ApiError, DevotionDailyCheck, PenaltyRule, WeeklyDevotionSummary} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {
  Conflict,
  ErrorState,
  FaithLogHeaderIconButton,
  FaithLogHeaderPillButton,
  FaithLogHeaderTopRow,
  Loading,
  Offline,
  PermissionDenied,
} from '../components/ui';
import {IconexIcon} from '../components/IconexIcon';
import {colors, typography} from '../theme';
import {formatWon} from '../utils/money';
import {
  canRequestWeeklySubmit,
  summarizeDevotionPenalty,
  type DevotionCheckField,
  type DevotionPenaltySummary,
} from './devotionUtils';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type DevotionScreenProps = {
  canOpenAdminMode: boolean;
  initialSelectedDate: string | null;
  onBackToHome: () => void;
  onOpenAdminMode: () => void;
  onOpenNotifications: () => void;
  onOpenPayments: () => void;
  setAuthState: (state: AuthGateState) => void;
  state: AuthenticatedState;
};

type DevotionLoadState =
  | {status: 'idle' | 'loading'}
  | {status: 'success'; weekly: WeeklyDevotionSummary}
  | {status: 'error'; error: ApiError};

type PenaltyRuleLoadState =
  | {status: 'idle' | 'loading'}
  | {status: 'success'; rules: PenaltyRule[]}
  | {status: 'error'; error: ApiError};

type DailyFormCheck = DevotionDailyCheck & {
  recordDate: string;
};

type SavingAction = 'draft' | 'submit' | null;
type ScreenMode = 'entry' | 'locked' | 'penalty';

const REQUIRED_DAYS = 5;
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;
const DEVOTION_FIELD_LABELS: Array<[DevotionCheckField, string]> = [
  ['quietTimeChecked', '큐티'],
  ['prayerChecked', '기도'],
  ['bibleReadingChecked', '말씀'],
];

export function DevotionScreen({
  canOpenAdminMode,
  initialSelectedDate,
  onBackToHome,
  onOpenAdminMode,
  onOpenNotifications,
  onOpenPayments,
  setAuthState,
  state,
}: DevotionScreenProps) {
  const [selectedDate, setSelectedDate] = useState(
    () => initialSelectedDate ?? formatLocalDate(new Date()),
  );
  const selectedWeekStart = useMemo(() => getWeekStartDate(parseDate(selectedDate)), [selectedDate]);
  const [loadState, setLoadState] = useState<DevotionLoadState>({status: 'idle'});
  const [penaltyRuleState, setPenaltyRuleState] = useState<PenaltyRuleLoadState>({status: 'idle'});
  const [formChecks, setFormChecks] = useState<DailyFormCheck[]>([]);
  const [lateMinutesText, setLateMinutesText] = useState('0');
  const [savingAction, setSavingAction] = useState<SavingAction>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [screenMode, setScreenMode] = useState<ScreenMode>('entry');
  const [submitConfirmVisible, setSubmitConfirmVisible] = useState(false);
  const campusId = state.selectedCampus.campusId;

  const loadDevotion = async () => {
    setLoadState({status: 'loading'});
    setPenaltyRuleState({status: 'loading'});
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
      setScreenMode(weekly.submittedAt ? 'locked' : 'entry');
      setSaveFeedback(null);
      setSubmitConfirmVisible(false);
      try {
        const rules = await fetchPenaltyRules(accessToken, campusId);

        setPenaltyRuleState({status: 'success', rules});
      } catch (penaltyRuleError) {
        setPenaltyRuleState({
          status: 'error',
          error: toApiError(penaltyRuleError, '벌금 규칙을 불러오지 못했습니다.'),
        });
      }
    } catch (error) {
      const apiError = toApiError(error, '경건생활 기록을 불러오지 못했습니다.');
      setLoadState({status: 'error', error: apiError});
      handleAuthError(apiError, setAuthState);
    }
  };

  useEffect(() => {
    void loadDevotion();
  }, [campusId, selectedWeekStart]);

  useEffect(() => {
    if (initialSelectedDate) {
      setSelectedDate(initialSelectedDate);
    }
  }, [initialSelectedDate]);

  if (loadState.status !== 'success') {
    if (loadState.status === 'error') {
      return <DevotionErrorState error={loadState.error} onRetry={loadDevotion} />;
    }

    return <Loading message="경건생활 주간 기록을 불러오고 있어요." />;
  }

  const weekly = loadState.weekly;
  const lateMinutes = parseLateMinutes(lateMinutesText);
  const invalidLateMinutes = lateMinutes === null;
  const penaltySummary = summarizeDevotionPenalty(
    formChecks,
    lateMinutes ?? 0,
    penaltyRuleState.status === 'success' ? penaltyRuleState.rules : null,
  );
  const counts = getCurrentCounts(formChecks);
  const locked = Boolean(weekly.submittedAt);
  const title = screenMode === 'penalty' ? '벌금 결과' : '경건생활';

  const moveWeek = (direction: -1 | 1) => {
    const nextWeek = addDays(parseDate(selectedWeekStart), direction * 7);

    setSelectedDate(formatLocalDate(nextWeek));
  };

  const toggleCheck = (recordDate: string, field: DevotionCheckField) => {
    if (locked || savingAction) {
      return;
    }

    setActionError(null);
    setSaveFeedback(null);
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
    setSaveFeedback(null);
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

      setLoadState({status: 'success', weekly: nextWeekly});
      setFormChecks(normalizeWeekChecks(nextWeekly));
      setLateMinutesText(String(Math.max(0, nextWeekly.saturdayLateMinutes)));
      setScreenMode(submit ? 'locked' : 'entry');
      setSaveFeedback(submit ? '제출 완료' : '임시저장 완료');
      if (submit) {
        setSubmitConfirmVisible(false);
      }
    } catch (error) {
      if (submit) {
        setSubmitConfirmVisible(false);
      }
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

  const requestSubmitConfirm = () => {
    if (!canRequestWeeklySubmit({invalidLateMinutes, locked, saving: Boolean(savingAction)})) {
      return;
    }

    setActionError(null);
    setSubmitConfirmVisible(true);
  };

  const cancelSubmitConfirm = () => {
    if (savingAction) {
      return;
    }

    setSubmitConfirmVisible(false);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <FaithLogHeaderTopRow
          campusLabel={state.selectedCampus.campusName}
          contextLabel={`${state.user.name}님`}>
          <FaithLogHeaderIconButton
            accessibilityLabel="알림 설정 화면으로 이동"
            badge
            iconName="bell"
            onPress={onOpenNotifications}
          />
          {canOpenAdminMode ? (
            <FaithLogHeaderPillButton
              accessibilityLabel="관리자 영역 선택"
              label="관리자"
              onPress={onOpenAdminMode}
              showChevron
            />
          ) : null}
        </FaithLogHeaderTopRow>
        <Text style={styles.title}>{title}</Text>
      </View>

      {actionError ? <DevotionActionError error={actionError} onRetry={loadDevotion} /> : null}

      {locked && screenMode === 'penalty' ? (
        <PenaltyResultView
          onBackToLocked={() => setScreenMode('locked')}
          onOpenPayments={onOpenPayments}
          penaltySummary={penaltySummary}
        />
      ) : locked ? (
        <LockedView
          formChecks={formChecks}
          moveWeek={moveWeek}
          onBackToHome={onBackToHome}
          onOpenPenalty={() => setScreenMode('penalty')}
          penaltySummary={penaltySummary}
          weekly={weekly}
        />
      ) : (
        <EntryView
          counts={counts}
          formChecks={formChecks}
          invalidLateMinutes={invalidLateMinutes}
          lateMinutesText={lateMinutesText}
          moveWeek={moveWeek}
          onLateMinutesChange={(value) => {
            setActionError(null);
            setLateMinutesText(value.replace(/[^\d]/g, '').slice(0, 4));
          }}
          onSaveWeek={saveWeek}
          onRequestSubmit={requestSubmitConfirm}
          penaltySummary={penaltySummary}
          saveFeedback={saveFeedback}
          savingAction={savingAction}
          selectedWeekStart={selectedWeekStart}
          toggleCheck={toggleCheck}
          weekly={weekly}
        />
      )}

      <SubmitConfirmModal
        estimatedAmountText={getSubmitConfirmAmountText(penaltySummary)}
        onCancel={cancelSubmitConfirm}
        onConfirm={() => void saveWeek(true)}
        submitting={savingAction === 'submit'}
        visible={!locked && submitConfirmVisible}
      />
    </View>
  );
}

function EntryView({
  counts,
  formChecks,
  invalidLateMinutes,
  lateMinutesText,
  moveWeek,
  onLateMinutesChange,
  onRequestSubmit,
  onSaveWeek,
  penaltySummary,
  saveFeedback,
  savingAction,
  selectedWeekStart,
  toggleCheck,
  weekly,
}: {
  counts: ReturnType<typeof getCurrentCounts>;
  formChecks: DailyFormCheck[];
  invalidLateMinutes: boolean;
  lateMinutesText: string;
  moveWeek: (direction: -1 | 1) => void;
  onLateMinutesChange: (value: string) => void;
  onRequestSubmit: () => void;
  onSaveWeek: (submit: boolean) => void;
  penaltySummary: DevotionPenaltySummary;
  saveFeedback: string | null;
  savingAction: SavingAction;
  selectedWeekStart: string;
  toggleCheck: (recordDate: string, field: DevotionCheckField) => void;
  weekly: WeeklyDevotionSummary;
}) {
  return (
    <>
      <View style={styles.weekCard}>
        <View style={styles.weekRangeRow}>
          <Pressable
            accessibilityLabel="이전 주 경건생활 보기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => moveWeek(-1)}>
            <Text style={styles.chevron}>〈</Text>
          </Pressable>
          <Text style={styles.weekRangeText}>
            {formatKoreanRange(selectedWeekStart, weekly.weekEndDate)}
          </Text>
          <Pressable
            accessibilityLabel="다음 주 경건생활 보기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => moveWeek(1)}>
            <Text style={styles.chevron}>〉</Text>
          </Pressable>
        </View>
        <View style={styles.weekRuleRow}>
          <Text style={styles.weekRuleText}>벌금 기준 {REQUIRED_DAYS}일</Text>
          <Text style={styles.weekRuleText}>{REQUIRED_DAYS}일 채우면 벌금 없음</Text>
        </View>
        <Text style={styles.weekSummaryText}>
          현재 큐티 {counts.quietTime}/{REQUIRED_DAYS} · 기도 {counts.prayer}/{REQUIRED_DAYS} · 말씀{' '}
          {counts.bibleReading}/{REQUIRED_DAYS}
        </Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>7일 기록</Text>
        <Text style={styles.sectionDescription}>스크롤해서 한 주 기록을 모두 입력해요</Text>
      </View>

      <View style={styles.dayList}>
        {formChecks.map((check, index) => (
          <DayCheckRow
            check={check}
            disabled={Boolean(savingAction)}
            key={check.recordDate}
            label={DAY_LABELS[index] ?? ''}
            onToggle={toggleCheck}
            weekend={index >= 5}
          />
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>토요 지각</Text>
        <Text style={styles.sectionDescription}>지각한 시간이 있다면 분 단위로 입력해요</Text>
      </View>

      <View style={styles.lateCard}>
        <View style={styles.lateText}>
          <Text style={styles.cardTitle}>지각 시간</Text>
          <Text style={styles.bodyText}>토요 모임 지각 분</Text>
        </View>
        <TextInput
          accessibilityLabel="토요 목자 모임 지각 분 입력"
          keyboardType="number-pad"
          onChangeText={onLateMinutesChange}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          style={[styles.lateInput, invalidLateMinutes ? styles.inputError : null]}
          value={lateMinutesText}
        />
      </View>
      {invalidLateMinutes ? (
        <Text style={styles.fieldError}>지각 시간은 0 이상 정수만 입력할 수 있어요.</Text>
      ) : null}

      <View style={styles.submitCard}>
        <View style={styles.submitSummary}>
          <Text style={styles.bodyText}>벌금 결과</Text>
          <Text style={styles.submitSummaryValue}>
            {getPenaltySummaryAmountText(penaltySummary)}
          </Text>
        </View>
        <Text style={styles.captionText}>{getPenaltySummaryCaption(penaltySummary)}</Text>
        <PenaltyPreviewRows penaltySummary={penaltySummary} />
        {saveFeedback ? (
          <Text accessibilityLiveRegion="polite" style={styles.inlineStatus}>
            {saveFeedback}
          </Text>
        ) : null}
        <View style={styles.actionRow}>
          <Pressable
            accessibilityLabel="경건생활 주간 임시저장"
            accessibilityRole="button"
            accessibilityState={{disabled: Boolean(savingAction) || invalidLateMinutes}}
            disabled={Boolean(savingAction) || invalidLateMinutes}
            onPress={() => onSaveWeek(false)}
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
            onPress={onRequestSubmit}
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
    </>
  );
}

function PenaltyPreviewRows({penaltySummary}: {penaltySummary: DevotionPenaltySummary}) {
  return (
    <View style={styles.penaltyPreviewList}>
      {penaltySummary.rows.map((row) => (
        <View key={row.key} style={styles.penaltyPreviewRow}>
          <View style={styles.penaltyPreviewText}>
            <Text style={styles.penaltyPreviewLabel}>{row.label}</Text>
            <Text style={styles.penaltyPreviewSupporting}>{row.supportingText}</Text>
          </View>
          <Text
            style={[
              styles.penaltyPreviewAmount,
              row.amount && row.amount > 0 ? styles.dangerText : null,
            ]}>
            {getPenaltyRowAmountText(penaltySummary, row)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SubmitConfirmModal({
  estimatedAmountText,
  onCancel,
  onConfirm,
  submitting,
  visible,
}: {
  estimatedAmountText: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={submitting ? undefined : onCancel}
      transparent
      visible={visible}>
      <View style={styles.modalBackdrop}>
        <View
          accessibilityLabel="주간 경건생활 제출 확인"
          accessibilityRole="alert"
          style={styles.modalCard}>
          <Text style={styles.modalTitle}>제출 후에는 수정할 수 없어요</Text>
          <Text style={styles.modalDescription}>
            이번 주 경건생활을 제출하면 체크 기록과 지각 시간이 잠기고, 벌금 계산 기준으로
            사용됩니다.{estimatedAmountText ? ` 예상 벌금은 ${estimatedAmountText}입니다.` : ''}
          </Text>
          <View style={styles.modalActionRow}>
            <Pressable
              accessibilityLabel="주간 경건생활 제출 취소"
              accessibilityRole="button"
              accessibilityState={{disabled: submitting}}
              disabled={submitting}
              onPress={onCancel}
              style={({pressed}) => [
                styles.modalSecondaryButton,
                submitting ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={styles.modalSecondaryButtonText}>다시 확인하기</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="주간 경건생활 제출 확정"
              accessibilityRole="button"
              accessibilityState={{disabled: submitting}}
              disabled={submitting}
              onPress={onConfirm}
              style={({pressed}) => [
                styles.modalPrimaryButton,
                submitting ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={styles.modalPrimaryButtonText}>
                {submitting ? '제출 중' : '제출하기'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LockedView({
  formChecks,
  moveWeek,
  onBackToHome,
  onOpenPenalty,
  penaltySummary,
  weekly,
}: {
  formChecks: DailyFormCheck[];
  moveWeek: (direction: -1 | 1) => void;
  onBackToHome: () => void;
  onOpenPenalty: () => void;
  penaltySummary: DevotionPenaltySummary;
  weekly: WeeklyDevotionSummary;
}) {
  return (
    <>
      <View style={styles.weekCard}>
        <View style={styles.weekRangeRow}>
          <Pressable
            accessibilityLabel="이전 주 경건생활 보기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => moveWeek(-1)}>
            <Text style={styles.chevron}>〈</Text>
          </Pressable>
          <Text style={styles.weekRangeText}>{formatWeekTitle(weekly.weekStartDate)} 제출 완료</Text>
          <Pressable
            accessibilityLabel="다음 주 경건생활 보기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => moveWeek(1)}>
            <Text style={styles.chevron}>〉</Text>
          </Pressable>
        </View>
        <View style={styles.weekRuleRow}>
          <Text style={styles.weekRuleText}>제출 완료</Text>
          <Text style={styles.weekRuleText}>입력 잠김</Text>
        </View>
      </View>

      <View style={styles.lockCard}>
        <View style={styles.lockCardHeader}>
          <Text style={styles.lockTitle}>기록 잠김</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>잠김</Text>
          </View>
        </View>
        <Text style={styles.bodyText}>제출 후에는 이번 주 기록을 수정할 수 없어요.</Text>
      </View>

      <View style={styles.lockedDayStrip}>
        {formChecks.map((check, index) => {
          const complete = isDevotionDayComplete(check);

          return (
            <View key={check.recordDate} style={[styles.lockedDay, complete ? styles.lockedDayDone : null]}>
              <Text style={[styles.lockedDayText, complete ? styles.lockedDayTextDone : null]}>
                {DAY_LABELS[index] ?? ''}
              </Text>
              <Text style={styles.lockedDayCheck}>{complete ? '완료' : '-'}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.infoList}>
        <InfoRow
          label="제출 시간"
          supportingText={weekly.submittedAt ? `${formatSubmittedAt(weekly.submittedAt)} 저장` : '제출 완료'}
          value="완료"
          valueTone="faith"
        />
      </View>

      <View style={styles.submitCard}>
        <View style={styles.submitSummary}>
          <Text style={styles.bodyText}>벌금 결과</Text>
          <Text style={styles.submitSummaryValue}>
            {getPenaltySummaryAmountText(penaltySummary)}
          </Text>
        </View>
        <Text style={styles.captionText}>{getPenaltySummaryCaption(penaltySummary)}</Text>
        <PenaltyPreviewRows penaltySummary={penaltySummary} />
        <View style={styles.actionRow}>
          <Pressable
            accessibilityLabel="홈으로 돌아가기"
            accessibilityRole="button"
            onPress={onBackToHome}
            style={({pressed}) => [styles.secondaryButton, pressed ? styles.pressed : null]}>
            <Text style={styles.secondaryButtonText}>홈으로</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="경건생활 벌금 결과 보기"
            accessibilityRole="button"
            onPress={onOpenPenalty}
            style={({pressed}) => [styles.primaryButton, pressed ? styles.pressed : null]}>
            <Text style={styles.primaryButtonText}>결과 보기</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

function PenaltyResultView({
  onBackToLocked,
  onOpenPayments,
  penaltySummary,
}: {
  onBackToLocked: () => void;
  onOpenPayments: () => void;
  penaltySummary: DevotionPenaltySummary;
}) {
  return (
    <>
      <View style={styles.lockCard}>
        <View style={styles.lockCardHeader}>
          <Text style={styles.lockTitle}>
            {penaltySummary.missingTypes > 0 ? '청구 확인 필요' : '이번 주 기준 충족'}
          </Text>
          <View style={styles.statusPill}>
            <Text style={[styles.statusPillText, penaltySummary.missingTypes > 0 ? styles.dangerText : null]}>
              결과
            </Text>
          </View>
        </View>
        <Text style={styles.bodyText}>
          제출 기준 예상 벌금 {getPenaltyResultAmountText(penaltySummary)}
        </Text>
      </View>

      <View style={styles.infoList}>
        {penaltySummary.rows.map((row) => (
          <InfoRow
            key={row.key}
            label={row.label}
            supportingText={row.supportingText}
            value={getPenaltyRowAmountText(penaltySummary, row)}
            valueTone={row.amount && row.amount > 0 ? 'danger' : 'faith'}
          />
        ))}
      </View>

      <Pressable
        accessibilityLabel="납부 탭에서 청구 상세 보기"
        accessibilityRole="button"
        onPress={onOpenPayments}
        style={({pressed}) => [styles.fullButton, pressed ? styles.pressed : null]}>
        <Text style={styles.primaryButtonText}>청구 상세 보기</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="경건생활 제출 상태로 돌아가기"
        accessibilityRole="button"
        onPress={onBackToLocked}
        style={({pressed}) => [styles.linkButton, pressed ? styles.pressed : null]}>
        <Text style={styles.linkButtonText}>제출 상태 보기</Text>
      </Pressable>
    </>
  );
}

function DayCheckRow({
  check,
  disabled,
  label,
  onToggle,
  weekend,
}: {
  check: DailyFormCheck;
  disabled: boolean;
  label: string;
  onToggle: (recordDate: string, field: DevotionCheckField) => void;
  weekend: boolean;
}) {
  return (
    <View style={[styles.dayRow, weekend ? styles.weekendDayRow : null]}>
      <View style={styles.dayMeta}>
        <Text style={[styles.dayLabel, weekend ? styles.weekendDayLabel : null]}>{label}</Text>
        <Text style={styles.dayDate}>{formatShortDate(check.recordDate)}</Text>
      </View>
      <View style={styles.pillRow}>
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
    </View>
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
        {checked ? <IconexIcon color={colors.surface} name="check" size={12} strokeWidth={2.4} /> : null}
        <Text style={[styles.checkPillText, checked ? styles.checkPillTextChecked : null]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function InfoRow({
  label,
  supportingText,
  value,
  valueTone,
}: {
  label: string;
  supportingText: string;
  value: string;
  valueTone: 'danger' | 'faith' | 'muted';
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoSupporting}>{supportingText}</Text>
      </View>
      <View style={styles.infoPill}>
        <Text
          style={[
            styles.infoPillText,
            valueTone === 'danger' ? styles.dangerText : null,
            valueTone === 'muted' ? styles.mutedText : null,
          ]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function getPenaltySummaryAmountText(penaltySummary: DevotionPenaltySummary) {
  if (penaltySummary.amountStatus !== 'ready') {
    return '규칙 확인 필요';
  }

  return `예상 ${formatWon(penaltySummary.totalEstimatedAmount ?? 0)}`;
}

function getPenaltySummaryCaption(penaltySummary: DevotionPenaltySummary) {
  if (penaltySummary.amountStatus === 'rulesEmpty') {
    return '활성 벌금 규칙을 불러오지 못했어요.';
  }

  if (penaltySummary.amountStatus === 'rulesUnavailable') {
    return '벌금 규칙을 불러오지 못했어요.';
  }

  return penaltySummary.totalEstimatedAmount && penaltySummary.totalEstimatedAmount > 0
    ? '현재 입력값 기준 예상 금액이에요.'
    : '현재 입력값 기준 벌금 없음';
}

function getPenaltyResultAmountText(penaltySummary: DevotionPenaltySummary) {
  if (penaltySummary.amountStatus !== 'ready') {
    return '규칙 확인 필요';
  }

  return formatWon(penaltySummary.totalEstimatedAmount ?? 0);
}

function getPenaltyRowAmountText(
  penaltySummary: DevotionPenaltySummary,
  row: DevotionPenaltySummary['rows'][number],
) {
  if (penaltySummary.amountStatus !== 'ready') {
    return '규칙 확인';
  }

  return formatWon(row.amount ?? 0);
}

function getSubmitConfirmAmountText(penaltySummary: DevotionPenaltySummary) {
  if (penaltySummary.amountStatus !== 'ready') {
    return null;
  }

  return formatWon(penaltySummary.totalEstimatedAmount ?? 0);
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
  return resolveCurrentAccessToken(() => {
    setAuthState({status: 'sessionExpired', message: '저장된 access token이 없습니다.'});
  });
}

function handleAuthError(error: ApiError, setAuthState: (state: AuthGateState) => void) {
  if (error.kind === 'sessionExpired') {
    void clearTokens(error.authSessionGeneration);
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

function getCurrentCounts(checks: DailyFormCheck[]) {
  return checks.reduce(
    (accumulator, check) => ({
      quietTime: accumulator.quietTime + Number(check.quietTimeChecked),
      prayer: accumulator.prayer + Number(check.prayerChecked),
      bibleReading: accumulator.bibleReading + Number(check.bibleReadingChecked),
    }),
    {quietTime: 0, prayer: 0, bibleReading: 0},
  );
}

function isDevotionDayComplete(check: DailyFormCheck) {
  return check.quietTimeChecked && check.prayerChecked && check.bibleReadingChecked;
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

function formatKoreanRange(startValue: string, endValue: string) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);

  return `${start.getMonth() + 1}월 ${start.getDate()}일 - ${end.getMonth() + 1}월 ${end.getDate()}일`;
}

function formatWeekTitle(startValue: string) {
  const start = parseDate(startValue);

  return `${start.getMonth() + 1}월 ${Math.ceil(start.getDate() / 7)}주차`;
}

function formatSubmittedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}.${month}.${day} ${hour}:${minute}`;
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
    marginTop: 10,
  },
  bodyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  campusChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: 30,
    paddingHorizontal: 10,
  },
  campusChipText: {
    color: colors.faith,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    maxWidth: 220,
  },
  captionText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  cardTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  checkPill: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 62,
  },
  checkPillChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkPillContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    minWidth: 0,
  },
  checkPillText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    textAlign: 'center',
  },
  checkPillTextChecked: {
    color: colors.surface,
  },
  chevron: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  dangerText: {
    color: colors.danger,
  },
  dayDate: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  dayLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
  },
  dayList: {
    gap: 10,
  },
  dayMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minWidth: 72,
  },
  dayRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  disabled: {
    opacity: 0.52,
  },
  fieldError: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  fullButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    marginTop: 116,
  },
  header: {
    gap: 14,
  },
  infoLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  infoList: {
    gap: 12,
  },
  infoPill: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  infoPillText: {
    color: colors.faith,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  infoRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  infoSupporting: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  infoText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  inlineStatus: {
    color: colors.faith,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  inputError: {
    borderColor: colors.danger,
  },
  lateCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 76,
    paddingHorizontal: 20,
  },
  lateInput: {
    backgroundColor: colors.background,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    height: 38,
    textAlign: 'center',
    width: 96,
  },
  lateText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  linkButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
  },
  linkButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  lockCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    gap: 14,
    minHeight: 102,
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  lockCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  lockTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  lockedDay: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 14,
    height: 64,
    justifyContent: 'center',
    width: 42,
  },
  lockedDayCheck: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  lockedDayDone: {
    backgroundColor: colors.borderSoft,
  },
  lockedDayStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  lockedDayText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  lockedDayTextDone: {
    color: colors.primary,
  },
  mutedText: {
    color: colors.textMuted,
  },
  penaltyPreviewAmount: {
    color: colors.faith,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'right',
  },
  penaltyPreviewLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  penaltyPreviewList: {
    borderColor: colors.borderSoft,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 10,
  },
  penaltyPreviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 34,
  },
  penaltyPreviewSupporting: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  penaltyPreviewText: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(25, 31, 40, 0.28)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
    maxWidth: 342,
    padding: 20,
    width: '100%',
  },
  modalDescription: {
    ...typography.body,
    color: colors.textSecondary,
  },
  modalPrimaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    flex: 1,
    height: 46,
    justifyContent: 'center',
  },
  modalPrimaryButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  modalSecondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    height: 46,
    justifyContent: 'center',
  },
  modalSecondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  pillRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  pressed: {
    opacity: 0.78,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  screen: {
    backgroundColor: colors.background,
    gap: 20,
    marginHorizontal: -24,
    marginTop: -28,
    minHeight: 736,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 30,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  sectionDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHeader: {
    gap: 4,
    marginTop: 20,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  statusPill: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 72,
  },
  statusPillText: {
    color: colors.faith,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  submitCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  submitSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  submitSummaryValue: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  weekCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    gap: 12,
    minHeight: 112,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  weekendDayLabel: {
    color: colors.faith,
  },
  weekendDayRow: {
    backgroundColor: colors.borderSoft,
    borderColor: colors.mint,
  },
  weekRangeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  weekRangeText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 26,
    textAlign: 'center',
  },
  weekRuleRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  weekRuleText: {
    color: colors.faith,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  weekSummaryText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
