import React from 'react';
import {act, create} from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  closeAdminPoll: vi.fn(),
  createAdminPoll: vi.fn(),
  fetchAdminCampusChargesForMyAccounts: vi.fn(),
  fetchAdminPaymentAccounts: vi.fn(),
  fetchAdminPollResults: vi.fn(),
  fetchAdminPolls: vi.fn(),
  fetchCoffeeBrands: vi.fn(),
  fetchCoffeeMenus: vi.fn(),
  fetchMyDutyAssignment: vi.fn(),
  resolveCurrentAccessToken: vi.fn(),
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name) => ({children, ...props}) => ReactModule.createElement(name, props, children);
  return {
    FlatList: ({data, renderItem, ...props}) => ReactModule.createElement(
      'FlatList',
      props,
      data.map((item, index) => ReactModule.createElement(
        ReactModule.Fragment,
        {key: item.id ?? index},
        renderItem({index, item}),
      )),
    ),
    KeyboardAvoidingView: host('KeyboardAvoidingView'),
    Modal: ({children, visible, ...props}) => visible
      ? ReactModule.createElement('Modal', props, children)
      : null,
    Platform: {OS: 'ios'},
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: {create: (styles) => styles},
    Text: host('Text'),
    TextInput: host('TextInput'),
    View: host('View'),
  };
});

vi.mock('../components/IconexIcon', async () => {
  const ReactModule = await import('react');
  return {IconexIcon: (props) => ReactModule.createElement('IconexIcon', props)};
});

vi.mock('../components/ui', async () => {
  const ReactModule = await import('react');
  const host = (name) => ({children, ...props}) => ReactModule.createElement(name, props, children);
  return {
    Body: host('Body'),
    Button: host('Button'),
    Card: host('Card'),
    Empty: host('Empty'),
    Eyebrow: host('Eyebrow'),
    FaithLogHeaderPillButton: host('FaithLogHeaderPillButton'),
    FaithLogHeaderTopRow: host('FaithLogHeaderTopRow'),
    Loading: host('Loading'),
    TextField: host('TextField'),
  };
});

vi.mock('../auth/accessTokenResolver', () => ({
  resolveCurrentAccessToken: mocks.resolveCurrentAccessToken,
}));

vi.mock('../api/adminPollApi', () => ({
  closeAdminPoll: mocks.closeAdminPoll,
  createAdminPoll: mocks.createAdminPoll,
  fetchAdminPollResults: mocks.fetchAdminPollResults,
  fetchAdminPolls: mocks.fetchAdminPolls,
}));

vi.mock('../api/client', () => {
  class TestFaithLogApiError extends Error {
    constructor(detail) {
      super(detail.message);
      this.detail = detail;
    }
  }
  return {
    createCoffeeDutyPaymentAccount: vi.fn(),
    deactivateCoffeeDutyPaymentAccount: vi.fn(),
    FaithLogApiError: TestFaithLogApiError,
    fetchAdminCampusChargesForMyAccounts: mocks.fetchAdminCampusChargesForMyAccounts,
    fetchAdminPaymentAccounts: mocks.fetchAdminPaymentAccounts,
    fetchCoffeeBrands: mocks.fetchCoffeeBrands,
    fetchCoffeeMenus: mocks.fetchCoffeeMenus,
    fetchMyDutyAssignment: mocks.fetchMyDutyAssignment,
    fetchPaymentAccounts: vi.fn(),
  };
});

