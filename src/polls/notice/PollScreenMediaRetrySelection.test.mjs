import React from 'react';
import {act, create} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  addUserPollOption: vi.fn(),
  createPollComment: vi.fn(),
  deletePollComment: vi.fn(),
  fetchCoffeeBrands: vi.fn(),
  fetchCoffeeMenus: vi.fn(),
  fetchPollComments: vi.fn(),
  fetchPollDetail: vi.fn(),
  fetchPollResults: vi.fn(),
  fetchPolls: vi.fn(),
  getAccessUrls: vi.fn(),
  resolveCurrentAccessToken: vi.fn(),
  savePollResponse: vi.fn(),
  updatePollComment: vi.fn(),
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name) => ({children, ...props}) =>
    ReactModule.createElement(name, props, children);
  return {
    FlatList: ({data = [], renderItem, ...props}) => ReactModule.createElement(
      'FlatList',
      props,
      renderItem
        ? data.map((item, index) => ReactModule.createElement(
            ReactModule.Fragment,
            {key: item.assetId ?? item.id ?? item.localId ?? index},
            renderItem({item, index}),
          ))
        : null,
    ),
    Image: host('Image'),
    KeyboardAvoidingView: host('KeyboardAvoidingView'),
    Modal: ({children, visible, ...props}) => visible
      ? ReactModule.createElement('Modal', props, children)
      : null,
    Platform: {OS: 'ios'},
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    SectionList: ({ListHeaderComponent}) => ReactModule.createElement(
      'SectionList',
      null,
      ListHeaderComponent,
    ),
    StyleSheet: {create: (styles) => styles},
    Text: host('Text'),
    TextInput: host('TextInput'),
    View: host('View'),
  };
});

vi.mock('../../components/IconexIcon', async () => {
  const ReactModule = await import('react');
  return {IconexIcon: (props) => ReactModule.createElement('IconexIcon', props)};
});

vi.mock('../../components/ui', async () => {
  const ReactModule = await import('react');
  const host = (name) => ({children, ...props}) =>
    ReactModule.createElement(name, props, children);
  return {
    Body: host('Body'),
    Button: host('Button'),
    Card: host('Card'),
    Chip: host('Chip'),
    Conflict: host('Conflict'),
    Empty: host('Empty'),
    ErrorState: host('ErrorState'),
    Eyebrow: host('Eyebrow'),
    FaithLogHeaderIconButton: host('FaithLogHeaderIconButton'),
    FaithLogHeaderPillButton: host('FaithLogHeaderPillButton'),
    FaithLogHeaderTopRow: host('FaithLogHeaderTopRow'),
    Loading: host('Loading'),
    Offline: host('Offline'),
    PermissionDenied: host('PermissionDenied'),
    Title: host('Title'),
  };
});

vi.mock('../../auth/accessTokenResolver', () => ({
  resolveCurrentAccessToken: mocks.resolveCurrentAccessToken,
}));

vi.mock('../../api/tokenStorage', () => ({
  getAuthSessionGeneration: vi.fn(() => 1),
}));

vi.mock('../../api/client', () => {
  class TestFaithLogApiError extends Error {
    constructor(detail) {
      super(detail.message);
      this.detail = detail;
    }
  }
  return {
    addUserPollOption: mocks.addUserPollOption,
    createPollComment: mocks.createPollComment,
    deletePollComment: mocks.deletePollComment,
    FaithLogApiError: TestFaithLogApiError,
    fetchCoffeeBrands: mocks.fetchCoffeeBrands,
    fetchCoffeeMenus: mocks.fetchCoffeeMenus,
    fetchPollComments: mocks.fetchPollComments,
    fetchPollDetail: mocks.fetchPollDetail,
    fetchPollResults: mocks.fetchPollResults,
    fetchPolls: mocks.fetchPolls,
    savePollResponse: mocks.savePollResponse,
    updatePollComment: mocks.updatePollComment,
  };
});

vi.mock('../../media/mediaApi', () => ({
  mediaApi: {getAccessUrls: mocks.getAccessUrls},
}));

vi.mock('../../analytics/useAnalyticsScreen', () => ({
  useAnalyticsScreen: vi.fn(),
}));

vi.mock('../../analytics/appAnalytics', () => ({
  trackPollResponseComplete: vi.fn(),
}));

