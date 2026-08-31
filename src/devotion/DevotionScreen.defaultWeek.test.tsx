import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {WeeklyDevotionSummary} from '../api/types';
import type {AuthGateState} from '../auth/authGate';

const api = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn().mockResolvedValue({status: 'copied'}),
  fetchMyCharges: vi.fn(),
  fetchPenaltyRules: vi.fn(),
  fetchWeeklyDevotionSummary: vi.fn(),
  formatAccountClipboardText: vi.fn(() => '카카오뱅크 333333333333'),
  markMyChargePaid: vi.fn(),
  runTossRemittanceWithCopyFallback: vi.fn(),
  saveWeeklyDevotion: vi.fn(),
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);

  return {
    Linking: {canOpenURL: vi.fn().mockResolvedValue(true), openURL: vi.fn().mockResolvedValue(undefined)},
    Modal: host('Modal'),
    Pressable: host('Pressable'),
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
    TextInput: host('TextInput'),
    View: host('View'),
  };
});

vi.mock('../api/client', () => ({
  ...api,
  FaithLogApiError: class FaithLogApiError extends Error {
    constructor(readonly detail: Record<string, unknown>) {
      super(String(detail.message));
    }
  },
}));
vi.mock('../api/errorPolicy', () => ({
  getApiErrorPresentation: () => ({
    actionLabel: '다시 시도',
    message: '오류',
    title: '오류',
  }),
}));
vi.mock('../api/tokenStorage', () => ({clearTokens: vi.fn()}));
vi.mock('../analytics/appAnalytics', () => ({
  trackChargeMarkPaidComplete: vi.fn(),
  trackDevotionSubmitComplete: vi.fn(),
}));
vi.mock('../payments/paymentContextCache', () => ({invalidatePaymentContextCache: vi.fn()}));
vi.mock('../payments/tossRemittance', () => ({
  createTossRemittanceOpener: vi.fn(() => vi.fn()),
  runTossRemittanceWithCopyFallback: api.runTossRemittanceWithCopyFallback,
}));
vi.mock('../utils/clipboard', () => ({
  copyTextToClipboard: api.copyTextToClipboard,
  formatAccountClipboardText: api.formatAccountClipboardText,
}));
vi.mock('../analytics/trackedApiSuccess', () => ({
  runWithCompletionEvent: (request: () => Promise<unknown>) => request(),
}));
vi.mock('../auth/accessTokenResolver', () => ({
  resolveCurrentAccessToken: vi.fn().mockResolvedValue('access-token'),
}));
vi.mock('../components/IconexIcon', () => ({IconexIcon: () => null}));
vi.mock('../components/ui', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);

  return {
    Conflict: host('Conflict'),
    ErrorState: host('ErrorState'),
    FaithLogHeaderIconButton: host('FaithLogHeaderIconButton'),
    FaithLogHeaderPillButton: host('FaithLogHeaderPillButton'),
    FaithLogHeaderTopRow: host('FaithLogHeaderTopRow'),
    Loading: ({message}: {message: string}) => ReactModule.createElement('Text', null, message),
    Offline: host('Offline'),
    PermissionDenied: host('PermissionDenied'),
  };
});
vi.mock('../theme', () => ({
  colors: new Proxy({}, {get: () => '#000000'}),
  typography: {body: {}, cardTitle: {}, screenTitle: {}},
}));

