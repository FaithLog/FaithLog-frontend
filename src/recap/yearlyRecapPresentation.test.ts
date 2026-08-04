import {describe, expect, it} from 'vitest';

import {
  buildYearlyRecapChapters,
  formatCampusJourney,
  getYearlyRecapChapterAnnouncement,
} from './yearlyRecapPresentation';
import type {YearlyRecap, YearlyRecapPenaltySummary} from './yearlyRecapTypes';

const recap: YearlyRecap = {
  recapYear: 2026,
  hasRecapData: true,
  presentation: {
    shouldAutoPresent: true,
    homeCardVisible: true,
    homeCardVisibleUntil: '2027-01-14T23:59:59+09:00',
    firstPresentedAt: null,
  },
  campusJourney: {campuses: []},
  devotion: {
    quietTimeCount: 10,
    bibleReadingCount: 8,
    prayerCount: 12,
    allCompletedDayCount: 5,
    submittedWeekCount: 4,
    longestStreakDays: 3,
    mostActiveMonth: 8,
  },
  prayerActivity: {submittedWeekCount: 0, participatedSeasonCount: 0},
};

describe('yearly recap presentation', () => {
  it('keeps devotion first and presents every optional section as the signed-in user record', () => {
    const chapters = buildYearlyRecapChapters({
      ...recap,
      campusJourney: {campuses: [{
        campusId: 10,
        campusName: '서울 캠퍼스',
        joinedDate: '2026-03-10',
        joinedDuringRecapYear: true,
      }]},
      prayerActivity: {submittedWeekCount: 2, participatedSeasonCount: 1},
      commentActivity: {writtenCount: 7},
      penaltySummary: penalty({
        totalCount: 3,
        totalAmount: 15_000,
        paidCount: 2,
        paidAmount: 10_000,
        unpaidCount: 1,
        unpaidAmount: 5_000,
      }),
    });

    expect(chapters.map((chapter) => chapter.kind)).toEqual([
      'intro',
      'devotion',
      'consistency',
      'prayer',
      'campus',
      'comment',
      'penalty',
      'closing',
    ]);
    expect(chapters[0]?.metrics).toEqual([
      {label: '큐티한 날', value: '10일'},
      {label: '말씀 읽은 날', value: '8일'},
      {label: '기도한 날', value: '12일'},
    ]);
    expect(JSON.stringify(chapters)).not.toMatch(/우리 모두|캠퍼스 전체|순위|비교|백분위|투표/);
  });

  it('formats a campus journey as the signed-in user’s calendar-date record', () => {
    expect(formatCampusJourney({
      campusId: 10,
      campusName: '서울 캠퍼스',
      joinedDate: '2026-03-10',
      joinedDuringRecapYear: true,
    }, 2026)).toBe('2026년 3월 10일부터 서울 캠퍼스에서 내 여정을 시작했어요');
  });

  it('shows comment count as an independent compact metric, including zero', () => {
    const chapters = buildYearlyRecapChapters({...recap, commentActivity: {writtenCount: 0}});
    const comment = chapters.find((chapter) => chapter.kind === 'comment');

    expect(comment).toMatchObject({
      compact: true,
      metrics: [{label: '작성한 댓글', value: '0개'}],
    });
    expect(JSON.stringify(comment)).not.toMatch(/투표|참여 성과/);
    expect(buildYearlyRecapChapters(recap).some((chapter) => chapter.kind === 'comment')).toBe(false);
  });

  it.each([
    ['zero', penalty({}), undefined, true],
    ['paid only', penalty({totalCount: 2, totalAmount: 5_000, paidCount: 2, paidAmount: 5_000}), [
      {label: '총 경건 벌금', value: '2건 · 5,000원'},
      {label: '납부 완료', value: '2건 · 5,000원'},
      {label: '미납', value: '0건 · 0원'},
    ], false],
    ['unpaid only', penalty({totalCount: 2, totalAmount: 7_000, unpaidCount: 2, unpaidAmount: 7_000}), [
      {label: '총 경건 벌금', value: '2건 · 7,000원'},
      {label: '납부 완료', value: '0건 · 0원'},
      {label: '미납', value: '2건 · 7,000원'},
    ], false],
    ['mixed', penalty({
      totalCount: 3,
      totalAmount: 15_000,
      paidCount: 2,
      paidAmount: 10_000,
      unpaidCount: 1,
      unpaidAmount: 5_000,
    }), [
      {label: '총 경건 벌금', value: '3건 · 15,000원'},
      {label: '납부 완료', value: '2건 · 10,000원'},
      {label: '미납', value: '1건 · 5,000원'},
    ], false],
  ])('formats a neutral %s penalty summary', (_label, summary, metrics, compact) => {
    const penaltyChapter = buildYearlyRecapChapters({...recap, penaltySummary: summary})
      .find((chapter) => chapter.kind === 'penalty');

    expect(penaltyChapter).toMatchObject({compact});
    expect(penaltyChapter?.metrics).toEqual(metrics);
    expect(penaltyChapter?.summary).toBe(compact ? '경건 벌금 없음' : undefined);
    expect(JSON.stringify(penaltyChapter)).not.toMatch(/경고|위험|체납|빨리|즉시|불이익|벌점/);
  });

  it('formats a maximum safe KRW amount without rounding or scientific notation', () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const penaltyChapter = buildYearlyRecapChapters({
      ...recap,
      penaltySummary: penalty({
        totalCount: maximum,
        totalAmount: maximum,
        paidCount: maximum - 1,
        paidAmount: maximum - 1,
        unpaidCount: 1,
        unpaidAmount: 1,
      }),
    }).find((chapter) => chapter.kind === 'penalty');

    expect(penaltyChapter?.metrics?.[0]).toEqual({
      label: '총 경건 벌금',
      value: '9,007,199,254,740,991건 · 9,007,199,254,740,991원',
    });
  });

  it.each([
    ['a count is positive', penalty({totalCount: 1, paidCount: 1}), '1건 · 0원'],
    ['an amount is positive', penalty({totalAmount: 1, paidAmount: 1}), '0건 · 1원'],
  ])('uses compact zero only when all six values are zero and %s', (_label, summary, value) => {
    const penaltyChapter = buildYearlyRecapChapters({
      ...recap,
      penaltySummary: summary,
    }).find((chapter) => chapter.kind === 'penalty');

    expect(penaltyChapter).toMatchObject({compact: false});
    expect(penaltyChapter?.summary).toBeUndefined();
    expect(penaltyChapter?.metrics?.[0]).toEqual({
      label: '총 경건 벌금',
      value,
    });
  });

  it('ignores a backward payload pollActivity field and renders no poll UI', () => {
    const backwardPayload = {
      ...recap,
      pollActivity: {participatedCount: 99, commentCount: 88},
    } as YearlyRecap;
    const serialized = JSON.stringify(buildYearlyRecapChapters(backwardPayload));

    expect(serialized).not.toMatch(/poll|투표|99회|88개/i);
  });

  it('does not expose private content, financial identifiers, or other-user source text', () => {
    const serialized = JSON.stringify(buildYearlyRecapChapters({
      ...recap,
      commentActivity: {writtenCount: 2},
      penaltySummary: penalty({}),
    }));
    expect(serialized).not.toMatch(
      /email|token|accountNumber|accountId|chargeId|prayerContent|commentContent|choiceContent|memo|otherUser/i,
    );
  });

  it('builds a screen-reader announcement with 내 기록, title, and key values', () => {
    const devotion = buildYearlyRecapChapters(recap)
      .find((chapter) => chapter.kind === 'devotion');

    expect(devotion).toBeDefined();
    expect(getYearlyRecapChapterAnnouncement(devotion!)).toBe(
      '내 기록. 내가 이어온 경건생활. 큐티한 날 10일, 말씀 읽은 날 8일, 기도한 날 12일',
    );
  });
});

function penalty(overrides: Partial<YearlyRecapPenaltySummary>): YearlyRecapPenaltySummary {
  return {
    totalCount: 0,
    totalAmount: 0,
    paidCount: 0,
    paidAmount: 0,
    unpaidCount: 0,
    unpaidAmount: 0,
    ...overrides,
  };
}
