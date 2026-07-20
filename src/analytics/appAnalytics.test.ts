import {beforeEach, describe, expect, it, vi} from 'vitest';

const nativeTransport = vi.hoisted(() => ({
  logNativeAnalyticsEvent: vi.fn(),
  logNativeAnalyticsScreen: vi.fn(),
}));

vi.mock('./nativeFirebaseAnalytics', () => nativeTransport);

import {
  resetAppAnalyticsForTests,
  trackCampusJoinComplete,
  trackChargeMarkPaidComplete,
  trackDevotionSubmitComplete,
  trackLoginComplete,
  trackPollCloseComplete,
  trackPollCreateComplete,
  trackPollResponseComplete,
  trackPrayerSubmitComplete,
  trackScreenView,
  trackSignUpComplete,
} from './appAnalytics';

describe('app Analytics wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAppAnalyticsForTests();
    nativeTransport.logNativeAnalyticsEvent.mockResolvedValue(undefined);
    nativeTransport.logNativeAnalyticsScreen.mockResolvedValue(undefined);
  });

  it('records one screen event per logical screen transition', () => {
    trackScreenView('home');
    trackScreenView('home');
    trackScreenView('poll_list');
    trackScreenView('poll_list');
    trackScreenView('poll_detail');

    expect(nativeTransport.logNativeAnalyticsScreen.mock.calls).toEqual([
      ['home'],
      ['poll_list'],
      ['poll_detail'],
    ]);
  });

  it('uses only fixed parameters for recommended and completion events', () => {
    trackSignUpComplete();
    trackLoginComplete();
    trackCampusJoinComplete();
    trackDevotionSubmitComplete();
    trackPrayerSubmitComplete();
    trackPollResponseComplete('meal');
    trackPollCreateComplete('coffee');
    trackPollCloseComplete('custom');
    trackChargeMarkPaidComplete();

    expect(nativeTransport.logNativeAnalyticsEvent.mock.calls).toEqual([
      [{name: 'sign_up', parameters: {method: 'email'}}],
      [{name: 'login', parameters: {method: 'email'}}],
      [{name: 'campus_join_complete', parameters: {action_result: 'success'}}],
      [{name: 'devotion_submit_complete', parameters: {action_result: 'success'}}],
      [{name: 'prayer_submit_complete', parameters: {action_result: 'success'}}],
      [{name: 'poll_response_complete', parameters: {action_result: 'success', poll_type: 'meal'}}],
      [{name: 'poll_create_complete', parameters: {action_result: 'success', poll_type: 'coffee'}}],
      [{name: 'poll_close_complete', parameters: {action_result: 'success', poll_type: 'custom'}}],
      [{name: 'charge_mark_paid_complete', parameters: {action_result: 'success'}}],
    ]);
  });

  it('never lets native Analytics failures escape into the app flow', async () => {
    nativeTransport.logNativeAnalyticsEvent.mockRejectedValueOnce(new Error('private native error'));
    nativeTransport.logNativeAnalyticsScreen.mockRejectedValueOnce(new Error('private native error'));

    expect(() => trackLoginComplete()).not.toThrow();
    expect(() => trackScreenView('login')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
