import type {YearlyRecap, YearlyRecapCampus} from './yearlyRecapTypes';

export type RecapMetric = {label: string; value: string};
export type YearlyRecapChapter = {
  kind: 'intro' | 'campus' | 'devotion' | 'consistency' | 'prayer' | 'poll' | 'closing';
  eyebrow: string;
  title: string;
  description?: string;
  metrics?: RecapMetric[];
  lines?: string[];
};

const numberFormatter = new Intl.NumberFormat('ko-KR');

export function buildYearlyRecapChapters(recap: YearlyRecap): YearlyRecapChapter[] {
  const chapters: YearlyRecapChapter[] = [
    {
      kind: 'intro',
      eyebrow: 'YEAR IN FAITH',
      title: `${recap.recapYear}년, FaithLog와 함께한 기록`,
      description: '한 해 동안 차곡차곡 쌓인 믿음의 발걸음을 돌아봐요.',
    },
  ];

  if (recap.campusJourney.campuses.length > 0) {
    chapters.push({
      kind: 'campus',
      eyebrow: '함께한 공동체',
      title: '우리의 여정',
      lines: recap.campusJourney.campuses.map((campus) =>
        formatCampusJourney(campus, recap.recapYear)),
    });
  }

  if (hasDevotionActivity(recap)) {
    chapters.push({
      kind: 'devotion',
      eyebrow: '경건생활',
      title: '매일의 작은 실천이 모였어요',
      metrics: [
        metric('큐티한 날', recap.devotion.quietTimeCount, '일'),
        metric('말씀 읽은 날', recap.devotion.bibleReadingCount, '일'),
        metric('기도한 날', recap.devotion.prayerCount, '일'),
      ],
    });
    chapters.push({
      kind: 'consistency',
      eyebrow: '꾸준함',
      title: '이어온 믿음의 리듬',
      metrics: [
        metric('모두 실천한 날', recap.devotion.allCompletedDayCount, '일'),
        metric('제출한 주차', recap.devotion.submittedWeekCount, '주'),
        metric('최장 연속 실천', recap.devotion.longestStreakDays, '일'),
        {
          label: '가장 활발했던 달',
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
      eyebrow: '기도제목',
      title: '함께 기도한 시간',
      description: '기도의 내용은 담지 않고, 함께한 발걸음만 정리했어요.',
      metrics: [
        metric('제출한 주차', recap.prayerActivity.submittedWeekCount, '주'),
        metric('참여한 기도 시즌', recap.prayerActivity.participatedSeasonCount, '회'),
      ],
    });
  }

  if (hasPollActivity(recap)) {
    chapters.push({
      kind: 'poll',
      eyebrow: '공동체 참여',
      title: '함께 선택하고 나눈 기록',
      metrics: [
        metric('참여한 투표', recap.pollActivity.participatedCount, '회'),
        metric('예배 투표', recap.pollActivity.wedServicePollCount, '회'),
        metric('리더 투표', recap.pollActivity.saturdayLeaderPollCount, '회'),
        metric('커피 투표', recap.pollActivity.coffeePollCount, '회'),
        metric('밥 투표', recap.pollActivity.mealPollCount, '회'),
        metric('일반 투표', recap.pollActivity.customPollCount, '회'),
        metric('작성한 댓글', recap.pollActivity.commentCount, '개'),
      ],
    });
  }

  chapters.push({
    kind: 'closing',
    eyebrow: '새로운 한 해',
    title: '올해도 FaithLog와 함께해요',
    description: '작은 기록이 쌓여 또 하나의 믿음 이야기가 됩니다.',
  });
  return chapters;
}

export function formatCampusJourney(campus: YearlyRecapCampus, recapYear: number) {
  if (!campus.joinedDuringRecapYear) {
    return `${recapYear}년에도 ${campus.campusName}와 함께했어요`;
  }
  const [, month, day] = campus.joinedDate.split('-').map(Number);
  return `${recapYear}년 ${month}월 ${day}일부터 ${campus.campusName}와 함께했어요`;
}

function metric(label: string, value: number, suffix: string): RecapMetric {
  return {label, value: `${numberFormatter.format(value)}${suffix}`};
}

function hasDevotionActivity(recap: YearlyRecap) {
  return Object.values(recap.devotion).some((value) => value > 0);
}

function hasPollActivity(recap: YearlyRecap) {
  return Object.values(recap.pollActivity).some((value) => value > 0);
}
