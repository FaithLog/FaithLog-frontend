import React from 'react';
import {act, create} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const auth = vi.hoisted(() => ({generation: 1, token: 'A1'}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name) => ({children, ...props}) =>
    ReactModule.createElement(name, props, children);
  return {
    KeyboardAvoidingView: host('KeyboardAvoidingView'),
    Modal: ({children, visible, ...props}) => visible
      ? ReactModule.createElement('Modal', props, children)
      : null,
    Platform: {OS: 'ios'},
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
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
    FaithLogHeaderPillButton: host('FaithLogHeaderPillButton'),
    FaithLogHeaderTopRow: host('FaithLogHeaderTopRow'),
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
import {MealDutyScreen} from './MealDutyScreen';
import {MealPollChargeScreen} from './MealPollChargeScreen';
import {MealPollCreateScreen} from './MealPollCreateScreen';
import {MealPollDetailScreen} from './MealPollDetailScreen';
import {MealPollListScreen} from './MealPollListScreen';
import {MealSettlementScreen} from './MealSettlementScreen';
import {MealErrorState, toMealApiError} from './mealScreenShared';
import {InvalidServerResponseError} from './mealRuntimeValidation';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MEAL component behavior', () => {
  beforeEach(() => {
    auth.generation = 1;
    auth.token = 'A1';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the coffee management header and four-page navigation pattern', async () => {
    const api = createApi({
      getMyDuty: vi.fn().mockResolvedValue({
        assignmentId: 20,
        campusId: 1,
        dutyType: 'MEAL',
        isActive: true,
        userId: 7,
      }),
      listPolls: vi.fn().mockResolvedValue(pollList([])),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealDutyScreen, {
        api,
        onBack: vi.fn(),
        setAuthState: vi.fn(),
        state: authenticatedState(),
      }));
      await settle();
    });

    const output = rendered(renderer);
    expect(output).toContain('밥 담당자');
    expect(output).toContain('밥 정산 관리');
    expect(output).toContain('투표');
    expect(output).toContain('투표 생성');
    expect(output).toContain('내 계좌');
    expect(output).toContain('정산');
    expect(renderer.root.findByProps({accessibilityLabel: '밥 투표 페이지 열기'})).toBeTruthy();
    expect(renderer.root.findByProps({accessibilityLabel: '밥 정산 페이지 열기'})).toBeTruthy();
  });

  it('keeps the management header and shows a dedicated inactive-duty state', async () => {
    const api = createApi({
      getMyDuty: vi.fn().mockResolvedValue({
        assignmentId: 20,
        campusId: 1,
        dutyType: 'MEAL',
        isActive: false,
        userId: 7,
      }),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealDutyScreen, {
        api,
        onBack: vi.fn(),
        setAuthState: vi.fn(),
        state: authenticatedState(),
      }));
      await settle();
    });

    expect(rendered(renderer)).toContain('밥 담당자');
    expect(rendered(renderer)).toContain('밥 정산 관리');
    expect(rendered(renderer)).toContain('밥 담당자 전용 화면입니다');
    expect(rendered(renderer)).toContain('활성 밥 담당자로 지정된 경우에만 사용할 수 있어요');
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
    await press(renderer, '밥 투표 목록 새로고침');
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
        currentUserId: 7,
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

  it('matches the custom poll creation hierarchy and option editing language', async () => {
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollCreateScreen, {
        api: createApi(),
        campusId: 1,
        onCancel: vi.fn(),
        onCreated: vi.fn(),
        onSessionExpired: vi.fn(),
      }));
    });

    const output = rendered(renderer);
    expect(output).toContain('밥 투표 생성');
    expect(output).toContain('투표 제목');
    expect(output).toContain('마감 일시');
    expect(output).toContain('선택지');
    expect(output).toContain('선택 방식');
    expect(output).toContain('단일 선택');
    expect(output).toContain('투표를 만들면 바로 시작');
    expect(output).not.toContain('paymentAccountId');
    expect(output).not.toContain('계좌 선택');

    const deadlinePicker = findByLabel(renderer, '밥 투표 마감 일시 선택');
    expect(deadlinePicker.props.accessibilityRole).toBe('button');
    expect(deadlinePicker.props.style({pressed: false})).toEqual(expect.arrayContaining([
      expect.objectContaining({minHeight: 82}),
    ]));
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '밥 투표 마감 날짜')).toHaveLength(0);
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '밥 투표 마감 시간')).toHaveLength(0);

    const anonymousToggle = findByLabel(renderer, '밥 투표 익명 여부 전환');
    expect(anonymousToggle.props.accessibilityRole).toBe('switch');
    expect(anonymousToggle.props.accessibilityState).toEqual({checked: false, disabled: false});
    const optionToggle = findByLabel(renderer, '사용자 선택지 추가 허용 전환');
    expect(optionToggle.props.accessibilityRole).toBe('switch');
    expect(optionToggle.props.accessibilityState).toEqual({checked: true, disabled: false});

    const addOptionButton = findByLabel(renderer, '밥 투표 선택지 추가');
    expect(addOptionButton.props.style({pressed: false})).toEqual(expect.arrayContaining([
      expect.objectContaining({height: 48}),
    ]));
    expect(findByLabel(renderer, '1번 밥 투표 선택지 삭제').props.style({pressed: false})).toEqual(
      expect.arrayContaining([expect.objectContaining({height: 48, width: 48})]),
    );
    expect(findByLabel(renderer, '1번 밥 투표 선택지 삭제').props.disabled).toBe(true);
    expect(findByLabel(renderer, '2번 밥 투표 선택지 삭제').props.disabled).toBe(true);
    await change(renderer, '밥 투표 선택지 1', '제육볶음');
    await change(renderer, '밥 투표 선택지 2', '김치찌개');
    const firstOptionBeforeAdd = findByLabel(renderer, '밥 투표 선택지 1');
    await press(renderer, '밥 투표 선택지 추가');
    expect(findByLabel(renderer, '밥 투표 선택지 1')).toBe(firstOptionBeforeAdd);
    expect(findByLabel(renderer, '2번 밥 투표 선택지 삭제').props.disabled).toBe(false);
    await change(renderer, '밥 투표 선택지 3', '돈가스');
    await press(renderer, '2번 밥 투표 선택지 삭제');
    expect(findByLabel(renderer, '밥 투표 선택지 1').props.value).toBe('제육볶음');
    expect(findByLabel(renderer, '밥 투표 선택지 2').props.value).toBe('돈가스');
    expect(findByLabel(renderer, '1번 밥 투표 선택지 삭제').props.disabled).toBe(true);
    expect(findByLabel(renderer, '2번 밥 투표 선택지 삭제').props.disabled).toBe(true);
  });

  it('creates a meal poll with the calendar and time picker deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 14, 12, 0));
    const api = createApi({createPoll: vi.fn().mockResolvedValue(mealDetail({status: 'OPEN'}))});
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollCreateScreen, {
        api,
        campusId: 1,
        onCancel: vi.fn(),
        onCreated: vi.fn(),
        onSessionExpired: vi.fn(),
      }));
    });

    const selectedDate = new Date(2026, 6, 16, 12, 0);
    const expectedDeadline = new Date(2026, 6, 16, 13, 0);

    await press(renderer, '밥 투표 마감 일시 선택');
    await press(
      renderer,
      `${selectedDate.getFullYear()}년 ${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 선택`,
    );
    await press(renderer, '시 늘리기');
    await press(renderer, '마감 일시 적용');
    await change(renderer, '밥 투표 제목', '내일 점심');
    await change(renderer, '밥 투표 선택지 1', '제육볶음');
    await change(renderer, '밥 투표 선택지 2', '김치찌개');
    await press(renderer, '밥 투표 생성 실행');

    expect(api.createPoll).toHaveBeenCalledTimes(1);
    expect(api.createPoll.mock.calls[0][2]).toEqual(expect.objectContaining({
      endsAt: expectedDeadline.toISOString(),
    }));
    expect(api.createPoll.mock.calls[0][2]).not.toHaveProperty('startsAt');
    expect(api.createPoll.mock.calls[0][2]).not.toHaveProperty('paymentAccountId');
    expect(api.createPoll.mock.calls[0][2]).not.toHaveProperty('amount');
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

  it('optimistically replaces the previous active account when refresh fails', async () => {
    const previous = mealAccount();
    const created = {...mealAccount(), id: 11, nickname: '저녁 계좌'};
    const api = createApi({
      createPaymentAccount: vi.fn().mockResolvedValue(created),
      getMyPaymentAccounts: vi.fn()
        .mockResolvedValueOnce([previous])
        .mockRejectedValueOnce(new Error('refresh unavailable')),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealAccountScreen, accountProps(api)));
      await settle();
    });
    await change(renderer, '밥 계좌 별칭', '저녁 계좌');
    await change(renderer, '밥 계좌 은행명', '신한은행');
    await change(renderer, '밥 계좌번호', '110000000001');
    await change(renderer, '밥 계좌 예금주', '샘플 사용자');
    await press(renderer, '본인 밥 계좌 등록');

    const output = rendered(renderer);
    const accountStateLabels = renderer.root
      .findAll((node) => node.type === 'Chip')
      .map((node) => node.props.label);
    expect(accountStateLabels).toEqual(['활성', '비활성']);
    expect(output).toContain('저녁 계좌');
    expect(output).toContain('비활성');
    expect(output).toContain('처리는 완료됐어요');
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
    await press(renderer, '점심 계좌 밥 계좌 비활성화');
    expect(api.deactivatePaymentAccount).not.toHaveBeenCalled();
    const button = findByLabel(renderer, '점심 계좌 비활성화 확인');
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

  it('never renders a previous authenticated user account after an identity switch', async () => {
    const oldUser = deferred();
    const api = createApi({
      getMyPaymentAccounts: vi.fn((_token, _campusId, currentUserId) =>
        currentUserId === 7 ? oldUser.promise : Promise.resolve([])),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealAccountScreen, accountProps(api)));
    });
    await act(async () => {
      renderer.update(React.createElement(MealAccountScreen, {...accountProps(api), currentUserId: 8}));
      await settle();
      oldUser.resolve([mealAccount()]);
      await settle();
    });
    expect(rendered(renderer)).toContain('등록한 밥 계좌가 없습니다');
    expect(rendered(renderer)).not.toContain('110-000-000000');
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

  it('keeps CLOSED terminal state when close refresh returns a stale OPEN success', async () => {
    const open = mealDetail({status: 'OPEN'});
    const closed = mealDetail({status: 'CLOSED'});
    const onOpenCharge = vi.fn();
    const api = createApi({
      closePoll: vi.fn().mockResolvedValue(closed),
      getPollDetail: vi.fn().mockResolvedValue(open),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollDetailScreen, {...detailProps(api), onOpenCharge}));
      await settle();
    });
    await press(renderer, '밥 투표 수동 종료');

    expect(api.closePoll).toHaveBeenCalledTimes(1);
    expect(onOpenCharge).not.toHaveBeenCalled();
    expect(rendered(renderer)).toContain('처리는 완료됐어요');
    expect(() => findByLabel(renderer, '밥 투표 수동 종료')).toThrow();
    expect(findByLabel(renderer, '밥 투표 청구 화면 열기')).toBeDefined();

    await press(renderer, '최신 상태 다시 불러오기');
    expect(api.closePoll).toHaveBeenCalledTimes(1);
    expect(onOpenCharge).not.toHaveBeenCalled();
    expect(() => findByLabel(renderer, '밥 투표 수동 종료')).toThrow();
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
        currentUserId: 7,
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
    expect(() => findByLabel(renderer, '밥 청구 최종 확인 열기')).toThrow();
    await press(renderer, '최신 상태 다시 불러오기');
    expect(api.createCharges).toHaveBeenCalledTimes(1);
  });

  it('keeps charge terminal state when refresh returns a stale NOT_CHARGED success', async () => {
    const onComplete = vi.fn();
    const staleDetail = mealDetail({status: 'CLOSED', settlementStatus: 'NOT_CHARGED'});
    const api = createApi({
      createCharges: vi.fn().mockResolvedValue(chargeResult()),
      getMyPaymentAccounts: vi.fn().mockResolvedValue([mealAccount()]),
      getMySettlement: vi.fn().mockResolvedValue({
        accounts: [],
        summary: {
          chargedMemberCount: 0,
          requestedTotalAmount: 0,
          actualTotalAmount: 0,
          roundingAdjustment: 0,
        },
      }),
      getPollDetail: vi.fn().mockResolvedValue(staleDetail),
      listPolls: vi.fn().mockResolvedValue(pollList([mealPoll()])),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollChargeScreen, {...chargeProps(api), onComplete}));
      await settle();
    });
    await change(renderer, '제육볶음 청구 금액', '10000');
    await press(renderer, '밥 청구 최종 확인 열기');
    await press(renderer, '최종 청구 실행');

    expect(api.createCharges).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(rendered(renderer)).toContain('청구가 완료된 투표입니다');
    expect(rendered(renderer)).toContain('처리는 완료됐어요');
    expect(() => findByLabel(renderer, '밥 청구 최종 확인 열기')).toThrow();

    await press(renderer, '최신 상태 다시 불러오기');
    expect(api.createCharges).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(() => findByLabel(renderer, '밥 청구 최종 확인 열기')).toThrow();
  });

  it('reconciles charge 409 to a terminal CHARGED detail without resubmitting', async () => {
    const api = createApi({
      createCharges: vi.fn().mockRejectedValue(new FaithLogApiError({kind: 'conflict', status: 409, message: 'duplicate'})),
      getMyPaymentAccounts: vi.fn().mockResolvedValue([mealAccount()]),
      getPollDetail: vi.fn()
        .mockResolvedValueOnce(mealDetail({status: 'CLOSED'}))
        .mockResolvedValueOnce(chargedDetail({chargedByMe: true})),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollChargeScreen, chargeProps(api)));
      await settle();
    });
    await change(renderer, '제육볶음 청구 금액', '10000');
    await press(renderer, '밥 청구 최종 확인 열기');
    await press(renderer, '최종 청구 실행');

    expect(api.createCharges).toHaveBeenCalledTimes(1);
    expect(rendered(renderer)).toContain('청구가 완료된 투표입니다');
    expect(() => findByLabel(renderer, '밥 청구 최종 확인 열기')).toThrow();
  });

  it('does not apply mutation success or refetch when a charge response identity mismatches', async () => {
    const onComplete = vi.fn();
    const api = createApi({
      createCharges: vi.fn().mockRejectedValue(new InvalidServerResponseError()),
      getMyPaymentAccounts: vi.fn().mockResolvedValue([mealAccount()]),
      getPollDetail: vi.fn().mockResolvedValue(mealDetail({status: 'CLOSED'})),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollChargeScreen, {...chargeProps(api), onComplete}));
      await settle();
    });
    await change(renderer, '제육볶음 청구 금액', '10000');
    await press(renderer, '밥 청구 최종 확인 열기');
    await press(renderer, '최종 청구 실행');

    expect(api.createCharges).toHaveBeenCalledTimes(1);
    expect(api.getPollDetail).toHaveBeenCalledTimes(1);
    expect(api.listPolls).not.toHaveBeenCalled();
    expect(api.getMySettlement).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(rendered(renderer)).not.toContain('청구가 완료된 투표입니다');
  });

  it('reconciles close 409 to CLOSED and exposes charge without retrying close', async () => {
    const onOpenCharge = vi.fn();
    const api = createApi({
      closePoll: vi.fn().mockRejectedValue(new FaithLogApiError({kind: 'conflict', status: 409, message: 'closed'})),
      getPollDetail: vi.fn()
        .mockResolvedValueOnce(mealDetail({status: 'OPEN'}))
        .mockResolvedValueOnce(mealDetail({status: 'CLOSED'})),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollDetailScreen, {...detailProps(api), onOpenCharge}));
      await settle();
    });
    await press(renderer, '밥 투표 수동 종료');

    expect(api.closePoll).toHaveBeenCalledTimes(1);
    expect(() => findByLabel(renderer, '밥 투표 수동 종료')).toThrow();
    await press(renderer, '밥 투표 청구 화면 열기');
    expect(onOpenCharge).toHaveBeenCalledWith(101);
  });

  it('keeps confirmation actions separately focusable and bounds a long summary scroll', async () => {
    const longTitle = '아주 긴 메뉴 이름 '.repeat(12);
    const detail = mealDetail({status: 'CLOSED'});
    detail.options[0].content = longTitle;
    const api = createApi({
      getMyPaymentAccounts: vi.fn().mockResolvedValue([mealAccount()]),
      getPollDetail: vi.fn().mockResolvedValue(detail),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollChargeScreen, chargeProps(api)));
      await settle();
    });
    await change(renderer, `${longTitle} 청구 금액`, '10000');
    await press(renderer, '밥 청구 최종 확인 열기');

    const summary = findByLabel(renderer, '최종 청구 접근성 요약');
    const scroll = renderer.root.findByType('ScrollView');
    const cancel = findByLabel(renderer, '최종 청구 취소');
    const confirm = findByLabel(renderer, '최종 청구 실행');
    expect(summary.props.accessible).toBe(true);
    expect(scroll.props.style).toEqual(expect.objectContaining({maxHeight: expect.any(Number)}));
    expect(isDescendantOf(cancel, summary)).toBe(false);
    expect(isDescendantOf(confirm, summary)).toBe(false);
    expect(cancel.props.accessibilityLabel).toBe('최종 청구 취소');
    expect(confirm.props.accessibilityLabel).toBe('최종 청구 실행');
  });

  it('uses one queryless management list and labels SCHEDULED separately', async () => {
    const onOpenDetail = vi.fn();
    const api = createApi({
      listPolls: vi.fn().mockResolvedValue(pollList([
        mealPoll({id: 300, status: 'SCHEDULED', title: '예정된 점심'}),
        mealPoll({id: 21, status: 'CLOSED', title: '아주 오래된 투표'}),
      ])),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollListScreen, {...listProps(api, 1), onOpenDetail}));
      await settle();
    });
    expect(api.listPolls).toHaveBeenLastCalledWith('A1', 1);
    expect(rendered(renderer)).toContain('아주 오래된 투표');
    await press(renderer, '아주 오래된 투표 밥 투표 상세 보기');
    expect(onOpenDetail).toHaveBeenCalledWith(21);

    expect(rendered(renderer)).toContain('예정된 투표');
    expect(renderer.root.findAll((node) => node.type === 'Eyebrow' && nodeText(node) === '진행 중인 투표')).toHaveLength(0);
  });

  it('keeps manual queryless refresh latest-wins', async () => {
    const first = deferred();
    const second = deferred();
    const api = createApi({
      listPolls: vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollListScreen, listProps(api, 1)));
      first.resolve(pollList([mealPoll({title: '첫 결과'})]));
      await settle();
    });
    await act(async () => {
      findByLabel(renderer, '밥 투표 목록 새로고침').props.onPress();
      await settle();
    });
    await act(async () => {
      second.resolve(pollList([mealPoll({id: 21, title: '새로고침 결과'})]));
      await settle();
    });
    expect(rendered(renderer)).toContain('새로고침 결과');
  });

  it('shows chargedAt while preserving other-duty account privacy', async () => {
    const detail = chargedDetail({chargedByMe: false});
    const api = createApi({getPollDetail: vi.fn().mockResolvedValue(detail)});
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealPollDetailScreen, detailProps(api)));
      await settle();
    });
    expect(rendered(renderer)).toContain(new Date('2026-07-13T03:00:00.000Z').toLocaleString());
    expect(rendered(renderer)).not.toContain('paymentAccountId');
    expect(rendered(renderer)).not.toContain('110-000');
  });

  it('requires cancel or explicit confirmation before deactivating an account', async () => {
    const api = createApi({getMyPaymentAccounts: vi.fn().mockResolvedValue([mealAccount()])});
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealAccountScreen, accountProps(api)));
      await settle();
    });
    await press(renderer, '점심 계좌 밥 계좌 비활성화');
    await press(renderer, '계좌 비활성화 취소');
    expect(api.deactivatePaymentAccount).not.toHaveBeenCalled();

    api.deactivatePaymentAccount.mockResolvedValue({...mealAccount(), isActive: false, deactivatedAt: '2026-07-14T01:00:00.000Z'});
    api.getMyPaymentAccounts.mockResolvedValueOnce([{...mealAccount(), isActive: false, deactivatedAt: '2026-07-14T01:00:00.000Z'}]);
    await press(renderer, '점심 계좌 밥 계좌 비활성화');
    const confirm = findByLabel(renderer, '점심 계좌 비활성화 확인');
    await act(async () => {
      confirm.props.onPress();
      confirm.props.onPress();
      await settle();
    });
    expect(api.deactivatePaymentAccount).toHaveBeenCalledTimes(1);
  });

  it('renders the documented aggregate settlement summary and members', async () => {
    const summary = {totalAmount: 60000, unpaidAmount: 60000, paidAmount: 0, waivedAmount: 0, canceledAmount: 0};
    const api = createApi({
      getMySettlement: vi.fn().mockResolvedValue({
        campusId: 1, campusName: '샘플 캠퍼스', region: '서울', summary,
        members: [{userId: 8, name: '멤버 1', email: 'member@example.test', ...summary}],
      }),
    });
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealSettlementScreen, settlementProps(api)));
      await settle();
    });
    expect(rendered(renderer)).toContain('멤버 1');
    expect(rendered(renderer)).toContain('60,000');
  });

  it('progressively renders large settlement member collections without a nested list', async () => {
    const summary = {totalAmount: 1000, unpaidAmount: 1000, paidAmount: 0, waivedAmount: 0, canceledAmount: 0};
    const members = Array.from({length: 30}, (_, index) => ({
      userId: index + 1,
      name: `정산 멤버 ${index + 1}`,
      email: `member${index + 1}@example.test`,
      ...summary,
    }));
    const api = createApi({getMySettlement: vi.fn().mockResolvedValue({
      campusId: 1, campusName: '샘플 캠퍼스', region: '서울', summary, members,
    })});
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(MealSettlementScreen, settlementProps(api)));
      await settle();
    });

    expect(rendered(renderer)).toContain('정산 멤버 24');
    expect(rendered(renderer)).not.toContain('정산 멤버 25');
    expect(renderer.root.findAll((node) => node.type === 'FlatList')).toHaveLength(0);
    await press(renderer, '밥 정산 멤버 더 보기');
    expect(rendered(renderer)).toContain('정산 멤버 30');
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
    currentUserId: 7,
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
    currentUserId: 7,
    onBack: vi.fn(),
    onSessionExpired: vi.fn(),
  };
}

