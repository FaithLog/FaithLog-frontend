import React from 'react';
import {act, create} from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  closeAdminPoll: vi.fn(),
  createAdminPoll: vi.fn(),
  createCoffeeDutyPaymentAccount: vi.fn(),
  deactivateCoffeeDutyPaymentAccount: vi.fn(),
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
    ActivityIndicator: host('ActivityIndicator'),
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
    createCoffeeDutyPaymentAccount: mocks.createCoffeeDutyPaymentAccount,
    deactivateCoffeeDutyPaymentAccount: mocks.deactivateCoffeeDutyPaymentAccount,
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
import {
  DutyEntityCard,
  DutyMetricSurface,
  DutyPageSection,
  DutySectionHeader,
} from '../duty/DutyPresentation';

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
    expect(renderer.root.findAllByType(DutyPageSection).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByType(DutySectionHeader).length).toBeGreaterThan(0);
    expect(mocks.fetchMyDutyAssignment.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.fetchAdminPolls.mock.invocationCallOrder[0]);

    await press(renderer, '커피 내 계좌 페이지 열기');
    expect(rendered(renderer)).toContain('QA 커피 계좌');
    expect(renderer.root.findAllByType(DutyEntityCard).length).toBeGreaterThan(0);
    await press(renderer, '커피 정산 페이지 열기');
    expect(rendered(renderer)).toContain('12,000원');
    expect(renderer.root.findAllByType(DutyMetricSurface)).toHaveLength(1);
    expect(mocks.fetchMyDutyAssignment).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAdminPaymentAccounts).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType('ScrollView')).toHaveLength(0);
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

  it('locks every poll draft and selection control while creation is in flight', async () => {
    let resolveCreate;
    mocks.createAdminPoll.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(CoffeeDutyScreen, screenProps()));
      await settle();
    });

    await press(renderer, '커피 투표 생성 페이지 열기');
    await press(renderer, '커피 메뉴 추가 모달 열기');
    await press(renderer, '아메리카노 메뉴 추가');

    act(() => {
      findByLabel(renderer, '커피 주문 투표 생성').props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(findByLabel(renderer, '제목').props.editable).toBe(false);
    expect(findByLabel(renderer, '커피 메뉴 추가 모달 열기').props).toMatchObject({
      accessibilityState: {disabled: true},
      disabled: true,
    });
    expect(findByLabel(renderer, '아메리카노 메뉴 제거').props).toMatchObject({
      accessibilityState: {disabled: true},
      disabled: true,
    });
    expect(findByLabel(renderer, 'QA 커피 계좌 커피 계좌 선택').props).toMatchObject({
      accessibilityState: {disabled: true, selected: true},
      disabled: true,
    });

    await act(async () => {
      resolveCreate(coffeePoll());
      await settle();
    });
  });

  it('locks every coffee account field while account creation is in flight', async () => {
    let resolveCreate;
    mocks.createCoffeeDutyPaymentAccount.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve;
    }));
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(CoffeeDutyScreen, screenProps()));
      await settle();
    });

    await press(renderer, '커피 내 계좌 페이지 열기');
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '커피 계좌 새로고침')).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '커피 계좌번호')).toHaveLength(0);
    await press(renderer, '커피 계좌 추가 페이지 열기');
    expect(findByLabel(renderer, '커피 계좌번호').props).toMatchObject({
      keyboardType: 'number-pad',
      placeholder: '3333-00-7777777',
    });
    await change(renderer, '커피 계좌 별칭', '새 커피 계좌');
    await change(renderer, '커피 계좌 은행명', '테스트은행');
    await change(renderer, '커피 계좌번호', '111-222');
    await change(renderer, '커피 계좌 예금주', '커피 담당');
    await press(renderer, '커피 계좌 등록');

    for (const label of [
      '커피 계좌 별칭',
      '커피 계좌 은행명',
      '커피 계좌번호',
      '커피 계좌 예금주',
    ]) {
      expect(findByLabel(renderer, label).props.editable).toBe(false);
    }

    await act(async () => {
      resolveCreate({...coffeeAccount(), id: 11, nickname: '새 커피 계좌'});
      await settle();
    });
    expect(findByLabel(renderer, '커피 계좌 추가 페이지 열기')).toBeTruthy();
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '커피 계좌번호')).toHaveLength(0);
    expect(rendered(renderer)).not.toContain('새 커피 계좌 계좌를 등록했습니다.');
  });

  it('removes a coffee account without rendering a success alert', async () => {
    mocks.deactivateCoffeeDutyPaymentAccount.mockResolvedValue(undefined);
    mocks.fetchAdminPaymentAccounts
      .mockResolvedValueOnce([coffeeAccount()])
      .mockResolvedValueOnce([]);
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(CoffeeDutyScreen, screenProps()));
      await settle();
    });

    await press(renderer, '커피 내 계좌 페이지 열기');
    await press(renderer, 'QA 커피 계좌 계좌 삭제');
    await press(renderer, '커피 계좌 삭제 확인');

    expect(mocks.deactivateCoffeeDutyPaymentAccount).toHaveBeenCalledTimes(1);
    expect(rendered(renderer)).not.toContain('QA 커피 계좌 계좌를 삭제했습니다.');
  });

  it('uses the shared calendar and time picker without changing the deadline on cancel', async () => {
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(CoffeeDutyScreen, screenProps()));
      await settle();
    });
    await press(renderer, '커피 투표 생성 페이지 열기');
    const before = rendered(renderer);
    await press(renderer, '커피 투표 마감 일시 선택');
    expect(rendered(renderer)).toContain('달력에서 날짜를 고르고 시간을 조정하세요.');
    expect(findByLabel(renderer, '시 늘리기').props.accessibilityRole).toBe('button');
    await press(renderer, '마감 일시 선택 취소');
    expect(rendered(renderer)).toBe(before);
  });

  it('keeps duty-native touch targets at least 48 points with selected state', async () => {
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(CoffeeDutyScreen, screenProps()));
      await settle();
    });

    for (const label of [
      '커피 투표 페이지 열기',
      '커피 투표 생성 페이지 열기',
      '진행 중 커피 투표 보기',
      '마감 커피 투표 보기',
      '커피 투표 목록 새로고침',
    ]) {
      const control = findByLabel(renderer, label);
      expectTouchTarget(control);
      expectVisualHeightAtMost(control, 40);
    }
    expect(findByLabel(renderer, '진행 중 커피 투표 보기').props.accessibilityState)
      .toEqual({selected: true});

    await press(renderer, '커피 투표 생성 페이지 열기');
    for (const label of [
      '커피 투표 마감 일시 선택',
      '커피 메뉴 추가 모달 열기',
      'QA 커피 계좌 커피 계좌 선택',
      '커피 투표 사용자 항목 추가 허용',
      '커피 주문 투표 생성',
    ]) {
      expectTouchTarget(findByLabel(renderer, label));
    }
    for (const label of [
      '커피 메뉴 추가 모달 열기',
      '커피 주문 투표 생성',
    ]) {
      expectVisualHeightAtMost(findByLabel(renderer, label), 40);
    }
    expect(findByLabel(renderer, '커피 투표 사용자 항목 추가 허용').props.accessibilityState)
      .toEqual({checked: true, disabled: true});
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

