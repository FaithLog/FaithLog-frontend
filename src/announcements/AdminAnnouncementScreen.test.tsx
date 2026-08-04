import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, describe, expect, it, vi} from 'vitest';

const nativeMediaMocks = vi.hoisted(() => {
  class ProcessingError extends Error {
    readonly detail = {kind: 'error', code: 'MEDIA_ASSET_PROCESSING'};
    readonly identity: {
      assetId: number;
      byteSize: number;
      contentType: 'image/jpeg';
      sha256: string;
    };

    constructor(identity: ProcessingError['identity']) {
      super('processing');
      this.identity = identity;
    }
  }
  class CompletionRejectedError extends Error {
    readonly detail: {kind: 'conflict'; message: string; status: number};
    readonly identity: ProcessingError['identity'];

    constructor(identity: ProcessingError['identity']) {
      super('completion rejected');
      this.detail = {kind: 'conflict', message: 'conflict', status: 409};
      this.identity = identity;
    }
  }
  class BinaryUploadHttpError extends Error {
    readonly status: number;
    constructor(status: number) {
      super('http upload failure');
      this.status = status;
    }
  }
  class BinaryUploadUncertainError extends Error {
    readonly context: {
      file: {byteSize: number; contentType: 'image/jpeg'; localUri: string; sha256: string};
      identity: ProcessingError['identity'];
      reservation: {
        assetId: number;
        expiresAt: string;
        requiredHeaders: Record<string, string>;
        uploadUrl: string;
      };
    };
    constructor(context: BinaryUploadUncertainError['context']) {
      super('uncertain upload');
      this.context = context;
    }
  }
  return {
    complete: vi.fn(),
    discard: vi.fn(),
    mockMode: true,
    pickAndPrepare: vi.fn(),
    CompletionRejectedError,
    BinaryUploadHttpError,
    BinaryUploadUncertainError,
    ProcessingError,
    resolveToken: vi.fn(async () => 'access-token' as string | null),
    retry: vi.fn(),
    upload: vi.fn(),
  };
});

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  const FlatList = ({
    data = [],
    initialNumToRender,
    renderItem,
    ...props
  }: {
    data?: unknown[];
    initialNumToRender?: number;
    renderItem?: (input: {index: number; item: unknown}) => React.ReactNode;
  } & Record<string, unknown>) => ReactModule.createElement(
    'FlatList',
    {data, initialNumToRender, renderItem, ...props},
    ...data.slice(0, initialNumToRender ?? data.length).map((item, index) =>
      ReactModule.createElement(ReactModule.Fragment, {key: index}, renderItem?.({index, item}))),
  );
  return {
    FlatList,
    Image: host('Image'),
    Modal: ({children, visible, ...props}: React.PropsWithChildren<{visible: boolean}>) =>
      visible ? ReactModule.createElement('Modal', props, children) : null,
    PanResponder: {create: (handlers: Record<string, unknown>) => ({panHandlers: handlers})},
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: {create: (styles: unknown) => styles},
    Switch: host('Switch'),
    Text: host('Text'),
    TextInput: host('TextInput'),
    View: host('View'),
  };
});

vi.mock('../components/ui', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  const TextField = ({accessibilityLabel, label, ...props}: Record<string, unknown>) =>
    ReactModule.createElement('TextField', {accessibilityLabel: accessibilityLabel ?? label, label, ...props});
  const ErrorState = ({
    actionAccessibilityLabel,
    actionLabel,
    onActionPress,
    ...props
  }: Record<string, unknown>) => ReactModule.createElement(
    'ErrorState',
    props,
    actionLabel && onActionPress
      ? ReactModule.createElement('Button', {
          accessibilityLabel: actionAccessibilityLabel ?? actionLabel,
          onPress: onActionPress,
        }, String(actionLabel))
      : null,
  );
  return {
    Button: host('Button'),
    Card: host('Card'),
    Empty: host('Empty'),
    ErrorState,
    Loading: host('Loading'),
    ScreenHeader: host('ScreenHeader'),
    TextField,
  };
});

vi.mock('../auth/accessTokenResolver', () => ({
  resolveCurrentAccessToken: nativeMediaMocks.resolveToken,
}));

vi.mock('../api/client', () => {
  class TestFaithLogApiError extends Error {
    detail: unknown;

    constructor(detail: {message: string}) {
      super(detail.message);
      this.detail = detail;
    }
  }
  return {apiRequest: vi.fn(), FaithLogApiError: TestFaithLogApiError};
});

vi.mock('./announcementEnvironment', () => ({
  isAnnouncementMockModeEnabled: () => nativeMediaMocks.mockMode,
}));

vi.mock('./AnnouncementCachedImage', async () => {
  const ReactModule = await import('react');
  return {
    AnnouncementCachedImage: (props: Record<string, unknown>) =>
      ReactModule.createElement('AnnouncementCachedImage', props),
  };
});

vi.mock('./announcementNativeMedia', () => ({
  createNativeAnnouncementBinaryUploader: () => vi.fn(),
  discardPreparedAnnouncementImages: nativeMediaMocks.discard,
  pickAndPrepareAnnouncementImages: nativeMediaMocks.pickAndPrepare,
}));

vi.mock('./announcementUploadFlow', () => ({
  MediaBinaryUploadHttpError: nativeMediaMocks.BinaryUploadHttpError,
  MediaBinaryUploadUncertainError: nativeMediaMocks.BinaryUploadUncertainError,
  MediaAssetCompletionRejectedError: nativeMediaMocks.CompletionRejectedError,
  MediaAssetProcessingError: nativeMediaMocks.ProcessingError,
  retryAnnouncementImageUpload: nativeMediaMocks.retry,
  resumeAnnouncementImageCompletion: nativeMediaMocks.complete,
  uploadAnnouncementImage: nativeMediaMocks.upload,
}));

import {
  AdminAnnouncementScreen,
  AnnouncementCategoryScreen,
  AnnouncementEditorScreen,
} from './AdminAnnouncementScreen';
import {DutyDateTimePickerModal} from '../duty/DutyDateTimePicker';
import type {AnnouncementApi} from './announcementApi';
import type {
  AnnouncementCategory,
  AnnouncementDetail,
  AnnouncementStatus,
} from './announcementTypes';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const worshipCategory: AnnouncementCategory = {
  color: '#3182F6',
  id: 1,
  isActive: true,
  name: '예배',
  sortOrder: 1,
};
const communityCategory: AnnouncementCategory = {
  color: '#22C55E',
  id: 2,
  isActive: true,
  name: '공동체',
  sortOrder: 2,
};
const inactiveCategory: AnnouncementCategory = {
  color: '#EF4444',
  id: 3,
  isActive: false,
  name: '지난 소식',
  sortOrder: 3,
};

const publishedAnnouncement = announcement({
  id: 101,
  status: 'PUBLISHED',
  title: '게시된 공지',
});
const scheduledAnnouncement = announcement({
  id: 102,
  publishAt: '2030-01-02T01:35:00.000Z',
  publishedAt: null,
  status: 'SCHEDULED',
  title: '예약 공지',
});