function chargeProps(api) {
  return {
    api,
    campusId: 1,
    currentUserId: 7,
    onBack: vi.fn(),
    onComplete: vi.fn(),
    onSessionExpired: vi.fn(),
    pollId: 101,
  };
}

function settlementProps(api) {
  return {api, campusId: 1, currentUserId: 7, onBack: vi.fn(), onSessionExpired: vi.fn()};
}

function authenticatedState() {
  return {
    status: 'authenticated',
    user: {
      id: 7,
      email: 'faithlog.user@example.test',
      name: '샘플 사용자',
      role: 'USER',
    },
    selectedCampus: {
      campusId: 1,
      campusName: '샘플 캠퍼스',
      campusRole: 'MEMBER',
      status: 'ACTIVE',
    },
    activeCampuses: [],
  };
}

function mealPoll(patch = {}) {
  return {
    id: 101,
    title: '점심 투표',
    startsAt: '2026-07-13T01:00:00.000Z',
    endsAt: '2026-07-14T01:00:00.000Z',
    status: 'CLOSED',
    settlementStatus: 'NOT_CHARGED',
    ...patch,
  };
}

function mealDetail(patch = {}) {
  return {
    id: 101,
    campusId: 1,
    title: '점심 투표',
    pollType: 'MEAL',
    selectionType: 'SINGLE',
    isAnonymous: false,
    allowUserOptionAdd: true,
    startsAt: '2026-07-13T01:00:00.000Z',
    endsAt: '2026-07-14T01:00:00.000Z',
    status: 'CLOSED',
    options: [{
      optionId: 1001,
      content: '제육볶음',
      responseCount: 3,
      userAdded: false,
      charge: {chargeStatus: 'NOT_CHARGED', calculationType: null, enteredAmount: null, amountPerMember: null, requestedTotalAmount: null, actualTotalAmount: null, roundingAdjustment: null, paymentAccountId: null, chargedByMe: false, chargedAt: null},
    }],
    ...patch,
  };
}

function chargedDetail({chargedByMe}) {
  return {
    ...mealDetail(),
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

function pollList(content, page = 0, totalElements = content.length, totalPages = content.length ? 1 : 0) {
  return {content, page, size: 20, totalElements, totalPages};
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

function isDescendantOf(node, possibleAncestor) {
  let current = node.parent;
  while (current) {
    if (current === possibleAncestor) return true;
    current = current.parent;
  }
  return false;
}

function nodeText(node) {
  return node.children.filter((child) => typeof child === 'string').join('');
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
