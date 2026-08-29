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
  fetchAdminPollMissingMembers: vi.fn(),
  fetchPollResults: vi.fn(),
  fetchPolls: vi.fn(),
  getAccessUrls: vi.fn(),
  resolveCurrentAccessToken: vi.fn(),
  savePollResponse: vi.fn(),
  sendAdminPollMissingNotification: vi.fn(),
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

vi.mock('../../api/adminPollApi', () => ({
  fetchAdminPollMissingMembers: mocks.fetchAdminPollMissingMembers,
  sendAdminPollMissingNotification: mocks.sendAdminPollMissingNotification,
}));

vi.mock('../../media/mediaApi', () => ({
  mediaApi: {getAccessUrls: mocks.getAccessUrls},
}));

vi.mock('../../analytics/useAnalyticsScreen', () => ({
  useAnalyticsScreen: vi.fn(),
}));

vi.mock('../../analytics/appAnalytics', () => ({
  trackPollResponseComplete: vi.fn(),
}));

import {FaithLogApiError} from '../../api/client';
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
    mocks.fetchAdminPollMissingMembers.mockReset().mockResolvedValue([]);
    mocks.sendAdminPollMissingNotification.mockReset().mockResolvedValue({
      notificationRequestId: 'poll-reminder-1',
      queuedCount: 0,
      skippedCount: 0,
    });
    mocks.getAccessUrls.mockReset();
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

      expect(findAllByLabel(renderer, '공지 탭으로 이동')).toHaveLength(1);
      expect(findAllByLabel(renderer, '투표 공지 내용')).toHaveLength(1);
      expect(tabLabels(renderer)).toEqual([
        '공지 탭으로 이동',
        '응답 탭으로 이동',
        '댓글 탭으로 이동',
        '결과 탭으로 이동',
      ]);
      expect(mocks.fetchPollDetail).toHaveBeenCalledTimes(1);
      expect(mocks.fetchPollComments).toHaveBeenCalledTimes(1);
      expect(mocks.fetchPollResults).toHaveBeenCalledTimes(1);
      expect(mocks.getAccessUrls).toHaveBeenCalledTimes(1);

      expect(rendered(renderer)).toContain('이미지를 불러오지 못했습니다.');
      expect(findAllByLabel(renderer, `투표 공지 ${detail.notice}`)).toHaveLength(1);

      await act(async () => {
        findByLabel(renderer, '응답 탭으로 이동').props.onPress();
      });

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
        findByLabel(renderer, '공지 탭으로 이동').props.onPress();
      });
      await act(async () => {
        await findByLabel(renderer, '투표 공지 이미지 다시 불러오기').props.onPress();
        await settle();
      });
      expect(findAllByLabel(renderer, '투표 공지 이미지')).toHaveLength(1);
      expect(rendered(renderer)).not.toContain('이미지를 불러오지 못했습니다.');
      await act(async () => {
        findByLabel(renderer, '응답 탭으로 이동').props.onPress();
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
    },
  );

  it('shows the confirmed production notice tab with the shared native cache boundary', async () => {
    vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('EXPO_PUBLIC_MOCK_MODE', 'false');
    mocks.getAccessUrls.mockReset();
    mocks.getAccessUrls.mockResolvedValue([mediaAccessUrl()]);
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

    expect(findAllByLabel(renderer, '공지 탭으로 이동')).toHaveLength(1);
    expect(tabLabels(renderer)).toEqual([
      '공지 탭으로 이동',
      '응답 탭으로 이동',
      '댓글 탭으로 이동',
      '결과 탭으로 이동',
    ]);
    expect(findAllByLabel(renderer, `투표 공지 ${detail.notice}`)).toHaveLength(1);
    expect(mocks.getAccessUrls).toHaveBeenCalledWith('A1', 1, [900]);
    await act(async () => {
      findByLabel(renderer, '응답 탭으로 이동').props.onPress();
    });
    expect(findByLabel(renderer, '첫 번째 선택지 선택됨').props.accessibilityState)
      .toMatchObject({checked: true});
    expect(findByLabel(renderer, '투표 항목 추가')).toBeDefined();
    expect(mocks.fetchPollDetail).toHaveBeenCalledTimes(1);
  });

  it('consumes a production notification target and loads confirmed detail without media', async () => {
    vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('EXPO_PUBLIC_MOCK_MODE', 'false');
    mocks.getAccessUrls.mockReset();
    mocks.getAccessUrls.mockResolvedValue([mediaAccessUrl()]);
    const props = screenProps(45);

    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollScreen, props));
      await settle();
    });

    expect(props.onNotificationPollHandled).toHaveBeenCalledTimes(1);
    expect(mocks.fetchPollDetail).toHaveBeenCalledOnce();
    expect(mocks.fetchPollComments).toHaveBeenCalledOnce();
    expect(mocks.fetchPollResults).toHaveBeenCalledOnce();
    expect(mocks.getAccessUrls).toHaveBeenCalledWith('A1', 1, [900]);
    expect(findAllByLabel(renderer, '투표 공지 내용')).toHaveLength(1);
  });

  it('shows and loads an image-only notice even when the notice text is blank', async () => {
    mocks.getAccessUrls.mockReset();
    mocks.getAccessUrls.mockResolvedValue([mediaAccessUrl()]);
    const detail = {...pollDetail('SINGLE'), notice: null, hasNotice: true};
    mocks.fetchPollDetail.mockResolvedValue(detail);
    mocks.fetchPollResults.mockResolvedValue(pollResults(detail));

    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollScreen, screenProps(detail.id)));
      await settle();
    });

    expect(findAllByLabel(renderer, '공지 탭으로 이동')).toHaveLength(1);
    expect(findAllByLabel(renderer, '투표 공지 내용')).toHaveLength(1);
    expect(findAllByLabel(renderer, '투표 공지 이미지')).toHaveLength(1);
    expect(mocks.getAccessUrls).toHaveBeenCalledWith('A1', 1, [900]);
  });

  it.each([
    {notice: null},
    {notice: undefined},
  ])('keeps the exact three-tab layout when notice is $notice', async ({notice}) => {
    const detail = {...pollDetail('SINGLE'), notice, imageAssetIds: []};
    mocks.fetchPollDetail.mockResolvedValue(detail);
    mocks.fetchPollResults.mockResolvedValue(pollResults(detail));

    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollScreen, screenProps(detail.id)));
      await settle();
    });

    expect(findAllByLabel(renderer, '응답 탭으로 이동')).toHaveLength(1);
    expect(findAllByLabel(renderer, '댓글 탭으로 이동')).toHaveLength(1);
    expect(findAllByLabel(renderer, '결과 탭으로 이동')).toHaveLength(1);
    expect(findAllByLabel(renderer, '공지 탭으로 이동')).toHaveLength(0);
    expect(findAllByLabel(renderer, '투표 공지 내용')).toHaveLength(0);
    expect(tabLabels(renderer)).toEqual([
      '응답 탭으로 이동',
      '댓글 탭으로 이동',
      '결과 탭으로 이동',
    ]);
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

  it('lets an authorized poll manager confirm one notification request for every missing member', async () => {
    const detail = {...pollDetail('SINGLE'), manageableByMe: true};
    mocks.fetchPollDetail.mockResolvedValue(detail);
    mocks.fetchPollResults.mockResolvedValue(pollResults(detail));
    mocks.fetchAdminPollMissingMembers.mockResolvedValue([
      {userId: 11, name: '미응답 한명', email: 'missing1@example.test'},
      {userId: 12, name: '미응답 두명', email: 'missing2@example.test'},
    ]);
    mocks.sendAdminPollMissingNotification.mockResolvedValue({
      notificationRequestId: 'poll-reminder-2',
      queuedCount: 1,
      skippedCount: 1,
    });

    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollScreen, screenProps(detail.id, 1, {
        canOpenAdminMode: true,
      })));
      await settle();
    });
    await act(async () => {
      findByLabel(renderer, '결과 탭으로 이동').props.onPress();
    });

    expect(findByLabel(renderer, '투표 미응답자 알림 보내기')).toBeDefined();
    await act(async () => {
      await findByLabel(renderer, '투표 미응답자 알림 보내기').props.onPress();
      await settle();
    });
    expect(mocks.fetchAdminPollMissingMembers).toHaveBeenCalledWith('A1', 1, detail.id);
    const confirm = findByLabel(renderer, '투표 미응답자 알림 보내기 확인');
    await act(async () => {
      await Promise.all([confirm.props.onPress(), confirm.props.onPress()]);
      await settle();
    });

    expect(mocks.sendAdminPollMissingNotification).toHaveBeenCalledTimes(1);
    expect(mocks.sendAdminPollMissingNotification).toHaveBeenCalledWith('A1', 1, {
      notificationType: 'CUSTOM',
      targetUserIds: [11, 12],
      targetWeekStartDate: null,
      targetId: detail.id,
      title: '투표 응답 알림',
      body: `${detail.title} 투표에 응답해 주세요.`,
    });
    expect(rendered(renderer)).toContain('1명 알림 접수 · 1명 제외');
    expect(findAllByLabel(renderer, '투표 미응답자 알림 보내기')).toHaveLength(0);
  });

  it('refreshes missing members at confirmation time and excludes a member who just responded', async () => {
    const detail = {...pollDetail('SINGLE'), manageableByMe: true};
    mocks.fetchPollDetail.mockResolvedValue(detail);
    mocks.fetchPollResults.mockResolvedValue(pollResults(detail));
    mocks.fetchAdminPollMissingMembers
      .mockResolvedValueOnce([
        {userId: 11, name: '방금 응답할 멤버', email: 'responded@example.test'},
        {userId: 12, name: '계속 미응답 멤버', email: 'missing@example.test'},
      ])
      .mockResolvedValueOnce([
        {userId: 12, name: '계속 미응답 멤버', email: 'missing@example.test'},
      ]);

    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollScreen, screenProps(detail.id, 1, {
        canOpenAdminMode: true,
      })));
      await settle();
    });
    await act(async () => {
      findByLabel(renderer, '결과 탭으로 이동').props.onPress();
    });
    await act(async () => {
      await findByLabel(renderer, '투표 미응답자 알림 보내기').props.onPress();
      await settle();
    });
    await act(async () => {
      await findByLabel(renderer, '투표 미응답자 알림 보내기 확인').props.onPress();
      await settle();
    });

    expect(mocks.fetchAdminPollMissingMembers).toHaveBeenCalledTimes(2);
    expect(mocks.sendAdminPollMissingNotification).toHaveBeenCalledWith(
      'A1',
      1,
      expect.objectContaining({targetUserIds: [12]}),
    );
  });

  it('shows an alert-specific message when another notification request is already running', async () => {
    const detail = {...pollDetail('SINGLE'), manageableByMe: true};
    const members = [{userId: 11, name: '미응답 멤버', email: 'missing@example.test'}];
    mocks.fetchPollDetail.mockResolvedValue(detail);
    mocks.fetchPollResults.mockResolvedValue(pollResults(detail));
    mocks.fetchAdminPollMissingMembers.mockResolvedValue(members);
    mocks.sendAdminPollMissingNotification.mockRejectedValue(new FaithLogApiError({
      kind: 'conflict',
      status: 409,
      code: 'NOTIFICATION_LOCK_ALREADY_RUNNING',
      message: 'raw conflict',
    }));

    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollScreen, screenProps(detail.id, 1, {
        canOpenAdminMode: true,
      })));
      await settle();
    });
    await act(async () => {
      findByLabel(renderer, '결과 탭으로 이동').props.onPress();
    });
    await act(async () => {
      await findByLabel(renderer, '투표 미응답자 알림 보내기').props.onPress();
      await settle();
    });
    await act(async () => {
      await findByLabel(renderer, '투표 미응답자 알림 보내기 확인').props.onPress();
      await settle();
    });

    expect(rendered(renderer)).toContain(
      '이미 알림 요청을 처리하고 있습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(rendered(renderer)).not.toContain('최신 상태와 충돌했습니다');
  });

  it('closes the previous campus detail before loading the next campus', async () => {
    const detail = {...pollDetail('SINGLE'), manageableByMe: true};
    mocks.fetchPollDetail.mockResolvedValue(detail);
    mocks.fetchPollResults.mockResolvedValue(pollResults(detail));

    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollScreen, screenProps(detail.id, 1, {
        canOpenAdminMode: true,
      })));
      await settle();
    });
    await act(async () => {
      findByLabel(renderer, '결과 탭으로 이동').props.onPress();
      renderer.update(React.createElement(PollScreen, screenProps(null, 2, {
        campusId: 2,
        canOpenAdminMode: true,
      })));
      await settle();
    });

    expect(findAllByLabel(renderer, '투표 미응답자 알림 보내기')).toHaveLength(0);
    expect(rendered(renderer)).not.toContain(detail.title);
  });

  it.each([
    {canOpenAdminMode: false, manageableByMe: true},
    {canOpenAdminMode: true, manageableByMe: false},
  ])(
    'hides the reminder action when admin=$canOpenAdminMode and manageable=$manageableByMe',
    async ({canOpenAdminMode, manageableByMe}) => {
      const detail = {...pollDetail('SINGLE'), manageableByMe};
      mocks.fetchPollDetail.mockResolvedValue(detail);
      mocks.fetchPollResults.mockResolvedValue(pollResults(detail));

      let renderer;
      await act(async () => {
        renderer = create(React.createElement(PollScreen, screenProps(detail.id, 1, {
          canOpenAdminMode,
        })));
        await settle();
      });
      await act(async () => {
        findByLabel(renderer, '결과 탭으로 이동').props.onPress();
      });

      expect(findAllByLabel(renderer, '투표 미응답자 알림 보내기')).toHaveLength(0);
      expect(mocks.fetchAdminPollMissingMembers).not.toHaveBeenCalled();
      expect(mocks.sendAdminPollMissingNotification).not.toHaveBeenCalled();
    },
  );

  it('does not open confirmation or send when every member already responded', async () => {
    const detail = {...pollDetail('SINGLE'), manageableByMe: true};
    mocks.fetchPollDetail.mockResolvedValue(detail);
    mocks.fetchPollResults.mockResolvedValue(pollResults(detail));
    mocks.fetchAdminPollMissingMembers.mockResolvedValue([]);

    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollScreen, screenProps(detail.id, 1, {
        canOpenAdminMode: true,
      })));
      await settle();
    });
    await act(async () => {
      findByLabel(renderer, '결과 탭으로 이동').props.onPress();
    });
    await act(async () => {
      await findByLabel(renderer, '투표 미응답자 알림 보내기').props.onPress();
      await settle();
    });

    expect(findAllByLabel(renderer, '투표 미응답자 알림 보내기 확인')).toHaveLength(0);
    expect(mocks.sendAdminPollMissingNotification).not.toHaveBeenCalled();
    expect(rendered(renderer)).toContain('모든 멤버가 응답했습니다.');
  });
});

function screenProps(notificationPollId, notificationCampusId = 1, patch = {}) {
  return {
    androidContentBottomPadding: 0,
    canOpenAdminMode: patch.canOpenAdminMode ?? false,
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
        campusId: patch.campusId ?? 1,
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
    sha256: '9'.repeat(64),
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

function tabLabels(renderer) {
  return renderer.root
    .findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'tab')
    .map((node) => node.props.accessibilityLabel);
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
