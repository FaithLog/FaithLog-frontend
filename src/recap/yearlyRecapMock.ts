import type {YearlyRecap} from './yearlyRecapTypes';

const DEFAULT_RECAP: YearlyRecap = {
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
  pollActivity: {
    participatedCount: 31,
    wedServicePollCount: 4,
    saturdayLeaderPollCount: 3,
    coffeePollCount: 10,
    mealPollCount: 8,
    customPollCount: 6,
    commentCount: 6,
  },
};

export function getMockYearlyRecap(scenario = process.env.EXPO_PUBLIC_MOCK_SCENARIO) {
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
    case 'recap-partial':
      return {
        ...DEFAULT_RECAP,
        prayerActivity: {submittedWeekCount: 0, participatedSeasonCount: 0},
        pollActivity: {
          participatedCount: 0,
          wedServicePollCount: 0,
          saturdayLeaderPollCount: 0,
          coffeePollCount: 0,
          mealPollCount: 0,
          customPollCount: 0,
          commentCount: 0,
        },
      };
    default:
      return DEFAULT_RECAP;
  }
}