describe('AdminAnnouncementScreen rendered interactions', () => {
  afterEach(() => {
    nativeMediaMocks.mockMode = true;
    vi.clearAllMocks();
    nativeMediaMocks.resolveToken.mockResolvedValue('access-token');
  });

  it('keeps admin announcement cards text-only and does not request image URLs for the list', async () => {
    const withImage = announcement({id: 111, imageAssetIds: [77, 78], title: '이미지 공지'});
    const getMediaAccessUrls = vi.fn(async () => [mediaAccess(77)]);
    const api = createApi({getMediaAccessUrls, listAdmin: vi.fn(async () => [withImage])});
    const renderer = await render(
      <AdminAnnouncementScreen api={api} campusId={1} onBack={vi.fn()} userId={42} />,
    );

    expect(rendered(renderer)).toContain('이미지 공지');
    expect(byLabel(renderer, '이미지 공지 관리 카드')).toBeTruthy();
    expect(getMediaAccessUrls).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType('AnnouncementCachedImage' as never)).toHaveLength(0);
  });

  it('shows the original published time instead of a later edit publishAt value', async () => {
    const publishedAt = '2030-01-01T00:00:00.000Z';
    const editedPublishAt = '2030-01-03T00:00:00.000Z';
    const renderer = await render(
      <AdminAnnouncementScreen
        api={createApi({
          listAdmin: vi.fn(async () => [announcement({
            id: 112,
            publishAt: editedPublishAt,
            publishedAt,
            status: 'PUBLISHED',
            title: '게시 후 수정 공지',
          })]),
        })}
        campusId={1}
        onBack={vi.fn()}
      />,
    );
    const publishedLabel = new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(publishedAt));
    const editedLabel = new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(editedPublishAt));

    expect(rendered(renderer)).toContain(publishedLabel);
    expect(rendered(renderer)).not.toContain(editedLabel);
  });

  it('publishes a scheduled announcement only after confirmation and suppresses a synchronous double tap', async () => {
    const publishGate = deferred<AnnouncementDetail>();
    const api = createApi({
      listAdmin: vi.fn(async (_token, _campusId, status: AnnouncementStatus) =>
        status === 'SCHEDULED' ? [scheduledAnnouncement] : [publishedAnnouncement]),
      publishAnnouncement: vi.fn(() => publishGate.promise),
    });
    const renderer = await render(<AdminAnnouncementScreen api={api} campusId={1} onBack={vi.fn()} />);

    await press(renderer, '게시 예정 공지 보기');
    await press(renderer, '예약 공지 게시 확인 열기');
    expect(api.publishAnnouncement).not.toHaveBeenCalled();
    expect(byLabel(renderer, '예약 공지 게시 확인')).toBeTruthy();

    await pressTwiceWithoutRender(renderer, '예약 공지 게시 확인 실행');
    expect(api.publishAnnouncement).toHaveBeenCalledTimes(1);
    expect(api.publishAnnouncement).toHaveBeenCalledWith('access-token', 1, 102);

    await act(async () => {
      publishGate.resolve({...scheduledAnnouncement, status: 'PUBLISHED'});
      await settle();
    });
  });

  it('invalidates the previous status rows synchronously while a newly selected tab loads', async () => {
    const scheduledLoad = deferred<AnnouncementDetail[]>();
    const api = createApi({
      listAdmin: vi.fn((_token, _campusId, status: AnnouncementStatus) =>
        status === 'SCHEDULED'
          ? scheduledLoad.promise
          : Promise.resolve([publishedAnnouncement])),
    });
    const renderer = await render(
      <AdminAnnouncementScreen api={api} campusId={1} onBack={vi.fn()} />,
    );
    expect(rendered(renderer)).toContain('게시된 공지');

    await press(renderer, '게시 예정 공지 보기');

    expect(renderer.root.findByType('Loading' as never).props.message)
      .toBe('공지 목록을 불러오고 있습니다.');
    expect(rendered(renderer)).not.toContain('게시된 공지');
    expect(byLabel(renderer, '게시 예정 공지 보기').props.accessibilityState)
      .toEqual({selected: true});

    await act(async () => {
      scheduledLoad.resolve([scheduledAnnouncement]);
      await settle();
    });
    expect(rendered(renderer)).toContain('예약 공지');
  });

  it('archives only after confirmation and suppresses a synchronous double tap', async () => {
    const archiveGate = deferred<void>();
    const api = createApi({
      archiveAnnouncement: vi.fn(() => archiveGate.promise),
      listAdmin: vi.fn(async () => [publishedAnnouncement]),
    });
    const renderer = await render(<AdminAnnouncementScreen api={api} campusId={1} onBack={vi.fn()} />);

    await press(renderer, '게시된 공지 보관 확인 열기');
    expect(api.archiveAnnouncement).not.toHaveBeenCalled();
    expect(byLabel(renderer, '게시된 공지 보관 확인')).toBeTruthy();
    await pressTwiceWithoutRender(renderer, '게시된 공지 보관 확인 실행');
    expect(api.archiveAnnouncement).toHaveBeenCalledTimes(1);

    await act(async () => {
      archiveGate.resolve();
      await settle();
    });
  });

  it('does not expose edit for an archived announcement that cannot preserve archived status', async () => {
    const archived = announcement({id: 103, status: 'ARCHIVED', title: '보관 공지'});
    const api = createApi({
      listAdmin: vi.fn(async (_token, _campusId, status: AnnouncementStatus) =>
        status === 'ARCHIVED' ? [archived] : [publishedAnnouncement]),
    });
    const renderer = await render(
      <AdminAnnouncementScreen api={api} campusId={1} onBack={vi.fn()} />,
    );

    await press(renderer, '보관됨 공지 보기');
    expect(renderer.root.findAll((node) =>
      node.props.accessibilityLabel === '보관 공지 수정')).toHaveLength(0);
  });

  it('progressively mounts large admin lists instead of eagerly rendering every row', async () => {
    const items = Array.from({length: 45}, (_, index) =>
      announcement({id: 1_000 + index, title: `대량 공지 ${index + 1}`}));
    const renderer = await render(
      <AdminAnnouncementScreen
        api={createApi({listAdmin: vi.fn(async () => items)})}
        campusId={1}
        onBack={vi.fn()}
      />,
    );

    expect(rendered(renderer)).toContain('대량 공지 20');
    expect(rendered(renderer)).not.toContain('대량 공지 21');
    await press(renderer, '관리자 공지 20개 더 보기');
    expect(rendered(renderer)).toContain('대량 공지 40');
    expect(rendered(renderer)).not.toContain('대량 공지 41');
    await press(renderer, '관리자 공지 5개 더 보기');
    expect(rendered(renderer)).toContain('대량 공지 45');
  });

  it('fails closed when an archived announcement editor is opened directly', async () => {
    const api = createApi();
    const renderer = await render(
      <AnnouncementEditorScreen
        api={api}
        campusId={1}
        detail={announcement({status: 'ARCHIVED', title: '보관 공지'})}
        onBack={vi.fn()}
      />,
    );

    expect(renderer.root.findByType('ErrorState' as never).props.message)
      .toContain('보관된 공지는 수정할 수 없습니다.');
    expect(renderer.root.findAll((node) =>
      node.props.accessibilityLabel === '공지 수정 확인 열기')).toHaveLength(0);
    expect(api.updateAnnouncement).not.toHaveBeenCalled();
  });

  it('preserves a create draft and successful mock attachment after a failed confirmed save', async () => {
    const createGate = deferred<AnnouncementDetail>();
    const onBack = vi.fn();
    const api = createApi({createAnnouncement: vi.fn(() => createGate.promise)});
    const renderer = await render(
      <AnnouncementEditorScreen api={api} campusId={1} detail={null} onBack={onBack} />,
    );

    await changeText(renderer, '제목', '새 공지');
    await changeText(renderer, '공지 본문', '실패해도 남아야 하는 본문');
    await pressTwiceWithoutRender(renderer, '샘플 이미지 추가');
    expect(renderer.root.findAll((node) =>
      String(node.type) === 'Pressable' && node.props.accessibilityLabel === '이미지 1 삭제'))
      .toHaveLength(1);

    await press(renderer, '공지 게시 확인 열기');
    expect(api.createAnnouncement).not.toHaveBeenCalled();
    await pressTwiceWithoutRender(renderer, '공지 게시 확인 실행');
    expect(api.createAnnouncement).toHaveBeenCalledTimes(1);
    expect(api.createAnnouncement).toHaveBeenCalledWith(
      'access-token',
      1,
      expect.objectContaining({imageAssetIds: [9000], title: '새 공지'}),
    );

    await act(async () => {
      createGate.reject(new Error('offline'));
      await settle();
    });
    expect(byLabel(renderer, '제목').props.value).toBe('새 공지');
    expect(byLabel(renderer, '공지 본문').props.value).toBe('실패해도 남아야 하는 본문');
    expect(byLabel(renderer, '이미지 1 삭제')).toBeTruthy();
    expect(rendered(renderer)).toContain('입력 내용과 업로드된 이미지는 그대로 보존됩니다.');
    expect(onBack).not.toHaveBeenCalled();
  });

  it('edits an existing announcement through a confirmation without dropping attachments', async () => {
    const detail = announcement({imageAssetIds: [77, 88], title: '수정 전 제목'});
    const api = createApi();
    const onBack = vi.fn();
    const renderer = await render(
      <AnnouncementEditorScreen api={api} campusId={1} detail={detail} onBack={onBack} />,
    );

    await changeText(renderer, '제목', '수정 후 제목');
    await press(renderer, '공지 수정 확인 열기');
    expect(api.updateAnnouncement).not.toHaveBeenCalled();
    await press(renderer, '공지 수정 확인 실행');

    expect(api.updateAnnouncement).toHaveBeenCalledWith(
      'access-token',
      1,
      detail.id,
      expect.objectContaining({imageAssetIds: [77, 88], title: '수정 후 제목'}),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows existing attachment thumbnails in the editor while retaining every attachment slot', async () => {
    const detail = announcement({imageAssetIds: [77, 88], title: '첨부 공지'});
    const api = createApi({
      getMediaAccessUrls: vi.fn(async () => [mediaAccess(77), mediaAccess(88)]),
    });
    const renderer = await render(
      <AnnouncementEditorScreen
        api={api}
        campusId={1}
        detail={detail}
        onBack={vi.fn()}
        userId={42}
      />,
    );

    expect(api.getMediaAccessUrls).toHaveBeenCalledWith('access-token', 1, [77, 88]);
    const previewList = byLabel(renderer, '공지 이미지 미리보기 목록');
    const previews = previewList.props.data.map((item: unknown, index: number) =>
      previewList.props.renderItem({index, item}));
    expect(previews.map((preview: React.ReactElement<{children: React.ReactElement<{assetId: number}>}>) =>
      preview.props.children.props.assetId))
      .toEqual([77, 88]);
    expect(byLabel(renderer, '이미지 1 삭제')).toBeTruthy();
    expect(byLabel(renderer, '이미지 2 삭제')).toBeTruthy();
  });

  it('exposes horizontal drag handles that reorder announcement images', async () => {
    const detail = announcement({imageAssetIds: [77, 88], title: '순서 변경 공지'});
    const renderer = await render(
      <AnnouncementEditorScreen
        api={createApi({
          getMediaAccessUrls: vi.fn(async () => [mediaAccess(77), mediaAccess(88)]),
        })}
        campusId={1}
        detail={detail}
        onBack={vi.fn()}
      />,
    );

    let previewList = byLabel(renderer, '공지 이미지 미리보기 목록');
    expect(previewList.props.horizontal).toBe(true);
    await act(async () => {
      byLabel(renderer, '이미지 1 순서 이동 핸들').props.onAccessibilityAction({
        nativeEvent: {actionName: 'increment'},
      });
      await settle();
    });

    previewList = byLabel(renderer, '공지 이미지 미리보기 목록');
    expect(previewList.props.data.map((item: {assetId: number}) => item.assetId))
      .toEqual([88, 77]);
  });

  it('keeps a missing existing attachment preview as an independently retryable editor slot', async () => {
    const detail = announcement({imageAssetIds: [77, 88], title: '부분 첨부 공지'});
    const getMediaAccessUrls = vi.fn()
      .mockResolvedValueOnce([mediaAccess(77)])
      .mockResolvedValueOnce([mediaAccess(77), mediaAccess(88)]);
    const api = createApi({getMediaAccessUrls});
    const renderer = await render(
      <AnnouncementEditorScreen
        api={api}
        campusId={1}
        detail={detail}
        onBack={vi.fn()}
        userId={42}
      />,
    );

    expect(byLabel(renderer, '이미지 2 미리보기 다시 불러오기')).toBeTruthy();
    expect(byLabel(renderer, '이미지 1 삭제')).toBeTruthy();
    await press(renderer, '이미지 2 미리보기 다시 불러오기');

    expect(getMediaAccessUrls).toHaveBeenCalledTimes(2);
    expect(renderer.root.findAllByType('AnnouncementCachedImage' as never)
      .map((node) => node.props.assetId)).toEqual([77, 88]);
  });

  it('uses an explicit publish-transition confirmation when a scheduled edit changes to NOW', async () => {
    const api = createApi();
    const renderer = await render(
      <AnnouncementEditorScreen
        api={api}
        campusId={1}
        detail={scheduledAnnouncement}
        onBack={vi.fn()}
      />,
    );

    await press(renderer, '지금 게시 방식 선택');
    await press(renderer, '공지 게시 확인 열기');
    expect(rendered(renderer)).toContain('예약 공지를 지금 게시합니다.');
    expect(api.updateAnnouncement).not.toHaveBeenCalled();
    await press(renderer, '공지 게시 확인 실행');
    expect(api.updateAnnouncement).toHaveBeenCalledWith(
      'access-token',
      1,
      scheduledAnnouncement.id,
      expect.objectContaining({
        publishAt: scheduledAnnouncement.publishAt,
        publishMode: 'SCHEDULED',
      }),
    );
    expect(api.publishAnnouncement).toHaveBeenCalledWith(
      'access-token', 1, scheduledAnnouncement.id,
    );
  });

  it('shows the exact selected date and time when editing a scheduled announcement', async () => {
    const renderer = await render(
      <AnnouncementEditorScreen
        api={createApi()}
        campusId={1}
        detail={scheduledAnnouncement}
        onBack={vi.fn()}
      />,
    );

    await press(renderer, '공지 예약 수정 확인 열기');

    expect(rendered(renderer)).toContain('2030.01.02 10:35');
    expect(byLabel(renderer, '공지 예약 수정 확인 실행')).toBeTruthy();
  });

  it('retains an inactive historical category while editing an existing announcement', async () => {
    const detail = announcement({category: inactiveCategory, title: '지난 공지'});
    const api = createApi();
    const renderer = await render(
      <AnnouncementEditorScreen api={api} campusId={1} detail={detail} onBack={vi.fn()} />,
    );

    expect(api.listCategories).toHaveBeenCalledWith('access-token', 1, true);
    expect(byLabel(renderer, '지난 소식 카테고리 선택').props.accessibilityState).toEqual({
      checked: true,
    });
    await press(renderer, '공지 수정 확인 열기');
    await press(renderer, '공지 수정 확인 실행');
    expect(api.updateAnnouncement).toHaveBeenCalledWith(
      'access-token',
      1,
      detail.id,
      expect.objectContaining({categoryId: inactiveCategory.id}),
    );
  });

  it('does not offer unrelated inactive categories while editing an active announcement', async () => {
    const api = createApi();
    const renderer = await render(
      <AnnouncementEditorScreen
        api={api}
        campusId={1}
        detail={publishedAnnouncement}
        onBack={vi.fn()}
      />,
    );

    expect(byLabel(renderer, '예배 카테고리 선택')).toBeTruthy();
    expect(renderer.root.findAll((node) =>
      node.props.accessibilityLabel === '지난 소식 카테고리 선택')).toHaveLength(0);
  });

  it('uses the accessible calendar and time modal instead of raw ISO input for scheduling', async () => {
    const api = createApi();
    const renderer = await render(
      <AnnouncementEditorScreen api={api} campusId={1} detail={null} onBack={vi.fn()} />,
    );

    await press(renderer, '예약 게시 방식 선택');
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '예약 게시 시각')).toHaveLength(0);
    await press(renderer, '예약 게시 날짜와 시간 선택');
    const picker = renderer.root.findByType(DutyDateTimePickerModal);
    expect(picker.props.visible).toBe(true);

    const selected = new Date(2099, 0, 2, 10, 35, 0, 0);
    await act(async () => {
      picker.props.onApply(selected);
      await settle();
    });
    expect(rendered(renderer)).toContain('2099.01.02 10:35');

    await changeText(renderer, '제목', '예약 제목');
    await changeText(renderer, '공지 본문', '예약 본문');
    await press(renderer, '공지 예약 확인 열기');
    expect(rendered(renderer)).toContain('2099.01.02 10:35');
    await press(renderer, '공지 예약 확인 실행');
    expect(api.createAnnouncement).toHaveBeenCalledWith(
      'access-token',
      1,
      expect.objectContaining({publishAt: selected.toISOString(), publishMode: 'SCHEDULED'}),
    );
  });

  it('keeps mock asset ids monotonic across editor remounts', async () => {
    const api = createApi();
    const createAnnouncement = vi.mocked(api.createAnnouncement);
    const firstRenderer = await render(
      <AnnouncementEditorScreen api={api} campusId={1} detail={null} onBack={vi.fn()} />,
    );
    await press(firstRenderer, '샘플 이미지 추가');
    await changeText(firstRenderer, '제목', '첫 공지');
    await changeText(firstRenderer, '공지 본문', '첫 본문');
    await press(firstRenderer, '공지 게시 확인 열기');
    await press(firstRenderer, '공지 게시 확인 실행');
    const firstAssetId = createAnnouncement.mock.calls[0]?.[2].imageAssetIds[0];

    const secondRenderer = await render(
      <AnnouncementEditorScreen api={api} campusId={1} detail={null} onBack={vi.fn()} />,
    );
    await press(secondRenderer, '샘플 이미지 추가');
    await changeText(secondRenderer, '제목', '둘째 공지');
    await changeText(secondRenderer, '공지 본문', '둘째 본문');
    await press(secondRenderer, '공지 게시 확인 열기');
    await press(secondRenderer, '공지 게시 확인 실행');
    const secondAssetId = createAnnouncement.mock.calls[1]?.[2].imageAssetIds[0];

    expect(firstAssetId).toEqual(expect.any(Number));
    expect(secondAssetId).toBeGreaterThan(firstAssetId!);
  });

  it('keeps native image uploads independent and retries only the failed item', async () => {
    nativeMediaMocks.mockMode = false;
    nativeMediaMocks.pickAndPrepare.mockResolvedValue({
      failures: [],
      prepared: [
        {byteSize: 100, contentType: 'image/jpeg', height: 80, sha256: 'a'.repeat(64), sourceIndex: 0, uri: 'file://a.jpg', width: 100},
        {byteSize: 120, contentType: 'image/jpeg', height: 80, sha256: 'b'.repeat(64), sourceIndex: 1, uri: 'file://b.jpg', width: 100},
      ],
    });
    nativeMediaMocks.upload
      .mockImplementationOnce(async ({onProgress}) => {
        onProgress(0.5);
        return {assetId: 501, status: 'READY'};
      })
      .mockRejectedValueOnce(new Error('upload failed'))
      .mockResolvedValueOnce({assetId: 502, status: 'READY'});
    const api = createApi();
    const renderer = await render(
      <AnnouncementEditorScreen api={api} campusId={1} detail={null} onBack={vi.fn()} />,
    );

    await press(renderer, '공지 이미지 선택');
    expect(nativeMediaMocks.pickAndPrepare).toHaveBeenCalledTimes(1);
    expect(nativeMediaMocks.upload).toHaveBeenCalledTimes(2);
    expect(rendered(renderer)).toContain('업로드 완료');
    expect(rendered(renderer)).toContain('재시도 필요');

    await press(renderer, '이미지 2 업로드 다시 시도');
    expect(nativeMediaMocks.upload).toHaveBeenCalledTimes(3);
    expect(rendered(renderer)).not.toContain('재시도 필요');

    await changeText(renderer, '제목', '네이티브 이미지 공지');
    await changeText(renderer, '공지 본문', '네이티브 이미지 본문');
    await press(renderer, '공지 게시 확인 열기');
    await press(renderer, '공지 게시 확인 실행');
    expect(api.createAnnouncement).toHaveBeenCalledWith(
      'access-token',
      1,
      expect.objectContaining({imageAssetIds: [501, 502]}),
    );
  });

  it('retries an ambiguous binary outcome against the same reservation context', async () => {
    nativeMediaMocks.mockMode = false;
    const prepared = {
      byteSize: 100,
      contentType: 'image/jpeg' as const,
      height: 80,
      sha256: 'a'.repeat(64),
      sourceIndex: 0,
      uri: 'file://ambiguous.jpg',
      width: 100,
    };
    const context = {
      file: {
        byteSize: prepared.byteSize,
        contentType: prepared.contentType,
        localUri: prepared.uri,
        sha256: prepared.sha256,
      },
      identity: {
        assetId: 704,
        byteSize: prepared.byteSize,
        contentType: prepared.contentType,
        sha256: prepared.sha256,
      },
      reservation: {
        assetId: 704,
        expiresAt: '2030-01-01T00:00:00.000Z',
        requiredHeaders: {'x-upload-token': 'same'},
        uploadUrl: 'https://upload.example/704',
      },
    };
    nativeMediaMocks.pickAndPrepare.mockResolvedValue({failures: [], prepared: [prepared]});
    nativeMediaMocks.upload.mockRejectedValueOnce(
      new nativeMediaMocks.BinaryUploadUncertainError(context),
    );
    nativeMediaMocks.retry.mockResolvedValueOnce({...context.identity, status: 'READY'});
    const renderer = await render(
      <AnnouncementEditorScreen api={createApi()} campusId={1} detail={null} onBack={vi.fn()} />,
    );

    await press(renderer, '공지 이미지 선택');
    expect(rendered(renderer)).toContain('같은 업로드 대상으로 다시 시도');
    await press(renderer, '이미지 1 업로드 다시 시도');

    expect(nativeMediaMocks.upload).toHaveBeenCalledTimes(1);
    expect(nativeMediaMocks.retry).toHaveBeenCalledTimes(1);
    expect(nativeMediaMocks.retry).toHaveBeenCalledWith(expect.objectContaining({context}));
    expect(rendered(renderer)).toContain('업로드 완료');
  });

  it('retains the same reservation context when token resolution fails before retry PUT', async () => {
    nativeMediaMocks.mockMode = false;
    const prepared = {
      byteSize: 100,
      contentType: 'image/jpeg' as const,
      height: 80,
      sha256: 'b'.repeat(64),
      sourceIndex: 0,
      uri: 'file://retry-after-session.jpg',
      width: 100,
    };
    const context = {
      file: {
        byteSize: prepared.byteSize,
        contentType: prepared.contentType,
        localUri: prepared.uri,
        sha256: prepared.sha256,
      },
      identity: {
        assetId: 705,
        byteSize: prepared.byteSize,
        contentType: prepared.contentType,
        sha256: prepared.sha256,
      },
      reservation: {
        assetId: 705,
        expiresAt: '2030-01-01T00:00:00.000Z',
        requiredHeaders: {'x-upload-token': 'same-after-auth'},
        uploadUrl: 'https://upload.example/705',
      },
    };
    nativeMediaMocks.pickAndPrepare.mockResolvedValue({failures: [], prepared: [prepared]});
    nativeMediaMocks.upload.mockRejectedValueOnce(
      new nativeMediaMocks.BinaryUploadUncertainError(context),
    );
    nativeMediaMocks.retry.mockResolvedValueOnce({...context.identity, status: 'READY'});
    const renderer = await render(
      <AnnouncementEditorScreen api={createApi()} campusId={1} detail={null} onBack={vi.fn()} />,
    );
    await press(renderer, '공지 이미지 선택');

    nativeMediaMocks.resolveToken.mockResolvedValueOnce(null);
    await press(renderer, '이미지 1 업로드 다시 시도');
    expect(nativeMediaMocks.retry).not.toHaveBeenCalled();

    await press(renderer, '이미지 1 업로드 다시 시도');
    expect(nativeMediaMocks.upload).toHaveBeenCalledTimes(1);
    expect(nativeMediaMocks.retry).toHaveBeenCalledWith(expect.objectContaining({context}));
  });

  it('does not start reserve or upload after an item is removed while access token resolution waits', async () => {
    nativeMediaMocks.mockMode = false;
    const token = deferred<string | null>();
    const prepared = {
      byteSize: 100,
      contentType: 'image/jpeg' as const,
      height: 80,
      sha256: 'a'.repeat(64),
      sourceIndex: 0,
      uri: 'file://removed-before-token.jpg',
      width: 100,
    };
    nativeMediaMocks.pickAndPrepare.mockResolvedValue({failures: [], prepared: [prepared]});
    const renderer = await render(
      <AnnouncementEditorScreen api={createApi()} campusId={1} detail={null} onBack={vi.fn()} />,
    );
    nativeMediaMocks.resolveToken.mockReturnValueOnce(token.promise);

    await press(renderer, '공지 이미지 선택');
    await press(renderer, '이미지 1 삭제');
    await act(async () => {
      token.resolve('access-token');
      await settle();
    });

    expect(nativeMediaMocks.upload).not.toHaveBeenCalled();
    expect(nativeMediaMocks.retry).not.toHaveBeenCalled();
    expect(nativeMediaMocks.discard).toHaveBeenCalledWith([prepared]);
  });

  it('windows a large native preview batch with bounded FlatList rendering', async () => {
    nativeMediaMocks.mockMode = false;
    nativeMediaMocks.pickAndPrepare.mockResolvedValue({
      failures: [],
      prepared: Array.from({length: 40}, (_, sourceIndex) => ({
        byteSize: 100,
        contentType: 'image/jpeg' as const,
        height: 80,
        sha256: sourceIndex.toString(16).padStart(64, 'a').slice(-64),
        sourceIndex,
        uri: `file://image-${sourceIndex}.jpg`,
        width: 100,
      })),
    });
    nativeMediaMocks.upload.mockImplementation(async ({file}) => ({
      assetId: 1_000 + Number(file.localUri.match(/(\d+)/)?.[1] ?? 0),
      status: 'READY',
    }));
    const renderer = await render(
      <AnnouncementEditorScreen api={createApi()} campusId={1} detail={null} onBack={vi.fn()} />,
    );

    await press(renderer, '공지 이미지 선택');
    const previewList = byLabel(renderer, '공지 이미지 미리보기 목록');
    expect(previewList.props).toMatchObject({
      horizontal: true,
      initialNumToRender: 4,
      maxToRenderPerBatch: 4,
      removeClippedSubviews: true,
      windowSize: 3,
    });
    expect(previewList.props.data).toHaveLength(40);
    expect(renderer.root.findAll((node) =>
      String(node.type) === 'Pressable' &&
      typeof node.props.accessibilityLabel === 'string' &&
      /^이미지 \d+ 삭제$/.test(node.props.accessibilityLabel))).toHaveLength(20);
    await press(renderer, '이미지 작업 20개 더 보기');
    expect(renderer.root.findAll((node) =>
      String(node.type) === 'Pressable' &&
      typeof node.props.accessibilityLabel === 'string' &&
      /^이미지 \d+ 삭제$/.test(node.props.accessibilityLabel))).toHaveLength(40);
  });

  it('retries PROCESSING with completion only and does not reserve or upload the binary again', async () => {
    nativeMediaMocks.mockMode = false;
    const identity = {
      assetId: 701,
      byteSize: 100,
      contentType: 'image/jpeg' as const,
      sha256: 'a'.repeat(64),
    };
    nativeMediaMocks.pickAndPrepare.mockResolvedValue({
      failures: [],
      prepared: [
        {...identity, height: 80, sourceIndex: 0, uri: 'file://a.jpg', width: 100},
      ],
    });
    nativeMediaMocks.upload.mockRejectedValueOnce(
      new nativeMediaMocks.ProcessingError(identity),
    );
    nativeMediaMocks.complete.mockResolvedValueOnce({...identity, status: 'READY'});
    const renderer = await render(
      <AnnouncementEditorScreen api={createApi()} campusId={1} detail={null} onBack={vi.fn()} />,
    );

    await press(renderer, '공지 이미지 선택');
    expect(rendered(renderer)).toContain('이미지 처리가 진행 중입니다.');
    await press(renderer, '이미지 1 업로드 다시 시도');

    expect(nativeMediaMocks.upload).toHaveBeenCalledTimes(1);
    expect(nativeMediaMocks.complete).toHaveBeenCalledTimes(1);
    expect(nativeMediaMocks.complete).toHaveBeenCalledWith(expect.objectContaining({identity}));
    expect(rendered(renderer)).toContain('업로드 완료');
  });

  it('blocks duplicate upload retry after an authoritative completion conflict', async () => {
    nativeMediaMocks.mockMode = false;
    const identity = {
      assetId: 702,
      byteSize: 100,
      contentType: 'image/jpeg' as const,
      sha256: 'a'.repeat(64),
    };
    nativeMediaMocks.pickAndPrepare.mockResolvedValue({
      failures: [],
      prepared: [
        {...identity, height: 80, sourceIndex: 0, uri: 'file://a.jpg', width: 100},
      ],
    });
    nativeMediaMocks.upload.mockRejectedValueOnce(
      new nativeMediaMocks.CompletionRejectedError(identity),
    );
    const renderer = await render(
      <AnnouncementEditorScreen api={createApi()} campusId={1} detail={null} onBack={vi.fn()} />,
    );

    await press(renderer, '공지 이미지 선택');

    expect(rendered(renderer)).toContain('서버 기록과 충돌했습니다.');
    expect(renderer.root.findAll((node) =>
      node.props.accessibilityLabel === '이미지 1 업로드 다시 시도')).toHaveLength(0);
    expect(byLabel(renderer, '이미지 1 삭제')).toBeTruthy();
    expect(nativeMediaMocks.upload).toHaveBeenCalledTimes(1);
  });

  it('keeps source order when one selected native image fails preparation', async () => {
    nativeMediaMocks.mockMode = false;
    nativeMediaMocks.pickAndPrepare.mockResolvedValue({
      failures: [{sourceIndex: 1, userMessage: '두 번째 이미지 처리 실패'}],
      prepared: [
        {byteSize: 100, contentType: 'image/jpeg', height: 80, sha256: 'a'.repeat(64), sourceIndex: 0, uri: 'file://a.jpg', width: 100},
        {byteSize: 120, contentType: 'image/jpeg', height: 80, sha256: 'c'.repeat(64), sourceIndex: 2, uri: 'file://c.jpg', width: 100},
      ],
    });
    nativeMediaMocks.upload
      .mockResolvedValueOnce({assetId: 601, status: 'READY'})
      .mockResolvedValueOnce({assetId: 603, status: 'READY'});
    const renderer = await render(
      <AnnouncementEditorScreen api={createApi()} campusId={1} detail={null} onBack={vi.fn()} />,
    );

    await press(renderer, '공지 이미지 선택');

    expect(byLabel(renderer, '이미지 2 업로드 다시 시도')).toBeTruthy();
    expect(byLabel(renderer, '이미지 3 삭제')).toBeTruthy();
  });

  it('does not upload an image removed while it is waiting in the sequential queue', async () => {
    nativeMediaMocks.mockMode = false;
    const firstUpload = deferred<{assetId: number; status: 'READY'}>();
    nativeMediaMocks.pickAndPrepare.mockResolvedValue({
      failures: [],
      prepared: [
        {byteSize: 100, contentType: 'image/jpeg', height: 80, sha256: 'a'.repeat(64), sourceIndex: 0, uri: 'file://a.jpg', width: 100},
        {byteSize: 100, contentType: 'image/jpeg', height: 80, sha256: 'b'.repeat(64), sourceIndex: 1, uri: 'file://b.jpg', width: 100},
        {byteSize: 100, contentType: 'image/jpeg', height: 80, sha256: 'c'.repeat(64), sourceIndex: 2, uri: 'file://c.jpg', width: 100},
      ],
    });
    nativeMediaMocks.upload
      .mockImplementationOnce(() => firstUpload.promise)
      .mockResolvedValueOnce({assetId: 603, status: 'READY'});
    const renderer = await render(
      <AnnouncementEditorScreen api={createApi()} campusId={1} detail={null} onBack={vi.fn()} />,
    );

    await press(renderer, '공지 이미지 선택');
    expect(nativeMediaMocks.upload).toHaveBeenCalledTimes(1);
    await press(renderer, '이미지 2 삭제');
    await act(async () => {
      firstUpload.resolve({assetId: 601, status: 'READY'});
      await settle();
    });

    expect(nativeMediaMocks.upload).toHaveBeenCalledTimes(2);
    expect(nativeMediaMocks.upload.mock.calls[1]?.[0].file.localUri).toBe('file://c.jpg');
  });

  it('discards a pending picker result and never starts upload after editor unmount', async () => {
    nativeMediaMocks.mockMode = false;
    const picker = deferred<{
      failures: [];
      prepared: Array<{
        byteSize: number;
        contentType: 'image/jpeg';
        height: number;
        sha256: string;
        sourceIndex: number;
        uri: string;
        width: number;
      }>;
    }>();
    const prepared = {
      byteSize: 100,
      contentType: 'image/jpeg' as const,
      height: 80,
      sha256: 'a'.repeat(64),
      sourceIndex: 0,
      uri: 'file://late.jpg',
      width: 100,
    };
    nativeMediaMocks.pickAndPrepare.mockReturnValueOnce(picker.promise);
    const renderer = await render(
      <AnnouncementEditorScreen api={createApi()} campusId={1} detail={null} onBack={vi.fn()} />,
    );

    await press(renderer, '공지 이미지 선택');
    await act(async () => {
      renderer.unmount();
      await settle();
    });
    await act(async () => {
      picker.resolve({failures: [], prepared: [prepared]});
      await settle();
    });

    expect(nativeMediaMocks.upload).not.toHaveBeenCalled();
    expect(nativeMediaMocks.discard).toHaveBeenCalledWith([prepared]);
  });

  it('keeps publish confirmation disabled while native picker preparation is pending', async () => {
    nativeMediaMocks.mockMode = false;
    const picker = deferred<{failures: []; prepared: []}>();
    nativeMediaMocks.pickAndPrepare.mockReturnValueOnce(picker.promise);
    const api = createApi();
    const renderer = await render(
      <AnnouncementEditorScreen api={api} campusId={1} detail={null} onBack={vi.fn()} />,
    );
    await changeText(renderer, '제목', '이미지 준비 중 공지');
    await changeText(renderer, '공지 본문', '이미지 준비가 끝나야 저장됩니다.');

    await press(renderer, '공지 이미지 선택');

    expect(byLabel(renderer, '공지 게시 확인 열기').props.disabled).toBe(true);
    expect(api.createAnnouncement).not.toHaveBeenCalled();

    await act(async () => {
      picker.resolve({failures: [], prepared: []});
      await settle();
    });
    expect(byLabel(renderer, '공지 게시 확인 열기').props.disabled).toBe(false);
  });

  it('keeps a preparation failure visible while the current picker batch is still active', async () => {
    nativeMediaMocks.mockMode = false;
    const uploadGate = deferred<{assetId: number; status: 'READY'}>();
    nativeMediaMocks.pickAndPrepare.mockResolvedValue({
      failures: [{sourceIndex: 1, userMessage: '두 번째 이미지 처리 실패'}],
      prepared: [
        {byteSize: 100, contentType: 'image/jpeg', height: 80, sha256: 'a'.repeat(64), sourceIndex: 0, uri: 'file://a.jpg', width: 100},
      ],
    });
    nativeMediaMocks.upload.mockImplementationOnce(() => uploadGate.promise);
    const renderer = await render(
      <AnnouncementEditorScreen api={createApi()} campusId={1} detail={null} onBack={vi.fn()} />,
    );

    await press(renderer, '공지 이미지 선택');
    await press(renderer, '이미지 2 업로드 다시 시도');

    expect(byLabel(renderer, '이미지 2 업로드 다시 시도')).toBeTruthy();
    expect(nativeMediaMocks.pickAndPrepare).toHaveBeenCalledTimes(1);
    await act(async () => {
      uploadGate.resolve({assetId: 601, status: 'READY'});
      await settle();
    });
  });
});

