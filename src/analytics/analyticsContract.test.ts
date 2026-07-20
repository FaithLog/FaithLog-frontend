import {describe, expect, it} from 'vitest';

import {
  ANALYTICS_ENTRY_POINTS,
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_POLL_TYPES,
  ANALYTICS_SCREEN_NAMES,
  isAllowedAnalyticsEvent,
  toAnalyticsPollType,
} from './analyticsContract';

describe('privacy-safe Analytics contract', () => {
  it('keeps screen, event, entry point, and poll type values on fixed allowlists', () => {
    expect(ANALYTICS_SCREEN_NAMES).toEqual([
      'home',
      'login',
      'sign_up',
      'campus_join',
      'devotion',
      'prayer',
      'poll_list',
      'poll_detail',
      'poll_create',
      'billing',
      'notifications',
      'settings',
      'admin_dashboard',
    ]);
    expect(ANALYTICS_EVENT_NAMES).toEqual([
      'sign_up',
      'login',
      'campus_join_complete',
      'devotion_submit_complete',
      'prayer_submit_complete',
      'poll_response_complete',
      'poll_create_complete',
      'poll_close_complete',
      'charge_mark_paid_complete',
    ]);
    expect(ANALYTICS_ENTRY_POINTS).toEqual(['home', 'notification', 'deep_link', 'list']);
    expect(ANALYTICS_POLL_TYPES).toEqual(['coffee', 'meal', 'custom']);
  });

  it('accepts only exact event names and fixed parameter values', () => {
    expect(isAllowedAnalyticsEvent({name: 'login', parameters: {method: 'email'}})).toBe(true);
    expect(isAllowedAnalyticsEvent({
      name: 'poll_response_complete',
      parameters: {action_result: 'success', poll_type: 'meal'},
    })).toBe(true);
    expect(isAllowedAnalyticsEvent({
      name: 'campus_join_complete',
      parameters: {action_result: 'success'},
    })).toBe(true);
  });

  it('rejects identifiers, free strings, user content, and unexpected parameter keys', () => {
    const rejected = [
      {name: 'login', parameters: {method: 'password'}},
      {name: 'campus_join_complete', parameters: {action_result: 'success', campusId: 1}},
      {name: 'poll_response_complete', parameters: {action_result: 'success', poll_type: 'lunch'}},
      {name: 'poll_create_complete', parameters: {action_result: 'success', poll_type: 'meal', title: '점심'}},
      {name: 'charge_mark_paid_complete', parameters: {action_result: 'success', amount: 8000}},
      {name: 'custom_free_form', parameters: {}},
    ];

    rejected.forEach((event) => expect(isAllowedAnalyticsEvent(event)).toBe(false));
  });

  it('maps backend poll types without forwarding arbitrary backend strings', () => {
    expect(toAnalyticsPollType('COFFEE')).toBe('coffee');
    expect(toAnalyticsPollType('MEAL')).toBe('meal');
    expect(toAnalyticsPollType('CUSTOM')).toBe('custom');
    expect(toAnalyticsPollType('unknown-free-string')).toBe('custom');
  });
});