import {CoffeeDutyScreen} from './CoffeeDutyScreen';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('CoffeeDutyScreen canonical duty navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCurrentAccessToken.mockResolvedValue('A1');
    mocks.fetchMyDutyAssignment.mockResolvedValue({
      campusId: 1,
      dutyType: 'COFFEE',
      isActive: true,
      userId: 7,
    });
    mocks.fetchAdminPaymentAccounts.mockResolvedValue([coffeeAccount()]);
    mocks.fetchCoffeeBrands.mockResolvedValue([{id: 5, name: '브랜드'}]);
    mocks.fetchCoffeeMenus.mockResolvedValue([coffeeMenu()]);
    mocks.fetchAdminCampusChargesForMyAccounts.mockResolvedValue(chargeSummary());
    mocks.fetchAdminPolls.mockResolvedValue([]);
  });

  it('opens the canonical first poll tab only after duty verification and preserves loaded account and settlement data', async () => {
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(CoffeeDutyScreen, screenProps()));
      await settle();
    });

    expect(findByLabel(renderer, '커피 투표 페이지 열기').props.accessibilityState).toEqual({selected: true});
    expect(findByLabel(renderer, '커피 투표 생성 페이지 열기').props.accessibilityState).toEqual({selected: false});
    expect(mocks.fetchAdminPolls).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMyDutyAssignment.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.fetchAdminPolls.mock.invocationCallOrder[0]);

    await press(renderer, '커피 내 계좌 페이지 열기');
    expect(rendered(renderer)).toContain('QA 커피 계좌');
    await press(renderer, '커피 정산 페이지 열기');
    expect(rendered(renderer)).toContain('12,000원');
    expect(mocks.fetchMyDutyAssignment).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAdminPaymentAccounts).toHaveBeenCalledTimes(1);
  });

  it('returns a created coffee poll to the same canonical poll tab without duplicating the create request', async () => {
    const created = coffeePoll();
    mocks.createAdminPoll.mockResolvedValue(created);
    mocks.fetchAdminPolls
      .mockResolvedValueOnce([])
      .mockResolvedValue([created]);
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(CoffeeDutyScreen, screenProps()));
      await settle();
    });

    await press(renderer, '커피 투표 생성 페이지 열기');
    await press(renderer, '커피 메뉴 추가 모달 열기');
    await press(renderer, '아메리카노 메뉴 추가');
    const createButton = findByLabel(renderer, '커피 주문 투표 생성');
    await act(async () => {
      createButton.props.onPress();
      createButton.props.onPress();
      await settle();
    });

    expect(mocks.createAdminPoll).toHaveBeenCalledTimes(1);
    expect(findByLabel(renderer, '커피 투표 페이지 열기').props.accessibilityState).toEqual({selected: true});
    expect(rendered(renderer)).toContain('새 커피 주문');
  });
});

function screenProps() {
  return {
    canOpenAdminMode: false,
    onBack: vi.fn(),
    onOpenAdminMode: vi.fn(),
    onOpenNotifications: vi.fn(),
    setAuthState: vi.fn(),
    state: {
      status: 'authenticated',
      user: {id: 7, email: 'coffee@example.test', name: '커피 담당', role: 'USER'},
      selectedCampus: {campusId: 1, campusName: 'QA 캠퍼스', campusRole: 'MEMBER', status: 'ACTIVE'},
      activeCampuses: [],
    },
  };
}

function coffeeAccount() {
  return {
    id: 10,
    accountType: 'COFFEE',
    nickname: 'QA 커피 계좌',
    bankName: '테스트은행',
    accountNumber: '000-000',
    accountHolder: '커피 담당',
    isActive: true,
    ownerUserId: 7,
  };
}

function coffeeMenu() {
  return {id: 51, brandId: 5, name: '아메리카노', priceAmount: 4500, isActive: true};
}

function coffeePoll() {
  return {
    id: 91,
    title: '새 커피 주문',
    pollType: 'COFFEE',
    selectionType: 'SINGLE',
    isAnonymous: false,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 7_200_000).toISOString(),
    status: 'OPEN',
  };
}

function chargeSummary() {
  return {
    summary: {unpaidAmount: 12000},
    members: [{userId: 8, name: '미납 멤버', unpaidAmount: 12000}],
  };
}

async function press(renderer, label) {
  await act(async () => {
    findByLabel(renderer, label).props.onPress();
    await settle();
  });
}

function findByLabel(renderer, label) {
  return renderer.root.findByProps({accessibilityLabel: label});
}

function rendered(renderer) {
  return JSON.stringify(renderer.toJSON());
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