import {PollScreen} from '../PollScreen';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('PollScreen notice media retry preserves unsaved response selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'development');
    vi.stubEnv('EXPO_PUBLIC_MOCK_MODE', 'true');
    mocks.resolveCurrentAccessToken.mockResolvedValue('A1');
    mocks.fetchPolls.mockResolvedValue([]);
    mocks.fetchPollComments.mockResolvedValue([]);
    mocks.getAccessUrls
      .mockRejectedValueOnce(new Error('initial media failure'))
      .mockResolvedValueOnce([mediaAccessUrl()]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    {selectionType: 'SINGLE', selectedOptions: ['첫 번째']},
    {selectionType: 'MULTIPLE', selectedOptions: ['첫 번째', '두 번째']},
  ])(
    'keeps $selectionType draft selections while retrying only notice media',
    async ({selectionType, selectedOptions}) => {
      const detail = pollDetail(selectionType);
      mocks.fetchPollDetail.mockResolvedValue(detail);
      mocks.fetchPollResults.mockResolvedValue(pollResults(detail));

      let renderer;
      await act(async () => {
        renderer = create(React.createElement(PollScreen, screenProps(detail.id)));
        await settle();
      });

      expect(rendered(renderer)).toContain('이미지를 불러오지 못했습니다.');
      expect(mocks.fetchPollDetail).toHaveBeenCalledTimes(1);
      expect(mocks.fetchPollComments).toHaveBeenCalledTimes(1);
      expect(mocks.fetchPollResults).toHaveBeenCalledTimes(1);
      expect(mocks.getAccessUrls).toHaveBeenCalledTimes(1);

      await act(async () => {
        for (const option of selectedOptions) {
          findByLabel(renderer, `${option} 선택지`).props.onPress();
        }
      });

      for (const option of selectedOptions) {
        expect(findByLabel(renderer, `${option} 선택지 선택됨`).props.accessibilityState)
          .toMatchObject({checked: true});
      }
      expect(mocks.savePollResponse).not.toHaveBeenCalled();

      await act(async () => {
        await findByLabel(renderer, '투표 공지 이미지 다시 불러오기').props.onPress();
        await settle();
      });

      for (const option of selectedOptions) {
        expect(findByLabel(renderer, `${option} 선택지 선택됨`).props.accessibilityState)
          .toMatchObject({checked: true});
      }
      expect(mocks.fetchPollDetail).toHaveBeenCalledTimes(1);
      expect(mocks.fetchPollComments).toHaveBeenCalledTimes(1);
      expect(mocks.fetchPollResults).toHaveBeenCalledTimes(1);
      expect(mocks.getAccessUrls).toHaveBeenCalledTimes(2);
      expect(mocks.getAccessUrls).toHaveBeenLastCalledWith('A1', 1, [900]);
      expect(renderer.root.findByType('Image').props.source).toEqual({
        uri: 'https://signed.invalid/900/detail',
      });
    },
  );

  it('hides production list, detail, and media surfaces while preserving ordinary poll controls', async () => {
    vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('EXPO_PUBLIC_MOCK_MODE', 'false');
    mocks.getAccessUrls.mockReset();
    const detail = {
      ...pollDetail('SINGLE'),
      allowUserOptionAdd: true,
      responded: true,
      manageableByMe: true,
      myResponse: {
        responseId: 501,
        pollId: 45,
        optionIds: [101],
        respondedAt: '2026-08-02T00:00:00.000Z',
      },
    };
    mocks.fetchPolls.mockResolvedValue([detail]);
    mocks.fetchPollDetail.mockResolvedValue(detail);
    mocks.fetchPollResults.mockResolvedValue(pollResults(detail));

    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollScreen, screenProps(null)));
      await settle();
    });

    expect(findAllByLabel(renderer, '공지 있음')).toHaveLength(0);
    act(() => {
      findByLabel(renderer, `${detail.title} 상세 보기`).props.onPress();
    });
    await act(async () => {
      await settle();
    });

    expect(findAllByLabel(renderer, `투표 공지 ${detail.notice}`)).toHaveLength(0);
    expect(findAllByLabel(renderer, '투표 공지 이미지')).toHaveLength(0);
    expect(mocks.getAccessUrls).not.toHaveBeenCalled();
    await act(async () => {
      findByLabel(renderer, '응답 탭으로 이동').props.onPress();
    });
    expect(findByLabel(renderer, '첫 번째 선택지 선택됨').props.accessibilityState)
      .toMatchObject({checked: true});
    expect(findByLabel(renderer, '투표 항목 추가')).toBeDefined();
    expect(mocks.fetchPollDetail).toHaveBeenCalledTimes(1);
  });

  it('consumes a production notification target without issuing detail or media requests', async () => {
    vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('EXPO_PUBLIC_MOCK_MODE', 'false');
    mocks.getAccessUrls.mockReset();
    const props = screenProps(45);

    await act(async () => {
      create(React.createElement(PollScreen, props));
      await settle();
    });

    expect(props.onNotificationPollHandled).toHaveBeenCalledTimes(1);
    expect(mocks.fetchPollDetail).not.toHaveBeenCalled();
    expect(mocks.fetchPollComments).not.toHaveBeenCalled();
    expect(mocks.fetchPollResults).not.toHaveBeenCalled();
    expect(mocks.getAccessUrls).not.toHaveBeenCalled();
  });

  it('consumes but never loads a notification poll target from another campus', async () => {
    mocks.getAccessUrls.mockReset();
    const props = screenProps(45, 2);

    await act(async () => {
      create(React.createElement(PollScreen, props));
      await settle();
    });

    expect(props.onNotificationPollHandled).toHaveBeenCalledTimes(1);
    expect(mocks.fetchPollDetail).not.toHaveBeenCalled();
    expect(mocks.fetchPollComments).not.toHaveBeenCalled();
    expect(mocks.fetchPollResults).not.toHaveBeenCalled();
    expect(mocks.getAccessUrls).not.toHaveBeenCalled();
  });
});

