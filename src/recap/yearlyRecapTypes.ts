export type YearlyRecapCampus = {
  campusId: number;
  campusName: string;
  joinedDate: string;
  joinedDuringRecapYear: boolean;
};

export type YearlyRecapDevotion = {
  allCompletedDayCount: number;
  bibleReadingCount: number;
  longestStreakDays: number;
  mostActiveMonth: number;
  prayerCount: number;
  quietTimeCount: number;
  submittedWeekCount: number;
};

export type YearlyRecapPrayerActivity = {
  participatedSeasonCount: number;
  submittedWeekCount: number;
};

export type YearlyRecapPollActivity = {
  coffeePollCount: number;
  commentCount: number;
  customPollCount: number;
  mealPollCount: number;
  participatedCount: number;
  saturdayLeaderPollCount: number;
  wedServicePollCount: number;
};

export type YearlyRecap = {
  campusJourney: {campuses: YearlyRecapCampus[]};
  devotion: YearlyRecapDevotion;
  hasRecapData: boolean;
  pollActivity: YearlyRecapPollActivity;
  prayerActivity: YearlyRecapPrayerActivity;
  presentation: {
    firstPresentedAt: string | null;
    homeCardVisible: boolean;
    homeCardVisibleUntil: string;
    shouldAutoPresent: boolean;
  };
  recapYear: number;
};

export type YearlyRecapApi = {
  getPreviousYearRecap(
    accessToken: string,
    authGeneration: AuthSessionGeneration,
  ): Promise<YearlyRecap>;
  markPresented(
    accessToken: string,
    authGeneration: AuthSessionGeneration,
    recapYear: number,
  ): Promise<null>;
};
import type {AuthSessionGeneration} from '../api/tokenStorage';
