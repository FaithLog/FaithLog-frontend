import type {DevotionDailyCheck, PenaltyRule, PenaltyRuleType, WeeklyDevotionSummary} from '../api/types';

export type DevotionCheckField =
  | 'quietTimeChecked'
  | 'prayerChecked'
  | 'bibleReadingChecked';

export type DailyCompletionCount = 0 | 1 | 2 | 3;

export type DevotionPenaltySummary = {
  missingTypes: number;
  missingCount: number;
  totalEstimatedAmount: number | null;
  amountStatus: 'ready' | 'rulesEmpty' | 'rulesUnavailable';
  rows: Array<{
    key: 'quietTime' | 'prayer' | 'bibleReading' | 'late';
    label: string;
    amount: number | null;
    missingUnits: number;
    recordedCount: number;
    requiredCount: number;
    supportingText: string;
    status: 'clear' | 'attention';
  }>;
};

export type WeeklySubmitGuardState = {
  invalidLateMinutes: boolean;
  locked: boolean;
  saving: boolean;
};

export type WeeklyDevotionEntryState = {
  dailyChecks: WeeklyDevotionSummary['dailyChecks'];
  editable: boolean;
};

const REQUIRED_DAYS = 5;

export function getDailyCompletionCount(
  check: Pick<DevotionDailyCheck, DevotionCheckField>,
): DailyCompletionCount {
  const count =
    Number(check.quietTimeChecked) +
    Number(check.prayerChecked) +
    Number(check.bibleReadingChecked);

  return Math.min(3, Math.max(0, count)) as DailyCompletionCount;
}

export function buildDailyCompletionMap(weeklySummaries: WeeklyDevotionSummary[]) {
  return weeklySummaries.reduce<Record<string, DailyCompletionCount>>((accumulator, weekly) => {
    weekly.dailyChecks.forEach((check) => {
      accumulator[check.recordDate] = getDailyCompletionCount(check);
    });

    return accumulator;
  }, {});
}

export function summarizeDevotionPenalty(
  checks: Array<Pick<DevotionDailyCheck, DevotionCheckField>>,
  lateMinutes: number,
  penaltyRules?: PenaltyRule[] | null,
): DevotionPenaltySummary {
  const counts = checks.reduce(
    (accumulator, check) => ({
      quietTime: accumulator.quietTime + Number(check.quietTimeChecked),
      prayer: accumulator.prayer + Number(check.prayerChecked),
      bibleReading: accumulator.bibleReading + Number(check.bibleReadingChecked),
    }),
    {quietTime: 0, prayer: 0, bibleReading: 0},
  );
  const amountStatus = getPenaltyAmountStatus(penaltyRules);
  const activeRules = penaltyRules?.filter((rule) => rule.isActive) ?? [];
  const quietTime = buildMissingCountPenaltyRow({
    activeRules,
    count: counts.quietTime,
    key: 'quietTime',
    label: '큐티',
    ruleType: 'QUIET_TIME',
  });
  const prayer = buildMissingCountPenaltyRow({
    activeRules,
    count: counts.prayer,
    key: 'prayer',
    label: '기도',
    ruleType: 'PRAYER',
  });
  const bibleReading = buildMissingCountPenaltyRow({
    activeRules,
    count: counts.bibleReading,
    key: 'bibleReading',
    label: '말씀',
    ruleType: 'BIBLE_READING',
  });
  const late = buildLatePenaltyRow(activeRules, lateMinutes);
  const rows = [quietTime, prayer, bibleReading, late];
  const totalEstimatedAmount =
    amountStatus === 'ready'
      ? rows.reduce((sum, row) => sum + (row.amount ?? 0), 0)
      : null;

  return {
    missingTypes: rows.filter((row) => row.status === 'attention').length,
    missingCount: rows
      .filter((row) => row.key !== 'late')
      .reduce((sum, row) => sum + row.missingUnits, 0),
    totalEstimatedAmount,
    amountStatus,
    rows,
  };
}

export function canRequestWeeklySubmit({
  invalidLateMinutes,
  locked,
  saving,
}: WeeklySubmitGuardState) {
  return !locked && !saving && !invalidLateMinutes;
}

export function getWeeklyDevotionEntryState(
  weekly: WeeklyDevotionSummary,
  recordDates: string[],
): WeeklyDevotionEntryState {
  return {
    editable: isWeeklyDevotionEditable(weekly),
    dailyChecks: recordDates.map((recordDate) => {
      const existing = weekly.dailyChecks.find(
        (check) => check.recordDate === recordDate,
      );

      return existing ?? {
        id: null,
        recordDate,
        quietTimeChecked: false,
        prayerChecked: false,
        bibleReadingChecked: false,
      };
    }),
  };
}

export function isWeeklyDevotionEditable(
  weekly: Pick<WeeklyDevotionSummary, 'submittedAt'>,
) {
  return weekly.submittedAt === null;
}

function getPenaltyAmountStatus(penaltyRules: PenaltyRule[] | null | undefined) {
  if (!penaltyRules) {
    return 'rulesUnavailable' as const;
  }

  if (!penaltyRules.some((rule) => rule.isActive)) {
    return 'rulesEmpty' as const;
  }

  return 'ready' as const;
}

function buildMissingCountPenaltyRow({
  activeRules,
  count,
  key,
  label,
  ruleType,
}: {
  activeRules: PenaltyRule[];
  count: number;
  key: 'quietTime' | 'prayer' | 'bibleReading';
  label: string;
  ruleType: PenaltyRuleType;
}) {
  const rules = activeRules.filter(
    (rule) => rule.ruleType === ruleType && rule.calculationType === 'MISSING_COUNT',
  );
  const requiredCount = rules.length
    ? Math.max(...rules.map((rule) => Math.max(0, rule.requiredCount)))
    : REQUIRED_DAYS;
  const missingUnits = Math.max(0, requiredCount - count);
  const amount = rules.length
    ? rules.reduce((sum, rule) => {
        const ruleMissingUnits = Math.max(0, rule.requiredCount - count);

        return sum + calculateRuleAmount(rule, ruleMissingUnits);
      }, 0)
    : 0;

  return {
    key,
    label,
    amount,
    missingUnits,
    recordedCount: count,
    requiredCount,
    supportingText:
      missingUnits > 0
        ? `기준 ${requiredCount}회 · 기록 ${count}회 · 부족 ${missingUnits}회`
        : `기준 ${requiredCount}회 · 기록 ${count}회`,
    status: missingUnits > 0 ? 'attention' as const : 'clear' as const,
  };
}

function buildLatePenaltyRow(activeRules: PenaltyRule[], lateMinutes: number) {
  const rules = activeRules.filter(
    (rule) => rule.ruleType === 'SATURDAY_LATE' && rule.calculationType === 'LATE_MINUTE',
  );
  const safeLateMinutes = Math.max(0, lateMinutes);
  const amount = rules.length
    ? rules.reduce((sum, rule) => sum + calculateRuleAmount(rule, safeLateMinutes), 0)
    : 0;

  return {
    key: 'late' as const,
    label: '토요 지각',
    amount,
    missingUnits: safeLateMinutes,
    recordedCount: safeLateMinutes,
    requiredCount: 0,
    supportingText: safeLateMinutes > 0 ? `${safeLateMinutes}분 지각` : '지각 기록 없음',
    status: safeLateMinutes > 0 ? 'attention' as const : 'clear' as const,
  };
}

function calculateRuleAmount(rule: PenaltyRule, units: number) {
  if (units <= 0) {
    return 0;
  }

  return Math.max(0, rule.baseAmount) + units * Math.max(0, rule.amountPerUnit);
}