function screenProps(notificationPollId, notificationCampusId = 1) {
  return {
    androidContentBottomPadding: 0,
    canOpenAdminMode: false,
    notificationPollTarget: notificationPollId === null
      ? null
      : {campusId: notificationCampusId, pollId: notificationPollId},
    onNotificationPollHandled: vi.fn(),
    onOpenAdminMode: vi.fn(),
    onOpenNotifications: vi.fn(),
    setAuthState: vi.fn(),
    setNotice: vi.fn(),
    state: {
      status: 'authenticated',
      user: {id: 7, email: 'member@example.test', name: '테스트 사용자', role: 'USER'},
      activeCampuses: [],
      selectedCampus: {
        campusId: 1,
        campusName: '테스트 캠퍼스',
        campusRole: 'MEMBER',
        status: 'ACTIVE',
      },
    },
  };
}

function pollDetail(selectionType) {
  return {
    id: 45,
    campusId: 1,
    title: `${selectionType} 공지 투표`,
    pollType: 'CUSTOM',
    selectionType,
    isAnonymous: false,
    allowUserOptionAdd: false,
    startsAt: '2026-08-01T00:00:00.000Z',
    endsAt: '2099-08-31T00:00:00.000Z',
    status: 'OPEN',
    responded: false,
    manageableByMe: false,
    hasNotice: true,
    templateId: null,
    chargeGenerationType: 'NONE',
    paymentCategory: null,
    paymentAccountId: null,
    notice: '이미지 retry 선택 유지 공지',
    imageAssetIds: [900],
    myResponse: null,
    options: [
      {id: 101, content: '첫 번째', composeMenuCode: null, priceAmount: 0, sortOrder: 1},
      {id: 102, content: '두 번째', composeMenuCode: null, priceAmount: 0, sortOrder: 2},
      {id: 103, content: '세 번째', composeMenuCode: null, priceAmount: 0, sortOrder: 3},
    ],
  };
}

function pollResults(detail) {
  return {
    pollId: detail.id,
    campusId: detail.campusId,
    title: detail.title,
    pollType: detail.pollType,
    selectionType: detail.selectionType,
    anonymous: false,
    status: detail.status,
    startsAt: detail.startsAt,
    endsAt: detail.endsAt,
    targetMemberCount: 3,
    respondedCount: 0,
    notRespondedCount: 3,
    optionResults: detail.options.map((option) => ({
      id: option.id,
      content: option.content,
      sortOrder: option.sortOrder,
      responseCount: 0,
      respondents: [],
    })),
  };
}

function mediaAccessUrl() {
  return {
    assetId: 900,
    thumbnailUrl: 'https://signed.invalid/900/thumb',
    detailUrl: 'https://signed.invalid/900/detail',
    expiresAt: '2099-08-03T03:10:00.000Z',
  };
}

function findByLabel(renderer, label) {
  const matches = findAllByLabel(renderer, label);
  if (matches.length !== 1) {
    const availableLabels = renderer.root
      .findAll((node) => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string')
      .map((node) => node.props.accessibilityLabel);
    const hostSummary = renderer.root
      .findAll((node) => typeof node.type === 'string')
      .map((node) => `${node.type}:${node.children.filter((child) => typeof child === 'string').join('')}`);
    throw new Error(`Expected one ${label} label; found ${matches.length}. Available: ${availableLabels.join(', ')}. Hosts: ${hostSummary.join(', ')}`);
  }
  return matches[0];
}

function findAllByLabel(renderer, label) {
  return renderer.root.findAll(
    (node) => typeof node.type === 'string' && node.props.accessibilityLabel === label,
  );
}

function rendered(renderer) {
  return JSON.stringify(renderer.toJSON());
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
