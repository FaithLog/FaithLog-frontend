import type {YearlyRecap} from './yearlyRecapTypes';

export function getYearlyRecapDisplayPolicy(recap: YearlyRecap) {
  if (!recap.hasRecapData) {
    return {showHomeCard: false, shouldAutoPresent: false};
  }
  return {
    showHomeCard: recap.presentation.homeCardVisible === true,
    shouldAutoPresent: recap.presentation.shouldAutoPresent === true,
  };
}
