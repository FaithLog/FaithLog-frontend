import type {AnalyticsEvent, AnalyticsPollType, AnalyticsScreenName} from './analyticsContract';
import {logNativeAnalyticsEvent, logNativeAnalyticsScreen} from './nativeFirebaseAnalytics';

let lastScreenName: AnalyticsScreenName | null = null;

export function trackScreenView(screenName: AnalyticsScreenName) {
  if (lastScreenName === screenName) return;

  lastScreenName = screenName;
  ignoreAnalyticsFailure(logNativeAnalyticsScreen(screenName));
}

export function trackSignUpComplete() {
  trackEvent({name: 'sign_up', parameters: {method: 'email'}});
}

export function trackLoginComplete() {
  trackEvent({name: 'login', parameters: {method: 'email'}});
}

export function trackCampusJoinComplete() {
  trackEvent({name: 'campus_join_complete', parameters: {action_result: 'success'}});
}

export function trackDevotionSubmitComplete() {
  trackEvent({name: 'devotion_submit_complete', parameters: {action_result: 'success'}});
}

export function trackPrayerSubmitComplete() {
  trackEvent({name: 'prayer_submit_complete', parameters: {action_result: 'success'}});
}

export function trackPollResponseComplete(pollType: AnalyticsPollType) {
  trackPollEvent('poll_response_complete', pollType);
}

export function trackPollCreateComplete(pollType: AnalyticsPollType) {
  trackPollEvent('poll_create_complete', pollType);
}

export function trackPollCloseComplete(pollType: AnalyticsPollType) {
  trackPollEvent('poll_close_complete', pollType);
}

export function trackChargeMarkPaidComplete() {
  trackEvent({name: 'charge_mark_paid_complete', parameters: {action_result: 'success'}});
}

function trackPollEvent(
  name: 'poll_response_complete' | 'poll_create_complete' | 'poll_close_complete',
  pollType: AnalyticsPollType,
) {
  trackEvent({name, parameters: {action_result: 'success', poll_type: pollType}});
}

function trackEvent(event: AnalyticsEvent) {
  ignoreAnalyticsFailure(logNativeAnalyticsEvent(event));
}

function ignoreAnalyticsFailure(operation: Promise<void>) {
  void operation.catch(() => undefined);
}

export function resetAppAnalyticsForTests() {
  lastScreenName = null;
}
