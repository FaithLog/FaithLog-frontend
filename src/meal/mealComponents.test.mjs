import React from 'react';
import {act, create} from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const auth = vi.hoisted(() => ({generation: 1, token: 'A1'}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name) => ({children, ...props}) =>
    ReactModule.createElement(name, props, children);
  return {
    Modal: ({children, visible, ...props}) => visible
      ? ReactModule.createElement('Modal', props, children)
      : null,
    StyleSheet: {create: (styles) => styles},
    Text: host('Text'),
    View: host('View'),
  };
});

vi.mock('../components/ui', async () => {
  const ReactModule = await import('react');
  const host = (name) => ({children, ...props}) =>
    ReactModule.createElement(name, props, children);
  return {
    Body: host('Body'),
    Button: host('Button'),
    Card: host('Card'),
    Chip: host('Chip'),
    Empty: host('Empty'),
    Eyebrow: host('Eyebrow'),
    Loading: host('Loading'),
    TextField: host('TextField'),
    Title: host('Title'),
  };
});

vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: vi.fn(() => auth.generation),
  isAuthSessionRequestAllowed: vi.fn((generation) => generation === auth.generation),
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {},
}));

vi.mock('../auth/accessTokenResolver', () => ({
  expireMissingAuthSession: vi.fn(),
  readCurrentAccessToken: vi.fn(async () => ({
    accessToken: auth.token,
    generation: auth.generation,
  })),
}));

vi.mock('../api/client', () => {
  class TestFaithLogApiError extends Error {
    constructor(detail) {
      super(detail.message);
      this.detail = detail;
    }
  }
  return {
    apiRequest: vi.fn(),
    FaithLogApiError: TestFaithLogApiError,
    isMockModeEnabled: vi.fn(() => false),
  };
});