describe('AnnouncementCategoryScreen rendered interactions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps category mutations unavailable until the authoritative initial load succeeds', async () => {
    const initialLoad = deferred<AnnouncementCategory[]>();
    const api = createApi({listCategories: vi.fn(() => initialLoad.promise)});
    const renderer = await render(
      <AnnouncementCategoryScreen api={api} campusId={1} onBack={vi.fn()} />,
    );

    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '카테고리 추가'))
      .toHaveLength(0);
    expect(api.createCategory).not.toHaveBeenCalled();

    await act(async () => {
      initialLoad.resolve([worshipCategory]);
      await settle();
    });

    expect(byLabel(renderer, '카테고리 추가')).toBeTruthy();
  });

  it('fails closed after a category load error and exposes an explicit rendered retry', async () => {
    const api = createApi({
      listCategories: vi.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce([worshipCategory]),
    });
    const renderer = await render(
      <AnnouncementCategoryScreen api={api} campusId={1} onBack={vi.fn()} />,
    );

    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '카테고리 추가'))
      .toHaveLength(0);
    await press(renderer, '카테고리 다시 불러오기');

    expect(api.listCategories).toHaveBeenCalledTimes(2);
    expect(byLabel(renderer, '카테고리 추가')).toBeTruthy();
    expect(rendered(renderer)).toContain('예배');
  });

  it('edits inactive category name and color while preserving inactive history and suppressing double save', async () => {
    const editGate = deferred<AnnouncementCategory>();
    const api = createApi({
      listCategories: vi.fn(async () => [worshipCategory, communityCategory, inactiveCategory]),
      updateCategory: vi.fn(() => editGate.promise),
    });
    const renderer = await render(
      <AnnouncementCategoryScreen api={api} campusId={1} onBack={vi.fn()} />,
    );

    expect(rendered(renderer)).toContain('지난 소식');
    expect(rendered(renderer)).toContain('비활성');
    await press(renderer, '지난 소식 카테고리 수정');
    expect(byLabel(renderer, '카테고리 이름').props.value).toBe('지난 소식');
    await changeText(renderer, '카테고리 이름', '지난 기록');
    await press(renderer, '카테고리 색상 #F59E0B');
    await pressTwiceWithoutRender(renderer, '카테고리 변경 저장');

    expect(api.updateCategory).toHaveBeenCalledTimes(1);
    expect(api.updateCategory).toHaveBeenCalledWith('access-token', 1, 3, {
      color: '#F59E0B',
      isActive: false,
      name: '지난 기록',
      sortOrder: 3,
    });

    await act(async () => {
      editGate.resolve({...inactiveCategory, color: '#F59E0B', name: '지난 기록'});
      await settle();
    });
  });

  it('reorders categories with accessible controls and suppresses a synchronous double tap', async () => {
    const reorderGate = deferred<AnnouncementCategory>();
    const api = createApi({
      listCategories: vi.fn(async () => [worshipCategory, communityCategory, inactiveCategory]),
      updateCategory: vi.fn(() => reorderGate.promise),
    });
    const renderer = await render(
      <AnnouncementCategoryScreen api={api} campusId={1} onBack={vi.fn()} />,
    );

    const firstUp = byLabel(renderer, '예배 카테고리 위로 이동');
    expect(firstUp.props.disabled).toBe(true);
    expect(flattenStyle(firstUp.props.style({pressed: false})).minHeight).toBeGreaterThanOrEqual(44);
    await pressTwiceWithoutRender(renderer, '공동체 카테고리 위로 이동');

    expect(api.updateCategory).toHaveBeenCalledTimes(2);
    expect(api.updateCategory).toHaveBeenCalledWith(
      'access-token', 1, 2, expect.objectContaining({name: '공동체', sortOrder: 1}),
    );
    expect(api.updateCategory).toHaveBeenCalledWith(
      'access-token', 1, 1, expect.objectContaining({name: '예배', sortOrder: 2}),
    );

    await act(async () => {
      reorderGate.resolve(communityCategory);
      await settle();
    });
  });

  it('reloads authoritative category order when one half of a reorder fails', async () => {
    const api = createApi({
      listCategories: vi.fn()
        .mockResolvedValueOnce([worshipCategory, communityCategory])
        .mockResolvedValueOnce([
          {...worshipCategory, sortOrder: 2},
          {...communityCategory, sortOrder: 1},
        ]),
      updateCategory: vi.fn()
        .mockResolvedValueOnce({...communityCategory, sortOrder: 1})
        .mockRejectedValueOnce(new Error('second patch failed'))
        .mockResolvedValueOnce(communityCategory)
        .mockResolvedValueOnce(worshipCategory),
    });
    const renderer = await render(
      <AnnouncementCategoryScreen api={api} campusId={1} onBack={vi.fn()} />,
    );

    await press(renderer, '공동체 카테고리 위로 이동');

    expect(api.listCategories).toHaveBeenCalledTimes(2);
    expect(api.updateCategory).toHaveBeenNthCalledWith(
      3,
      'access-token',
      1,
      communityCategory.id,
      expect.objectContaining({sortOrder: communityCategory.sortOrder}),
    );
    expect(api.updateCategory).toHaveBeenNthCalledWith(
      4,
      'access-token',
      1,
      worshipCategory.id,
      expect.objectContaining({sortOrder: worshipCategory.sortOrder}),
    );
    expect(rendered(renderer)).toContain('서버의 최신 순서를 다시 불러왔습니다.');
  });

  it('keeps category mutations blocked when authoritative reorder recovery cannot reload', async () => {
    const api = createApi({
      listCategories: vi.fn()
        .mockResolvedValueOnce([worshipCategory, communityCategory])
        .mockRejectedValueOnce(new Error('reload offline'))
        .mockResolvedValueOnce([worshipCategory, communityCategory]),
      updateCategory: vi.fn()
        .mockResolvedValueOnce({...communityCategory, sortOrder: 1})
        .mockRejectedValueOnce(new Error('second patch failed'))
        .mockResolvedValueOnce(communityCategory)
        .mockResolvedValueOnce(worshipCategory),
    });
    const renderer = await render(
      <AnnouncementCategoryScreen api={api} campusId={1} onBack={vi.fn()} />,
    );

    await press(renderer, '공동체 카테고리 위로 이동');

    expect(rendered(renderer)).not.toContain('서버의 최신 순서를 다시 불러왔습니다.');
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '카테고리 추가'))
      .toHaveLength(0);
    await press(renderer, '카테고리 다시 불러오기');
    expect(byLabel(renderer, '카테고리 추가')).toBeTruthy();
  });

  it('fails closed when reorder recovery returns duplicate authoritative sort orders', async () => {
    const api = createApi({
      listCategories: vi.fn()
        .mockResolvedValueOnce([worshipCategory, communityCategory])
        .mockResolvedValueOnce([
          {...worshipCategory, sortOrder: 1},
          {...communityCategory, sortOrder: 1},
        ])
        .mockResolvedValueOnce([worshipCategory, communityCategory]),
      updateCategory: vi.fn()
        .mockResolvedValueOnce({...communityCategory, sortOrder: 1})
        .mockRejectedValueOnce(new Error('second patch failed'))
        .mockRejectedValueOnce(new Error('first compensation failed'))
        .mockResolvedValueOnce(worshipCategory),
    });
    const renderer = await render(
      <AnnouncementCategoryScreen api={api} campusId={1} onBack={vi.fn()} />,
    );

    await press(renderer, '공동체 카테고리 위로 이동');

    expect(rendered(renderer)).not.toContain('서버의 최신 순서를 다시 불러왔습니다.');
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '카테고리 추가'))
      .toHaveLength(0);
    await press(renderer, '카테고리 다시 불러오기');
    expect(byLabel(renderer, '카테고리 추가')).toBeTruthy();
  });

  it('suppresses a synchronous double tap while deactivating a category', async () => {
    const toggleGate = deferred<void>();
    const api = createApi({
      listCategories: vi.fn(async () => [worshipCategory]),
      deactivateCategory: vi.fn(() => toggleGate.promise),
    });
    const renderer = await render(
      <AnnouncementCategoryScreen api={api} campusId={1} onBack={vi.fn()} />,
    );

    await pressTwiceWithoutRender(renderer, '예배 카테고리 비활성화');
    expect(api.deactivateCategory).toHaveBeenCalledTimes(1);
    expect(api.deactivateCategory).toHaveBeenCalledWith('access-token', 1, 1);

    await act(async () => {
      toggleGate.resolve();
      await settle();
    });
  });

  it('exposes category and color choices as radio groups with 44-point targets', async () => {
    const api = createApi({listCategories: vi.fn(async () => [worshipCategory])});
    const categoryRenderer = await render(
      <AnnouncementCategoryScreen api={api} campusId={1} onBack={vi.fn()} />,
    );
    expect(categoryRenderer.root.findAll((node) =>
      String(node.type) === 'View' && node.props.accessibilityRole === 'radiogroup'))
      .toHaveLength(1);
    const swatch = byLabel(categoryRenderer, '카테고리 색상 #3182F6');
    expect(flattenStyle(swatch.props.style).minHeight).toBeGreaterThanOrEqual(44);

    const editorRenderer = await render(
      <AnnouncementEditorScreen api={api} campusId={1} detail={null} onBack={vi.fn()} />,
    );
    expect(editorRenderer.root.findAll((node) =>
      String(node.type) === 'View' && node.props.accessibilityRole === 'radiogroup').length)
      .toBeGreaterThanOrEqual(2);
    const categoryChoice = byLabel(editorRenderer, '예배 카테고리 선택');
    expect(flattenStyle(categoryChoice.props.style).minHeight).toBeGreaterThanOrEqual(44);
  });
});