import {DevotionScreen} from './DevotionScreen';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('DevotionScreen initial week', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T03:00:00.000Z'));
    api.fetchPenaltyRules.mockResolvedValue([]);
    api.runTossRemittanceWithCopyFallback.mockResolvedValue({status: 'opened'});
    api.markMyChargePaid.mockResolvedValue({
      id: 91,
      paymentCategory: 'PENALTY',
      title: '경건 벌금',
      reason: '경건 미제출',
      amount: 1000,
      status: 'PAID',
      paidAt: '2026-08-11T04:00:00Z',
    });
    api.fetchMyCharges.mockResolvedValue({
      campusId: 1,
      campusName: '프론트 QA 캠퍼스',
      region: '서울',
      summary: {totalAmount: 1000, unpaidAmount: 1000, paidAmount: 0, waivedAmount: 0, canceledAmount: 0},
      items: [{
        id: 91,
        paymentCategory: 'PENALTY',
        title: '경건 벌금',
        reason: '경건 미제출',
        amount: 1000,
        status: 'UNPAID',
        account: {
          paymentAccountId: 12,
          bankName: '카카오뱅크',
          accountNumber: '333-333-333333',
          accountHolder: '담당자',
        },
        source: {sourceType: 'DEVOTION_RECORD', sourceId: 1},
      }],
      page: 0,
      size: 100,
      totalElements: 1,
      totalPages: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows only the immediately previous week when it is unsubmitted', async () => {
    api.fetchWeeklyDevotionSummary.mockImplementation(
      (_token: string, _campusId: number, weekStartDate: string) =>
        Promise.resolve(weekly(weekStartDate, null)),
    );

    const renderer = await renderScreen(null);

    expect(api.fetchWeeklyDevotionSummary).toHaveBeenCalledOnce();
    expect(api.fetchWeeklyDevotionSummary).toHaveBeenCalledWith(
      'access-token',
      1,
      '2026-08-03',
    );
    expect(textOccurrences(renderer, '지난주 기록을 먼저 보여드려요')).toBe(1);
    expect(textOccurrences(renderer, '8월 3일 - 8월 9일')).toBe(1);
    await act(async () => renderer.unmount());
  });

  it('keeps the current week when the immediately previous week was submitted', async () => {
    api.fetchWeeklyDevotionSummary.mockImplementation(
      (_token: string, _campusId: number, weekStartDate: string) => Promise.resolve(
        weekly(
          weekStartDate,
          weekStartDate === '2026-08-03' ? '2026-08-10T01:00:00Z' : null,
        ),
      ),
    );

    const renderer = await renderScreen(null);

    expect(api.fetchWeeklyDevotionSummary.mock.calls.map((call) => call[2])).toEqual([
      '2026-08-03',
      '2026-08-10',
    ]);
    expect(textOccurrences(renderer, '지난주 기록을 먼저 보여드려요')).toBe(0);
    expect(textOccurrences(renderer, '8월 10일 - 8월 16일')).toBe(1);
    await act(async () => renderer.unmount());
  });

  it('lets the user move to the current week without being forced back', async () => {
    api.fetchWeeklyDevotionSummary.mockImplementation(
      (_token: string, _campusId: number, weekStartDate: string) =>
        Promise.resolve(weekly(weekStartDate, null)),
    );
    const renderer = await renderScreen(null);

    await act(async () => {
      byLabel(renderer, '이번 주 경건생활 기록 보기').props.onPress();
      await flushPromises();
    });

    expect(api.fetchWeeklyDevotionSummary.mock.calls.map((call) => call[2])).toEqual([
      '2026-08-03',
      '2026-08-10',
    ]);
    expect(textOccurrences(renderer, '지난주 기록을 먼저 보여드려요')).toBe(0);
    expect(textOccurrences(renderer, '8월 10일 - 8월 16일')).toBe(1);
    await act(async () => renderer.unmount());
  });

  it('uses an explicitly selected calendar week without checking the previous week', async () => {
    api.fetchWeeklyDevotionSummary.mockImplementation(
      (_token: string, _campusId: number, weekStartDate: string) =>
        Promise.resolve(weekly(weekStartDate, null)),
    );

    const renderer = await renderScreen('2026-07-29');

    expect(api.fetchWeeklyDevotionSummary).toHaveBeenCalledOnce();
    expect(api.fetchWeeklyDevotionSummary).toHaveBeenCalledWith(
      'access-token',
      1,
      '2026-07-27',
    );
    expect(textOccurrences(renderer, '7월 27일 - 8월 2일')).toBe(1);
    await act(async () => renderer.unmount());
  });

  it('replaces home and result actions with payment actions after submission', async () => {
    api.fetchWeeklyDevotionSummary.mockImplementation(
      (_token: string, _campusId: number, weekStartDate: string) =>
        Promise.resolve(weekly(weekStartDate, '2026-08-10T01:00:00Z')),
    );

    const renderer = await renderScreen('2026-08-03');

    expect(() => byLabel(renderer, '경건생활 벌금 토스로 송금')).not.toThrow();
    expect(() => byLabel(renderer, '경건생활 벌금 계좌 복사')).not.toThrow();
    expect(() => byLabel(renderer, '경건생활 벌금 입금했어요 처리')).not.toThrow();
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '홈으로 돌아가기')).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '경건생활 벌금 결과 보기')).toHaveLength(0);

    expect(api.fetchMyCharges).toHaveBeenCalledWith('access-token', 1, {
      includeArchived: true,
      page: 0,
      paymentCategory: 'PENALTY',
      size: 100,
      status: 'ALL',
    });
    await act(async () => {
      await byLabel(renderer, '경건생활 벌금 계좌 복사').props.onPress();
      await flushPromises();
    });
    expect(api.formatAccountClipboardText).toHaveBeenCalledWith({
      accountHolder: '담당자',
      accountNumber: '333-333-333333',
      bankName: '카카오뱅크',
      paymentAccountId: 12,
    });
    expect(api.copyTextToClipboard).toHaveBeenCalledWith('카카오뱅크 333333333333');
    expect(textOccurrences(renderer, '은행명과 계좌번호를 복사했습니다.')).toBe(1);
    await act(async () => {
      await byLabel(renderer, '경건생활 벌금 토스로 송금').props.onPress();
      await byLabel(renderer, '경건생활 벌금 입금했어요 처리').props.onPress();
      await flushPromises();
    });
    expect(api.runTossRemittanceWithCopyFallback).toHaveBeenCalledOnce();
    expect(api.markMyChargePaid).toHaveBeenCalledWith('access-token', 1, 91);
    expect(textOccurrences(renderer, '입금 완료로 처리된 청구입니다.')).toBe(1);
    await act(async () => renderer.unmount());
  });
});