import {FaithLogApiError} from '../api/client';
import {MealAccountScreen} from './MealAccountScreen';
import {MealPollChargeScreen} from './MealPollChargeScreen';
import {MealPollCreateScreen} from './MealPollCreateScreen';
import {MealPollDetailScreen} from './MealPollDetailScreen';
import {MealPollListScreen} from './MealPollListScreen';
import {MealErrorState, toMealApiError} from './mealScreenShared';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MEAL component behavior', () => {
  beforeEach(() => {
    auth.generation = 1;
    auth.token = 'A1';
  });

  it('renders loading, error, retry success, and empty list states', async () => {
    const first = deferred();
    const api = createApi({listPolls: vi.fn(() => first.promise)});
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollListScreen, listProps(api, 1)));
    });
    expect(rendered(renderer)).toContain('밥 투표를 불러오는 중');

    await act(async () => {
      first.reject(new FaithLogApiError({kind: 'error', status: 404, message: 'missing'}));
      await settle();
    });
    expect(rendered(renderer)).toContain('찾을 수 없습니다');

    api.listPolls.mockResolvedValueOnce(pollList([mealPoll({title: '재시도 성공'})]));
    await press(renderer, '목록 갱신 실행');
    expect(rendered(renderer)).toContain('재시도 성공');

    api.listPolls.mockResolvedValueOnce(pollList([]));
    await press(renderer, '종료 밥 투표 보기');
    expect(rendered(renderer)).toContain('표시할 밥 투표가 없습니다');
  });

  it('drops an old campus response after switching campuses', async () => {
    const campusOne = deferred();
    const campusTwo = deferred();
    const api = createApi({
      listPolls: vi.fn((_token, campusId) => campusId === 1 ? campusOne.promise : campusTwo.promise),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollListScreen, listProps(api, 1)));
    });
    await act(async () => {
      renderer.update(React.createElement(MealPollListScreen, listProps(api, 2)));
      await settle();
      campusTwo.resolve(pollList([mealPoll({id: 202, campusId: 2, title: '두 번째 캠퍼스'})]));
      await settle();
    });
    await act(async () => {
      campusOne.resolve(pollList([mealPoll({title: '오래된 캠퍼스'})]));
      await settle();
    });
    expect(rendered(renderer)).toContain('두 번째 캠퍼스');
    expect(rendered(renderer)).not.toContain('오래된 캠퍼스');
  });

  it('normalizes status-specific errors and only current 401 expires auth', async () => {
    for (const [error, copy] of [
      [{kind: 'permissionDenied', status: 403, message: 'forbidden'}, '밥 담당 권한이 필요합니다'],
      [{kind: 'error', status: 404, message: 'missing'}, '대상을 찾을 수 없습니다'],
      [{kind: 'conflict', status: 409, message: 'duplicate'}, '최신 상태 확인이 필요합니다'],
    ]) {
      let renderer;
      await act(async () => {
        renderer = create(React.createElement(MealErrorState, {error}));
      });
      expect(rendered(renderer)).toContain(copy);
      renderer.unmount();
    }
    expect(toMealApiError(new Error('secure raw secret'), '안전한 안내')).toEqual({
      kind: 'error',
      message: '안전한 안내',
    });

    const onSessionExpired = vi.fn();
    const api = createApi({
      listPolls: vi.fn().mockRejectedValue(new FaithLogApiError({
        authSessionGeneration: 1,
        kind: 'sessionExpired',
        status: 401,
        message: 'expired',
      })),
    });
    await act(async () => {
      create(React.createElement(MealPollListScreen, {...listProps(api, 1), onSessionExpired}));
      await settle();
    });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('single-flights a rapid poll-create double tap', async () => {
    const createRequest = deferred();
    const onCreated = vi.fn();
    const api = createApi({createPoll: vi.fn(() => createRequest.promise)});
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollCreateScreen, {
        api,
        campusId: 1,
        onCancel: vi.fn(),
        onCreated,
        onSessionExpired: vi.fn(),
      }));
    });
    await change(renderer, '밥 투표 제목', '내일 점심');
    await change(renderer, '밥 투표 선택지 1', '제육볶음');
    await change(renderer, '밥 투표 선택지 2', '김치찌개');

    const button = findByLabel(renderer, '밥 투표 생성 실행');
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
      await settle();
    });
    expect(api.createPoll).toHaveBeenCalledTimes(1);
    expect(api.createPoll.mock.calls[0][2]).not.toHaveProperty('startsAt');
    expect(api.createPoll.mock.calls[0][2]).not.toHaveProperty('paymentAccountId');
    expect(api.createPoll.mock.calls[0][2]).not.toHaveProperty('amount');

    await act(async () => {
      createRequest.resolve(mealDetail({status: 'OPEN'}));
      await settle();
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('single-flights account creation and never resends it after refresh warning', async () => {
    const createRequest = deferred();
    const api = createApi({
      createPaymentAccount: vi.fn(() => createRequest.promise),
      getMyPaymentAccounts: vi.fn()
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('refresh unavailable'))
        .mockResolvedValueOnce([mealAccount()]),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealAccountScreen, accountProps(api)));
      await settle();
    });
    await change(renderer, '밥 계좌 별칭', '점심 계좌');
    await change(renderer, '밥 계좌 은행명', '신한은행');
    await change(renderer, '밥 계좌번호', '110000000000');
    await change(renderer, '밥 계좌 예금주', '샘플 사용자');
    const button = findByLabel(renderer, '본인 밥 계좌 등록');
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
      await settle();
    });
    expect(api.createPaymentAccount).toHaveBeenCalledTimes(1);
    await act(async () => {
      createRequest.resolve(mealAccount());
      await settle();
    });
    expect(rendered(renderer)).toContain('처리는 완료됐어요');
    await press(renderer, '최신 상태 다시 불러오기');
    expect(api.createPaymentAccount).toHaveBeenCalledTimes(1);
  });

  it('single-flights account deactivation and keeps its success terminal', async () => {
    const deactivateRequest = deferred();
    const inactive = {...mealAccount(), isActive: false, deactivatedAt: '2026-07-13T05:00:00.000Z'};
    const api = createApi({
      deactivatePaymentAccount: vi.fn(() => deactivateRequest.promise),
      getMyPaymentAccounts: vi.fn()
        .mockResolvedValueOnce([mealAccount()])
        .mockRejectedValueOnce(new Error('refresh unavailable')),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealAccountScreen, accountProps(api)));
      await settle();
    });
    const button = findByLabel(renderer, '점심 계좌 밥 계좌 비활성화');
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
      await settle();
    });
    expect(api.deactivatePaymentAccount).toHaveBeenCalledTimes(1);
    await act(async () => {
      deactivateRequest.resolve(inactive);
      await settle();
    });
    expect(rendered(renderer)).toContain('비활성');
    expect(rendered(renderer)).toContain('처리는 완료됐어요');
    expect(api.deactivatePaymentAccount).toHaveBeenCalledTimes(1);
  });

  it('does not write a refresh warning from an account mutation after campus switch', async () => {
    const oldCampusRefresh = deferred();
    let campusOneReads = 0;
    const api = createApi({
      createPaymentAccount: vi.fn().mockResolvedValue(mealAccount()),
      getMyPaymentAccounts: vi.fn((_token, campusId) => {
        if (campusId === 2) return Promise.resolve([]);
        campusOneReads += 1;
        return campusOneReads === 1 ? Promise.resolve([]) : oldCampusRefresh.promise;
      }),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealAccountScreen, accountProps(api, 1)));
      await settle();
    });
    await change(renderer, '밥 계좌 별칭', '점심 계좌');
    await change(renderer, '밥 계좌 은행명', '신한은행');
    await change(renderer, '밥 계좌번호', '110000000000');
    await change(renderer, '밥 계좌 예금주', '샘플 사용자');
    await press(renderer, '본인 밥 계좌 등록');
    await act(async () => {
      renderer.update(React.createElement(MealAccountScreen, accountProps(api, 2)));
      await settle();
      oldCampusRefresh.reject(new Error('old campus refresh failed'));
      await settle();
    });
    expect(rendered(renderer)).not.toContain('처리는 완료됐어요');
  });

  it('keeps another duty owner private and does not expose account identifiers', async () => {
    const detail = chargedDetail({chargedByMe: false});
    const api = createApi({getPollDetail: vi.fn().mockResolvedValue(detail)});
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollDetailScreen, detailProps(api)));
      await settle();
    });
    expect(rendered(renderer)).toContain('다른 밥 담당자가 청구했습니다');
    expect(rendered(renderer)).not.toContain('paymentAccountId');
    expect(rendered(renderer)).not.toContain('110-000');
  });

  it('does not resend close when its terminal success is followed by refresh failure', async () => {
    const open = mealDetail({status: 'OPEN'});
    const closed = mealDetail({status: 'CLOSED'});
    const api = createApi({
      closePoll: vi.fn().mockResolvedValue(closed),
      getPollDetail: vi.fn()
        .mockResolvedValueOnce(open)
        .mockRejectedValueOnce(new Error('refresh unavailable'))
        .mockResolvedValueOnce(closed),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollDetailScreen, detailProps(api)));
      await settle();
    });
    const button = findByLabel(renderer, '밥 투표 수동 종료');
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
      await settle();
    });
    expect(api.closePoll).toHaveBeenCalledTimes(1);
    expect(rendered(renderer)).toContain('처리는 완료됐어요');
    await press(renderer, '최신 상태 다시 불러오기');
    expect(api.closePoll).toHaveBeenCalledTimes(1);
  });

  it('shows full charge confirmation and keeps success terminal when refetch warns', async () => {
    const detail = mealDetail({status: 'CLOSED'});
    const chargeRequest = deferred();
    const api = createApi({
      createCharges: vi.fn(() => chargeRequest.promise),
      getMyPaymentAccounts: vi.fn().mockResolvedValue([mealAccount()]),
      getMySettlement: vi.fn().mockRejectedValue(new Error('refresh unavailable')),
      getPollDetail: vi.fn().mockResolvedValue(detail),
      listPolls: vi.fn().mockResolvedValue(pollList([mealPoll()])),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollChargeScreen, {
        api,
        campusId: 1,
        onBack: vi.fn(),
        onComplete: vi.fn(),
        onSessionExpired: vi.fn(),
        pollId: 101,
      }));
      await settle();
    });
    await press(renderer, '제육볶음 전체 금액 계산 선택');
    await change(renderer, '제육볶음 청구 금액', '10000');
    await press(renderer, '밥 청구 최종 확인 열기');
    const confirmation = rendered(renderer);
    expect(confirmation).toContain('점심 계좌');
    expect(confirmation).toContain('그룹 총액 입력');
    expect(confirmation).toContain('3명');
    expect(confirmation).toContain('3,334원');
    expect(confirmation).toContain('10,002원');
    expect(confirmation).toContain('2원');
    const accessibilityLabel = findByType(renderer, 'View', 'accessibilityLabel').props.accessibilityLabel;
    expect(accessibilityLabel).toContain('계산 방식 전체 금액');
    expect(accessibilityLabel).toContain('입력 10000원');
    expect(accessibilityLabel).toContain('요청 총액 10000원');
    expect(accessibilityLabel).toContain('전체 대상 3명');

    const submit = findByLabel(renderer, '최종 청구 실행');
    await act(async () => {
      submit.props.onPress();
      submit.props.onPress();
      await settle();
    });
    expect(api.createCharges).toHaveBeenCalledTimes(1);
    await act(async () => {
      chargeRequest.resolve(chargeResult());
      await settle();
    });
    expect(rendered(renderer)).toContain('처리는 완료됐어요');
    await press(renderer, '최신 상태 다시 불러오기');
    expect(api.createCharges).toHaveBeenCalledTimes(1);
  });
});