function createApi(overrides: Partial<AnnouncementApi> = {}): AnnouncementApi {
  const base: AnnouncementApi = {
    archiveAnnouncement: vi.fn(async () => undefined),
    completeMediaUpload: vi.fn(),
    createAnnouncement: vi.fn(async (_token, _campusId, body) => ({
      ...publishedAnnouncement,
      ...body,
      category: worshipCategory,
      id: 201,
      publishAt: body.publishAt,
      publishedAt: body.publishMode === 'NOW' ? '2030-01-01T00:00:00.000Z' : null,
      status: body.publishMode === 'NOW' ? 'PUBLISHED' : 'SCHEDULED',
    })),
    createCategory: vi.fn(async (_token, _campusId, body) => ({...body, id: 4})),
    deactivateCategory: vi.fn(async () => undefined),
    getDetail: vi.fn(),
    getMediaAccessUrls: vi.fn(async () => []),
    listAdmin: vi.fn(async () => [publishedAnnouncement]),
    listCategories: vi.fn(async (_token, _campusId, includeInactive) =>
      includeInactive ? [worshipCategory, communityCategory, inactiveCategory] : [worshipCategory, communityCategory]),
    listPublished: vi.fn(),
    publishAnnouncement: vi.fn(async (_token, _campusId, id) => ({
      ...scheduledAnnouncement,
      id,
      publishedAt: '2030-01-01T00:00:00.000Z',
      status: 'PUBLISHED' as const,
    })),
    reserveMediaUpload: vi.fn(),
    updateAnnouncement: vi.fn(async (_token, _campusId, _id, body) => ({
      ...publishedAnnouncement,
      ...body,
      category: worshipCategory,
      publishAt: body.publishAt,
      status: body.publishMode === 'NOW' ? 'PUBLISHED' : 'SCHEDULED',
    })),
    updateCategory: vi.fn(async (_token, _campusId, id, body) => ({...body, id})),
  };
  return {...base, ...overrides};
}