async function change(renderer, label, value) {
  await act(async () => {
    findByLabel(renderer, label).props.onChangeText(value);
    await settle();
  });
}

function findByLabel(renderer, label) {
  const matches = renderer.root.findAll((node) => node.props.accessibilityLabel === label);
  if (matches.length === 0) throw new Error(`No node found for ${label}`);
  return matches.find((node) => typeof node.type === 'string') ?? matches[0];
}

function expectTouchTarget(node) {
  const raw = typeof node.props.style === 'function'
    ? node.props.style({pressed: false})
    : node.props.style;
  const styles = flattenStyles(raw);
  const visualHeight = Math.max(...styles.map((style) => style.minHeight ?? style.height ?? 0));
  const verticalHitSlop = typeof node.props.hitSlop === 'number'
    ? node.props.hitSlop * 2
    : (node.props.hitSlop?.top ?? 0) + (node.props.hitSlop?.bottom ?? 0);
  expect(visualHeight + verticalHitSlop)
    .toBeGreaterThanOrEqual(48);
}

function expectVisualHeightAtMost(node, expectedMaximum) {
  const raw = typeof node.props.style === 'function'
    ? node.props.style({pressed: false})
    : node.props.style;
  const styles = flattenStyles(raw);
  const visualHeight = Math.max(...styles.map((style) => style.minHeight ?? style.height ?? 0));
  expect(visualHeight).toBeLessThanOrEqual(expectedMaximum);
}

function flattenStyles(value) {
  if (Array.isArray(value)) return value.flatMap(flattenStyles);
  return value ? [value] : [];
}

function rendered(renderer) {
  return JSON.stringify(renderer.toJSON());
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