function createApi(overrides = {}) {
  return {
    assignDuty: vi.fn(),
    closePoll: vi.fn(),
    createCharges: vi.fn(),
    createPaymentAccount: vi.fn(),
    createPoll: vi.fn(),
    deactivatePaymentAccount: vi.fn(),
    getMyDuty: vi.fn(),
    getMyPaymentAccounts: vi.fn().mockResolvedValue([]),
    getMySettlement: vi.fn(),
    getPollDetail: vi.fn(),
    listPolls: vi.fn(),
    revokeDuty: vi.fn(),
    ...overrides,
  };
}

function listProps(api, campusId) {
  return {
    api,
    campusId,
    onCreate: vi.fn(),
    onOpenDetail: vi.fn(),
    onSessionExpired: vi.fn(),
  };
}

function detailProps(api) {
  return {
    api,
    campusId: 1,
    onBack: vi.fn(),
    onOpenCharge: vi.fn(),
    onSessionExpired: vi.fn(),
    pollId: 101,
  };
}

function accountProps(api, campusId = 1) {
  return {
    api,
    campusId,
    onBack: vi.fn(),
    onSessionExpired: vi.fn(),
  };
}

function mealPoll(patch = {}) {
  return {
    id: 101,
    campusId: 1,
    title: '점심 투표',
    description: null,
    pollType: 'MEAL',
    selectionType: 'SINGLE',
    allowUserOptionAdd: true,
    startsAt: '2026-07-13T01:00:00.000Z',
    endsAt: '2026-07-14T01:00:00.000Z',
    status: 'CLOSED',
    settlementStatus: 'NOT_CHARGED',
    totalResponseCount: 3,
    ...patch,
  };
}