async function renderScreen(initialSelectedDate: string | null) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <DevotionScreen
        canOpenAdminMode={false}
        initialSelectedDate={initialSelectedDate}
        onOpenAdminMode={vi.fn()}
        onOpenNotifications={vi.fn()}
        setAuthState={vi.fn()}
        state={authenticatedState()}
      />,
    );
    await flushPromises();
  });

  return renderer;
}

async function flushPromises() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

function authenticatedState(): Extract<AuthGateState, {status: 'authenticated'}> {
  const selectedCampus = {
    membershipId: 10,
    campusId: 1,
    campusName: '프론트 QA 캠퍼스',
    region: '서울',
    campusRole: 'MEMBER' as const,
    status: 'ACTIVE',
  };

  return {
    status: 'authenticated',
    activeCampuses: [selectedCampus],
    selectedCampus,
    user: {
      id: 7,
      name: '사용자',
      email: 'user@example.test',
      role: 'USER',
      isActive: true,
      lastLoginAt: null,
      campusMemberships: [],
    },
  };
}

function weekly(weekStartDate: string, submittedAt: string | null): WeeklyDevotionSummary {
  const start = new Date(`${weekStartDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    weeklyRecordId: 1,
    campusId: 1,
    campusName: '프론트 QA 캠퍼스',
    region: '서울',
    userId: 7,
    weekStartDate,
    weekEndDate: end.toISOString().slice(0, 10),
    quietTimeCount: 0,
    prayerCount: 0,
    bibleReadingCount: 0,
    saturdayLateMinutes: 0,
    submittedAt,
    dailyChecks: [],
  };
}

function textOccurrences(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAll((node) =>
    String(node.type) === 'Text' && node.children.join('') === text).length;
}

function byLabel(renderer: ReactTestRenderer, accessibilityLabel: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === accessibilityLabel);
}