function mediaAccess(assetId: number) {
  return {
    assetId,
    detailUrl: `https://cdn.example/${assetId}/detail.jpg`,
    expiresAt: '2030-01-01T00:00:00.000Z',
    sha256: 'a'.repeat(64),
    thumbnailUrl: `https://cdn.example/${assetId}/thumbnail.jpg`,
  };
}

function announcement(overrides: Partial<AnnouncementDetail> = {}): AnnouncementDetail {
  return {
    body: '공지 본문',
    campusId: 1,
    category: worshipCategory,
    id: 100,
    imageAssetIds: [],
    pinned: false,
    publishAt: '2030-01-01T00:00:00.000Z',
    publishedAt: '2030-01-01T00:00:00.000Z',
    status: 'PUBLISHED',
    title: '공지 제목',
    ...overrides,
  };
}

async function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
    await settle();
  });
  return renderer;
}

function byLabel(renderer: ReactTestRenderer, accessibilityLabel: string) {
  const matches = renderer.root.findAll((node) => node.props.accessibilityLabel === accessibilityLabel);
  const host = matches.find((node) => typeof node.type === 'string');
  if (host) return host;
  if (matches[0]) return matches[0];
  throw new Error(`No rendered control found with accessibilityLabel=${accessibilityLabel}`);
}

async function press(renderer: ReactTestRenderer, accessibilityLabel: string) {
  await act(async () => {
    const control = byLabel(renderer, accessibilityLabel);
    if (!control.props.disabled) control.props.onPress();
    await settle();
  });
}

async function pressTwiceWithoutRender(renderer: ReactTestRenderer, accessibilityLabel: string) {
  await act(async () => {
    const control = byLabel(renderer, accessibilityLabel);
    control.props.onPress();
    control.props.onPress();
    await settle();
  });
}

async function changeText(renderer: ReactTestRenderer, accessibilityLabel: string, value: string) {
  await act(async () => {
    byLabel(renderer, accessibilityLabel).props.onChangeText(value);
    await settle();
  });
}

function rendered(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => String(node.type) === 'Text')
    .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string'))
    .join(' ');
}

function flattenStyle(style: unknown) {
  return (Array.isArray(style) ? style : [style])
    .filter(Boolean)
    .reduce<Record<string, unknown>>((result, entry) => ({...result, ...(entry as object)}), {});
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, reject, resolve};
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