function mealDetail(patch = {}) {
  return {
    ...mealPoll(patch),
    options: [{
      optionId: 1001,
      content: '제육볶음',
      responseCount: 3,
      userAdded: false,
      charge: {chargeStatus: 'NOT_CHARGED'},
    }],
  };
}

function chargedDetail({chargedByMe}) {
  return {
    ...mealDetail({settlementStatus: 'CHARGED'}),
    options: [{
      optionId: 1001,
      content: '제육볶음',
      responseCount: 3,
      userAdded: false,
      charge: {
        chargeStatus: 'CHARGED',
        chargedByMe,
        paymentAccountId: null,
        calculationType: 'GROUP_TOTAL',
        enteredAmount: 10000,
        amountPerMember: 3334,
        requestedTotalAmount: 10000,
        actualTotalAmount: 10002,
        roundingAdjustment: 2,
        chargedMemberCount: 3,
        chargedAt: '2026-07-13T03:00:00.000Z',
      },
    }],
  };
}

function mealAccount() {
  return {
    id: 10,
    campusId: 1,
    ownerUserId: 7,
    accountType: 'MEAL',
    nickname: '점심 계좌',
    bankName: '신한은행',
    accountNumber: '110-000-000000',
    accountHolder: '샘플 사용자',
    isActive: true,
    createdAt: '2026-07-13T03:00:00.000Z',
    deactivatedAt: null,
  };
}

function pollList(content) {
  return {content, page: 0, size: 20, totalElements: content.length, totalPages: content.length ? 1 : 0};
}

function chargeResult() {
  return {
    pollId: 101,
    paymentAccountId: 10,
    chargedMemberCount: 3,
    requestedTotalAmount: 10000,
    actualTotalAmount: 10002,
    roundingAdjustment: 2,
    chargedAt: '2026-07-13T03:00:00.000Z',
    groups: [{
      optionId: 1001,
      calculationType: 'GROUP_TOTAL',
      enteredAmount: 10000,
      amountPerMember: 3334,
      chargedMemberCount: 3,
      requestedTotalAmount: 10000,
      actualTotalAmount: 10002,
      roundingAdjustment: 2,
    }],
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return {promise, reject, resolve};
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function rendered(renderer) {
  return JSON.stringify(renderer.toJSON());
}

function findByLabel(renderer, accessibilityLabel) {
  return renderer.root.find((node) => node.props.accessibilityLabel === accessibilityLabel);
}

function findByType(renderer, type, prop) {
  return renderer.root.find((node) => node.type === type && node.props[prop]);
}

async function press(renderer, accessibilityLabel) {
  await act(async () => {
    findByLabel(renderer, accessibilityLabel).props.onPress();
    await settle();
  });
}

async function change(renderer, accessibilityLabel, value) {
  await act(async () => {
    findByLabel(renderer, accessibilityLabel).props.onChangeText(value);
    await settle();
  });
}
