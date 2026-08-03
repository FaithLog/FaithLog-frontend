import type {YearlyRecap, YearlyRecapCampus} from './yearlyRecapTypes';

export type RecapMetric = {label: string; value: string};
export type YearlyRecapChapter = {
  kind:
    | 'intro'
    | 'devotion'
    | 'consistency'
    | 'prayer'
    | 'campus'
    | 'comment'
    | 'penalty'
    | 'closing';
  eyebrow: string;
  title: string;
  compact?: boolean;
  description?: string;
  metrics?: RecapMetric[];
  lines?: string[];
  summary?: string;
};

const numberFormatter = new Intl.NumberFormat('ko-KR');

export function buildYearlyRecapChapters(recap: YearlyRecap): YearlyRecapChapter[] {
  const introMetrics = buildIntroMetrics(recap);
  const chapters: YearlyRecapChapter[] = [
    {
      kind: 'intro',
      eyebrow: '나의 기록',
      title: `${recap.recapYear}년, 나의 지난 한 해`,
      description: '내가 이어온 경건생활과 FaithLog 기록을 돌아봐요.',
      ...(introMetrics.length > 0 ? {metrics: introMetrics} : {}),
    },
  ];

  if (hasDevotionActivity(recap)) {
    chapters.push({
      kind: 'devotion',
      eyebrow: '내 경건생활',
      title: '내가 이어온 경건생활',
      metrics: [
        metric('큐티한 날', recap.devotion.quietTimeCount, '일'),
        metric('말씀 읽은 날', recap.devotion.bibleReadingCount, '일'),
        metric('기도한 날', recap.devotion.prayerCount, '일'),
      ],
    });
    chapters.push({
      kind: 'consistency',
      eyebrow: '내가 이어온 기록',
      title: '꾸준히 남긴 경건생활',
      metrics: [
        metric('QT·말씀·기도 완료', recap.devotion.allCompletedDayCount, '일'),
        metric('경건생활 제출', recap.devotion.submittedWeekCount, '주'),
        metric('최장 연속 실천', recap.devotion.longestStreakDays, '일'),
        {
          label: '가장 많이 기록한 달',
          value: recap.devotion.mostActiveMonth === 0
            ? '기록 없음'
            : `${recap.devotion.mostActiveMonth}월`,
        },
      ],
    });
  }

  if (
    recap.prayerActivity.submittedWeekCount > 0 ||
    recap.prayerActivity.participatedSeasonCount > 0
  ) {
    chapters.push({
      kind: 'prayer',
      eyebrow: '내 기도 기록',
      title: '내가 이어온 기도 기록',
      description: '기도문 내용은 표시하지 않고, 내 활동 수치만 정리했어요.',
      metrics: [
        metric('기도제목을 제출한 주', recap.prayerActivity.submittedWeekCount, '주'),
        metric('내가 참여한 기도 시즌', recap.prayerActivity.participatedSeasonCount, '회'),
      ],
    });
  }

  if (recap.campusJourney.campuses.length > 0) {
    chapters.push({
      kind: 'campus',
      eyebrow: '나의 캠퍼스 여정',
      title: '내가 함께한 캠퍼스',
      lines: recap.campusJourney.campuses.map((campus) =>
        formatCampusJourney(campus, recap.recapYear)),
    });
  }

  if (recap.commentActivity) {
    chapters.push({
      kind: 'comment',
      eyebrow: '내 댓글 기록',
      title: '내가 작성한 댓글',
      description: '댓글 본문은 담지 않고, 내가 작성한 수만 보여드려요.',
      compact: true,
      metrics: [metric('작성한 댓글', recap.commentActivity.writtenCount, '개')],
    });
  }

  if (recap.penaltySummary) {
    const penalty = recap.penaltySummary;
    const zero = allPenaltyValuesZero(penalty);
    chapters.push({
      kind: 'penalty',
      eyebrow: '내 정산 기록',
      title: '내 경건 벌금 정산',
      description: '확정된 내 정산 수치만 사실대로 정리했어요.',
      compact: zero,
      ...(zero
        ? {summary: '경건 벌금 없음'}
        : {metrics: [
          penaltyMetric('총 경건 벌금', penalty.totalCount, penalty.totalAmount),
          penaltyMetric('납부 완료', penalty.paidCount, penalty.paidAmount),
          penaltyMetric('미납', penalty.unpaidCount, penalty.unpaidAmount),
        ]}),
    });
  }

  chapters.push({
    kind: 'closing',
    eyebrow: '나의 새로운 한 해',
    title: '올해도 나의 기록을 이어가요',
    description: '내 속도로 작은 경건생활 기록을 이어가요.',
  });
  return chapters;
}

export function getYearlyRecapChapterAnnouncement(chapter: YearlyRecapChapter) {
  const metricSummary = chapter.metrics
    ?.slice(0, 3)
    .map((metricItem) => `${metricItem.label} ${metricItem.value}`)
    .join(', ');
  const lineSummary = chapter.lines?.slice(0, 3).join(', ');
  const detail = chapter.summary ?? metricSummary ?? lineSummary;
  return ['내 기록', chapter.title, detail].filter(Boolean).join('. ');
}

export function formatCampusJourney(campus: YearlyRecapCampus, recapYear: number) {
  if (!campus.joinedDuringRecapYear) {
    return `${recapYear}년에도 ${campus.campusName}에서 내 여정을 이어갔어요`;
  }
  const [, month, day] = campus.joinedDate.split('-').map(Number);
  return `${recapYear}년 ${month}월 ${day}일부터 ${campus.campusName}에서 내 여정을 시작했어요`;
}

function metric(label: string, value: number, suffix: string): RecapMetric {
  return {label, value: `${numberFormatter.format(value)}${suffix}`};
}

function penaltyMetric(label: string, count: number, amount: number): RecapMetric {
  return {
    label,
    value: `${numberFormatter.format(count)}건 · ${numberFormatter.format(amount)}원`,
  };
}

function buildIntroMetrics(recap: YearlyRecap) {
  return [
    {label: '큐티한 날', value: recap.devotion.quietTimeCount, suffix: '일'},
    {label: '말씀 읽은 날', value: recap.devotion.bibleReadingCount, suffix: '일'},
    {label: '기도한 날', value: recap.devotion.prayerCount, suffix: '일'},
  ]
    .filter((candidate) => candidate.value > 0)
    .map((candidate) => metric(candidate.label, candidate.value, candidate.suffix));
}

function hasDevotionActivity(recap: YearlyRecap) {
  return Object.values(recap.devotion).some((value) => value > 0);
}

function allPenaltyValuesZero(penalty: NonNullable<YearlyRecap['penaltySummary']>) {
  return Object.values(penalty).every((value) => value === 0);
}
