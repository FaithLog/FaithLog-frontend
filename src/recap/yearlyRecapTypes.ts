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
  mostActiveMonth: number | null;
  prayerCount: number;
  quietTimeCount: number;
  submittedWeekCount: number;
};

export type YearlyRecapPrayerActivity = {
  participatedSeasonCount: number;
  submittedWeekCount: number;
};

export type YearlyRecapCommentActivity = {
  writtenCount: number;
};

export type YearlyRecapPenaltySummary = {
  paidAmount: number;
  paidCount: number;
  totalAmount: number;
  totalCount: number;
  unpaidAmount: number;
  unpaidCount: number;
};

type YearlyRecapCore = {
  campusJourney: {campuses: YearlyRecapCampus[]};
  devotion: YearlyRecapDevotion;
  hasRecapData: boolean;
  prayerActivity: YearlyRecapPrayerActivity;
  presentation: {
    firstPresentedAt: string | null;
    homeCardVisible: boolean;
    homeCardVisibleUntil: string;
    shouldAutoPresent: boolean;
  };
  recapYear: number;
};

export type YearlyRecapDto = YearlyRecapCore & {
  commentActivity: YearlyRecapCommentActivity;
  penaltySummary: YearlyRecapPenaltySummary;
};

export type YearlyRecap = YearlyRecapCore & {
  commentActivity?: YearlyRecapCommentActivity;
  penaltySummary?: YearlyRecapPenaltySummary;
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
