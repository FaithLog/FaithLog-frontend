export const ANALYTICS_SCREEN_NAMES = [
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
] as const;

export const ANALYTICS_EVENT_NAMES = [
  'sign_up',
  'login',
  'campus_join_complete',
  'devotion_submit_complete',
  'prayer_submit_complete',
  'poll_response_complete',
  'poll_create_complete',
  'poll_close_complete',
  'charge_mark_paid_complete',
] as const;

export const ANALYTICS_ENTRY_POINTS = ['home', 'notification', 'deep_link', 'list'] as const;
export const ANALYTICS_POLL_TYPES = ['coffee', 'meal', 'custom'] as const;

export type AnalyticsScreenName = typeof ANALYTICS_SCREEN_NAMES[number];
export type AnalyticsEventName = typeof ANALYTICS_EVENT_NAMES[number];
export type AnalyticsEntryPoint = typeof ANALYTICS_ENTRY_POINTS[number];
export type AnalyticsPollType = typeof ANALYTICS_POLL_TYPES[number];

type EmailAuthEvent = {
  name: 'login' | 'sign_up';
  parameters: {method: 'email'};
};

type CompletionEvent = {
  name:
    | 'campus_join_complete'
    | 'devotion_submit_complete'
    | 'prayer_submit_complete'
    | 'charge_mark_paid_complete';
  parameters: {action_result: 'success'};
};

type PollCompletionEvent = {
  name: 'poll_response_complete' | 'poll_create_complete' | 'poll_close_complete';
  parameters: {action_result: 'success'; poll_type: AnalyticsPollType};
};

export type AnalyticsEvent = EmailAuthEvent | CompletionEvent | PollCompletionEvent;

const screenNameSet = new Set<string>(ANALYTICS_SCREEN_NAMES);
const pollTypeSet = new Set<string>(ANALYTICS_POLL_TYPES);

export function isAnalyticsScreenName(value: unknown): value is AnalyticsScreenName {
  return typeof value === 'string' && screenNameSet.has(value);
}

export function isAllowedAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (!isRecord(value) || typeof value.name !== 'string' || !isRecord(value.parameters)) {
    return false;
  }

  const parameterKeys = Object.keys(value.parameters).sort();

  if (value.name === 'login' || value.name === 'sign_up') {
    return sameKeys(parameterKeys, ['method']) && value.parameters.method === 'email';
  }

  if (
    value.name === 'campus_join_complete' ||
    value.name === 'devotion_submit_complete' ||
    value.name === 'prayer_submit_complete' ||
    value.name === 'charge_mark_paid_complete'
  ) {
    return sameKeys(parameterKeys, ['action_result']) &&
      value.parameters.action_result === 'success';
  }

  if (
    value.name === 'poll_response_complete' ||
    value.name === 'poll_create_complete' ||
    value.name === 'poll_close_complete'
  ) {
    return sameKeys(parameterKeys, ['action_result', 'poll_type']) &&
      value.parameters.action_result === 'success' &&
      typeof value.parameters.poll_type === 'string' &&
      pollTypeSet.has(value.parameters.poll_type);
  }

  return false;
}

export function toAnalyticsPollType(pollType: string): AnalyticsPollType {
  if (pollType === 'COFFEE') return 'coffee';
  if (pollType === 'MEAL') return 'meal';
  return 'custom';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameKeys(actual: string[], expected: string[]) {
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
