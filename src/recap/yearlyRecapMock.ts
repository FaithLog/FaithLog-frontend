import type {YearlyRecap, YearlyRecapDto} from './yearlyRecapTypes';

const DEFAULT_RECAP: YearlyRecapDto = {
  recapYear: 2026,
  hasRecapData: true,
  presentation: {
    shouldAutoPresent: true,
    homeCardVisible: true,
    homeCardVisibleUntil: '2027-01-14T23:59:59+09:00',
    firstPresentedAt: null,
  },
  campusJourney: {
    campuses: [
      {
        campusId: 1,
        campusName: '프론트 QA 캠퍼스',
        joinedDate: '2026-03-10',
        joinedDuringRecapYear: true,
      },
      {
        campusId: 2,
        campusName: '오랫동안 함께한 믿음 공동체 캠퍼스',
        joinedDate: '2024-09-01',
        joinedDuringRecapYear: false,
      },
    ],
  },
  devotion: {
    quietTimeCount: 210,
    bibleReadingCount: 185,
    prayerCount: 230,
    allCompletedDayCount: 150,
    submittedWeekCount: 40,
    longestStreakDays: 12,
    mostActiveMonth: 8,
  },
  prayerActivity: {submittedWeekCount: 22, participatedSeasonCount: 2},
  commentActivity: {writtenCount: 6},
  penaltySummary: {
    totalCount: 3,
    totalAmount: 45_000,
    paidCount: 2,
    paidAmount: 30_000,
    unpaidCount: 1,
    unpaidAmount: 15_000,
  },
};

export function getMockYearlyRecap(
  scenario = process.env.EXPO_PUBLIC_MOCK_SCENARIO,
): YearlyRecap {
  switch (scenario) {
    case 'recap-empty':
      return {...DEFAULT_RECAP, hasRecapData: false};
    case 'recap-home-only':
      return {
        ...DEFAULT_RECAP,
        presentation: {...DEFAULT_RECAP.presentation, shouldAutoPresent: false},
      };
    case 'recap-auto-only':
      return {
        ...DEFAULT_RECAP,
        presentation: {...DEFAULT_RECAP.presentation, homeCardVisible: false},
      };
    case 'recap-partial': {
      const {commentActivity: _comment, penaltySummary: _penalty, ...partialRecap} = DEFAULT_RECAP;
      return {
        ...partialRecap,
        prayerActivity: {submittedWeekCount: 0, participatedSeasonCount: 0},
      };
    }
    case 'recap-penalty-zero':
      return {
        ...DEFAULT_RECAP,
        penaltySummary: {
          totalCount: 0,
          totalAmount: 0,
          paidCount: 0,
          paidAmount: 0,
          unpaidCount: 0,
          unpaidAmount: 0,
        },
      };
    case 'recap-penalty-paid':
      return {
        ...DEFAULT_RECAP,
        penaltySummary: {
          totalCount: 2,
          totalAmount: 30_000,
          paidCount: 2,
          paidAmount: 30_000,
          unpaidCount: 0,
          unpaidAmount: 0,
        },
      };
    case 'recap-penalty-unpaid':
      return {
        ...DEFAULT_RECAP,
        penaltySummary: {
          totalCount: 2,
          totalAmount: 30_000,
          paidCount: 0,
          paidAmount: 0,
          unpaidCount: 2,
          unpaidAmount: 30_000,
        },
      };
    case 'recap-penalty-large': {
      const maximum = Number.MAX_SAFE_INTEGER;
      return {
        ...DEFAULT_RECAP,
        penaltySummary: {
          totalCount: maximum,
          totalAmount: maximum,
          paidCount: maximum - 1,
          paidAmount: maximum - 1,
          unpaidCount: 1,
          unpaidAmount: 1,
        },
      };
    }
    default:
      return DEFAULT_RECAP;
  }
}
