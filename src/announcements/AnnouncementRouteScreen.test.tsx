import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  const FlatList = ({
    data = [],
    ListEmptyComponent,
    ListHeaderComponent,
    renderItem,
    ...props
  }: React.PropsWithChildren<{
    data?: unknown[];
    ListEmptyComponent?: React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
    renderItem?: (input: {index: number; item: unknown}) => React.ReactNode;
  }>) => {
    const items = data.map((item, index) =>
      ReactModule.createElement(
        ReactModule.Fragment,
        {key: index},
        renderItem?.({index, item}),
      ));
    return ReactModule.createElement(
      'FlatList',
      {...props, data, renderItem},
      ListHeaderComponent,
      ...items,
      data.length === 0 ? ListEmptyComponent : null,
    );
  };
  return {
    FlatList,
    Image: host('Image'),
    Modal: ({children, visible, ...props}: React.PropsWithChildren<{visible: boolean}>) =>
      visible ? ReactModule.createElement('Modal', props, children) : null,
    Pressable: host('Pressable'),
    SafeAreaView: host('SafeAreaView'),
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
    View: host('View'),
    useWindowDimensions: () => ({fontScale: 1, height: 800, scale: 2, width: 400}),
  };
});

vi.mock('../components/ui', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
    Empty: ({message, title}: {message: string; title: string}) =>
      ReactModule.createElement('Empty', {message, title}, title, message),
    ErrorState: ({
      actionAccessibilityLabel,
      actionLabel,
      message,
      onActionPress,
      title,
    }: {
      actionAccessibilityLabel: string;
      actionLabel: string;
      message: string;
      onActionPress: () => void;
      title: string;
    }) => ReactModule.createElement(
      'ErrorState',
      {message, title},
      title,
      message,
      ReactModule.createElement('Pressable', {
        accessibilityLabel: actionAccessibilityLabel,
        onPress: onActionPress,
      }, actionLabel),
    ),
    Loading: ({message}: {message: string}) => ReactModule.createElement('Loading', {message}, message),
    ScreenHeader: ({action, eyebrow, subtitle, title}: React.PropsWithChildren<{
      action?: React.ReactNode;
      eyebrow?: string;
      subtitle?: string;
      title: string;
    }>) => ReactModule.createElement('ScreenHeader', {eyebrow, subtitle, title}, title, action),
    ViewState: host('ViewState'),
  };
});

vi.mock('../auth/accessTokenResolver', () => ({
  resolveCurrentAccessToken: vi.fn(async () => 'access-token'),
}));

vi.mock('../api/client', () => {
  class TestFaithLogApiError extends Error {
    detail: unknown;

    constructor(detail: {message: string}) {
      super(detail.message);
      this.detail = detail;
    }
  }

  return {FaithLogApiError: TestFaithLogApiError};
});

vi.mock('./announcementApi', () => ({announcementApi: {}}));
const documentRuntimeMocks = vi.hoisted(() => ({
  openAnnouncementPdf: vi.fn(async () => undefined),
}));
vi.mock('./announcementDocumentNativeRuntime', () => documentRuntimeMocks);
vi.mock('./announcementEnvironment', () => ({isAnnouncementPdfCapabilityEnabled: () => true}));
vi.mock('./AnnouncementCategoryBadge', async () => {
  const ReactModule = await import('react');
  return {
    AnnouncementCategoryBadge: ({category}: {category: AnnouncementSummary['category']}) =>
      ReactModule.createElement('AnnouncementCategoryBadge', {category}, category.name),
  };
});

import {AnnouncementRouteScreen} from './AnnouncementRouteScreen';
import type {AnnouncementApi} from './announcementApi';
import type {AnnouncementDetail, AnnouncementSummary, MediaAccessUrl} from './announcementTypes';
import type {DocumentAccessUrl} from '../media/documentMediaTypes';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('AnnouncementRouteScreen rendered failure isolation', () => {
  it('opens an attached announcement PDF through the authorized native document flow', async () => {
    const renderer = await render(
      <AnnouncementRouteScreen
        api={createApi({getDetail: vi.fn(async () => detail(31, {documentAssetIds: [301]}))})}
        campusId={1}
        documentApi={{getAccessUrls: vi.fn(async () => [documentAccess(301, '주일 안내.pdf')])}}
        initialAnnouncementId={31}
        onBack={vi.fn()}
      />,
    );

    await press(renderer, '주일 안내.pdf PDF 열기');

    expect(documentRuntimeMocks.openAnnouncementPdf).toHaveBeenCalledWith({
      accessToken: 'access-token',
      assetId: 301,
      campusId: 1,
    });
    expect(renderedText(renderer)).not.toContain('Mock 화면에서만');
  });

  it('keeps the announcement list text-only and does not request image URLs', async () => {
    const getMediaAccessUrls = vi.fn(async () => [media(101)]);
    const api = createApi({
      getMediaAccessUrls,
      listPublished: vi.fn(async () => [summary(1, {imageAssetIds: [101], title: '주일 공지'})]),
    });
    const renderer = await render(<AnnouncementRouteScreen api={api} campusId={1} onBack={vi.fn()} />);

    expect(renderedText(renderer)).toContain('주일 공지');
    expect(renderer.root.findAllByType('Image' as never)).toHaveLength(0);
    expect(getMediaAccessUrls).not.toHaveBeenCalled();
    expect(renderer.root.findAll((node) =>
      String(node.type) === 'View' && node.props.accessibilityRole === 'radiogroup')).toHaveLength(1);

  });

  it('renders safe web addresses in announcement detail as accessible links', async () => {
    const renderer = await render(
      <AnnouncementRouteScreen
        api={createApi({getDetail: vi.fn(async () => detail(41, {body: '신청: https://faithlog.app/forms/41'}))})}
        campusId={1}
        initialAnnouncementId={41}
        onBack={vi.fn()}
      />,
    );

    expect(renderer.root.findAll((node) =>
      node.props.accessibilityLabel === '링크 열기 https://faithlog.app/forms/41'
      && node.props.accessibilityRole === 'link')).not.toHaveLength(0);
  });

  it('retries a failed initial deep link with the same detail id instead of loading the list', async () => {
    const getDetail = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(detail(77, {body: '재시도 후 유지되는 본문'}));
    const listPublished = vi.fn(async () => []);
    const onAnalyticsViewChange = vi.fn();
    const onDetailVisibilityChange = vi.fn();
    const api = createApi({getDetail, listPublished});
    const renderer = await render(
      <AnnouncementRouteScreen
        api={api}
        campusId={1}
        initialAnnouncementId={77}
        onAnalyticsViewChange={onAnalyticsViewChange}
        onBack={vi.fn()}
        onDetailVisibilityChange={onDetailVisibilityChange}
      />,
    );

    expect(byLabel(renderer, '공지 상세 다시 불러오기')).toBeTruthy();

    await press(renderer, '공지 상세 다시 불러오기');

    expect(getDetail).toHaveBeenCalledTimes(2);
    expect(getDetail).toHaveBeenNthCalledWith(1, 'access-token', 1, 77);
    expect(getDetail).toHaveBeenNthCalledWith(2, 'access-token', 1, 77);
    expect(listPublished).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('재시도 후 유지되는 본문');
    expect(onAnalyticsViewChange.mock.calls.map(([view]) => view)).toEqual([null, 'detail']);
    expect(onDetailVisibilityChange.mock.calls.map(([visible]) => visible)).toEqual([false, true]);
  });

  it('lets a member leave a persistent announcement-list error', async () => {
    const onBack = vi.fn();
    const renderer = await render(
      <AnnouncementRouteScreen
        api={createApi({listPublished: vi.fn().mockRejectedValue(new Error('offline'))})}
        campusId={1}
        onBack={onBack}
      />,
    );

    expect(byLabel(renderer, '공지 목록 다시 불러오기')).toBeTruthy();
    await press(renderer, '공지 화면에서 뒤로 이동');

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('returns from a persistent detail error to the announcement list', async () => {
    const listPublished = vi.fn(async () => [summary(1, {title: '복귀한 공지 목록'})]);
    const onBack = vi.fn();
    const renderer = await render(
      <AnnouncementRouteScreen
        api={createApi({
          getDetail: vi.fn().mockRejectedValue(new Error('permission denied')),
          listPublished,
        })}
        campusId={1}
        initialAnnouncementId={77}
        onBack={onBack}
      />,
    );

    expect(byLabel(renderer, '공지 상세 다시 불러오기')).toBeTruthy();
    await press(renderer, '공지 화면에서 뒤로 이동');

    expect(listPublished).toHaveBeenCalledTimes(1);
    expect(renderedText(renderer)).toContain('복귀한 공지 목록');
    expect(onBack).not.toHaveBeenCalled();
  });

  it('reopens the same announcement id when a newer notification request arrives', async () => {
    const getDetail = vi.fn(async () => detail(77, {body: '같은 공지 재진입'}));
    const listPublished = vi.fn(async () => [summary(77)]);
    const api = createApi({getDetail, listPublished});
    const renderer = await render(
      <AnnouncementRouteScreen
        api={api}
        campusId={1}
        initialAnnouncementId={77}
        initialOpenRequestKey={1}
        onBack={vi.fn()}
      />,
    );
    await press(renderer, '공지 화면에서 뒤로 이동');
    expect(listPublished).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.update(
        <AnnouncementRouteScreen
          api={api}
          campusId={1}
          initialAnnouncementId={77}
          initialOpenRequestKey={2}
          onBack={vi.fn()}
        />,
      );
      await settle();
    });

    expect(getDetail).toHaveBeenCalledTimes(2);
    expect(renderedText(renderer)).toContain('같은 공지 재진입');
  });

  it('keeps detail content through media failure and supports thumbnail retry plus expanded viewing', async () => {
    const getMediaAccessUrls = vi.fn()
      .mockRejectedValueOnce(new Error('signed URL unavailable'))
      .mockResolvedValue([media(201), media(202)]);
    const listPublished = vi.fn(async () => []);
    const onDetailVisibilityChange = vi.fn();
    const api = createApi({
      getDetail: vi.fn(async () => detail(88, {
        body: '미디어 실패와 무관하게 남는 상세 본문',
        imageAssetIds: [201, 202],
        title: '미디어 공지',
      })),
      getMediaAccessUrls,
      listPublished,
    });
    const renderer = await render(
      <AnnouncementRouteScreen
        api={api}
        campusId={1}
        initialAnnouncementId={88}
        onBack={vi.fn()}
        onDetailVisibilityChange={onDetailVisibilityChange}
      />,
    );

    expect(renderedText(renderer)).toContain('미디어 공지');
    expect(renderedText(renderer)).toContain('미디어 실패와 무관하게 남는 상세 본문');
    expect(renderedText(renderer)).toContain('첨부 이미지 주소를 불러오지 못했습니다.');

    await press(renderer, '공지 첨부 이미지 주소 다시 불러오기');

    expect(getMediaAccessUrls).toHaveBeenNthCalledWith(1, 'access-token', 1, [201, 202]);
    expect(getMediaAccessUrls).toHaveBeenNthCalledWith(2, 'access-token', 1, [201, 202]);
    const thumbnailList = renderer.root.find((node) =>
      String(node.type) === 'FlatList' && node.props.horizontal === true);
    expect(thumbnailList.props.pagingEnabled).not.toBe(true);
    expect(thumbnailList.props.data.map((item: MediaAccessUrl) => item.assetId)).toEqual([201, 202]);

    const firstImage = byLabel(renderer, '공지 첨부 이미지 1');
    expect(firstImage.props.accessible).toBe(true);
    expect(firstImage.props.accessibilityRole).toBe('image');
    expect(firstImage.props.resizeMode).toBe('contain');
    expect(flattenStyle(firstImage.props.style)).toMatchObject({height: '100%', width: '100%'});
    const thumbnailStyle = byLabel(renderer, '공지 첨부 이미지 1 확대 보기').props.style;
    expect(flattenStyle(typeof thumbnailStyle === 'function'
      ? thumbnailStyle({pressed: false})
      : thumbnailStyle))
      .toMatchObject({height: 84, width: 84});
    expect(byLabel(renderer, '공지 첨부 이미지 1 불러오는 중')).toBeTruthy();
    const staleFirstImageError = firstImage.props.onError;

    await act(async () => {
      staleFirstImageError();
      await settle();
    });
    expect(byLabel(renderer, '공지 첨부 이미지 1 다시 불러오기')).toBeTruthy();

    await press(renderer, '공지 첨부 이미지 1 다시 불러오기');
    expect(getMediaAccessUrls).toHaveBeenCalledTimes(3);
    expect(byLabel(renderer, '공지 첨부 이미지 1 불러오는 중')).toBeTruthy();
    await act(async () => {
      byLabel(renderer, '공지 첨부 이미지 1').props.onLoad();
      await settle();
    });
    await act(async () => {
      staleFirstImageError();
      await settle();
    });
    expect(findAllByLabel(renderer, '공지 첨부 이미지 1 불러오는 중')).toHaveLength(0);
    expect(findAllByLabel(renderer, '공지 첨부 이미지 1 다시 불러오기')).toHaveLength(0);

    await press(renderer, '공지 첨부 이미지 1 확대 보기');
    expect(byLabel(renderer, '공지 첨부 이미지 확대 화면')).toBeTruthy();
    const expandedImage = byLabel(renderer, '확대된 공지 첨부 이미지 1');
    expect(expandedImage.props.resizeMode).toBe('contain');
    await press(renderer, '공지 첨부 이미지 확대 화면 닫기');
    expect(findAllByLabel(renderer, '공지 첨부 이미지 확대 화면')).toHaveLength(0);

    await press(renderer, '공지 화면에서 뒤로 이동');
    expect(listPublished).toHaveBeenCalledTimes(1);
    expect(onDetailVisibilityChange.mock.calls.map(([visible]) => visible)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('reserves compact horizontal thumbnail slots while detail media URLs are pending', async () => {
    const mediaRequest = deferred<MediaAccessUrl[]>();
    const api = createApi({
      getDetail: vi.fn(async () => detail(90, {
        body: '주소를 기다리는 동안에도 보이는 본문',
        imageAssetIds: [301, 302],
        title: '스켈레톤 공지',
      })),
      getMediaAccessUrls: vi.fn(() => mediaRequest.promise),
    });
    const renderer = await render(
      <AnnouncementRouteScreen
        api={api}
        campusId={1}
        initialAnnouncementId={90}
        onBack={vi.fn()}
      />,
    );

    expect(renderedText(renderer)).toContain('주소를 기다리는 동안에도 보이는 본문');
    const thumbnailList = renderer.root.find((node) =>
      String(node.type) === 'FlatList' && node.props.horizontal === true);
    expect(thumbnailList.props.data.map((item: {assetId: number}) => item.assetId)).toEqual([301, 302]);
    const firstSkeleton = byLabel(renderer, '공지 첨부 이미지 1 주소 불러오는 중');
    expect(flattenStyle(firstSkeleton.props.style)).toMatchObject({height: 84, width: 84});
    expect(findAllByLabel(renderer, '공지 첨부 이미지 1 다시 불러오기')).toHaveLength(0);

    await act(async () => {
      mediaRequest.resolve([media(301), media(302)]);
      await settle();
    });
    expect(byLabel(renderer, '공지 첨부 이미지 1')).toBeTruthy();
    expect(findAllByLabel(renderer, '공지 첨부 이미지 1 주소 불러오는 중')).toHaveLength(0);
  });

  it('keeps successful detail siblings and renders a retryable slot for a missing media URL', async () => {
    const getMediaAccessUrls = vi.fn()
      .mockResolvedValueOnce([media(201)])
      .mockResolvedValueOnce([media(201), media(202)]);
    const api = createApi({
      getDetail: vi.fn(async () => detail(89, {
        body: '누락 이미지와 무관하게 남는 상세 본문',
        imageAssetIds: [201, 202],
        title: '일부 이미지 누락 공지',
      })),
      getMediaAccessUrls,
    });
    const renderer = await render(
      <AnnouncementRouteScreen
        api={api}
        campusId={1}
        initialAnnouncementId={89}
        onBack={vi.fn()}
      />,
    );

    expect(renderedText(renderer)).toContain('누락 이미지와 무관하게 남는 상세 본문');
    expect(byLabel(renderer, '공지 첨부 이미지 1')).toBeTruthy();
    expect(byLabel(renderer, '공지 첨부 이미지 2를 표시할 수 없음')).toBeTruthy();

    await press(renderer, '공지 첨부 이미지 2 다시 불러오기');

    expect(getMediaAccessUrls).toHaveBeenCalledTimes(2);
    expect(byLabel(renderer, '공지 첨부 이미지 1')).toBeTruthy();
    expect(byLabel(renderer, '공지 첨부 이미지 2')).toBeTruthy();
    expect(findAllByLabel(renderer, '공지 첨부 이미지 2를 표시할 수 없음')).toHaveLength(0);
  });
});

function createApi(overrides: Partial<AnnouncementApi>): AnnouncementApi {
  return {
    archiveAnnouncement: vi.fn(),
    completeMediaUpload: vi.fn(),
    createAnnouncement: vi.fn(),
    createCategory: vi.fn(),
    deactivateCategory: vi.fn(),
    getDetail: vi.fn(),
    getMediaAccessUrls: vi.fn(async () => []),
    listAdmin: vi.fn(),
    listCategories: vi.fn(),
    listPublished: vi.fn(async () => []),
    publishAnnouncement: vi.fn(),
    reserveMediaUpload: vi.fn(),
    updateAnnouncement: vi.fn(),
    updateCategory: vi.fn(),
    ...overrides,
  } as AnnouncementApi;
}

function documentAccess(assetId: number, fileName: string): DocumentAccessUrl {
  return {
    assetId,
    assetKind: 'PDF',
    byteSize: 1024,
    contentType: 'application/pdf',
    detailUrl: null,
    downloadUrl: `https://signed.example/${assetId}`,
    expiresAt: '2026-08-05T12:00:00Z',
    fileName,
    sha256: 'a'.repeat(64),
    thumbnailUrl: null,
  };
}

function summary(id: number, overrides: Partial<AnnouncementSummary> = {}): AnnouncementSummary {
  return {
    body: '목록 본문',
    campusId: 1,
    category: {color: '#3182F6', id: 1, isActive: true, name: '예배', sortOrder: 1},
    id,
    imageAssetIds: [],
    pinned: false,
    publishAt: '2026-08-03T09:00:00Z',
    publishedAt: '2026-08-03T09:00:00Z',
    status: 'PUBLISHED',
    title: `공지 ${id}`,
    ...overrides,
    attachmentCount: overrides.attachmentCount ?? 0,
    documentAssetIds: overrides.documentAssetIds ?? [],
    hasAttachments: overrides.hasAttachments ?? false,
  };
}

function detail(id: number, overrides: Partial<AnnouncementDetail> = {}): AnnouncementDetail {
  return summary(id, overrides);
}

function media(assetId: number): MediaAccessUrl {
  return {
    assetId,
    detailUrl: `detail-${assetId}`,
    expiresAt: '2026-08-03T10:00:00Z',
    sha256: 'a'.repeat(64),
    thumbnailUrl: `thumb-${assetId}`,
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
  const matches = findAllByLabel(renderer, accessibilityLabel);
  const host = matches.find((node) => typeof node.type === 'string');
  if (host) return host;
  if (matches[0]) return matches[0];
  throw new Error(`No rendered control found with accessibilityLabel=${accessibilityLabel}`);
}

function findAllByLabel(renderer: ReactTestRenderer, accessibilityLabel: string) {
  return renderer.root.findAll((node) => node.props.accessibilityLabel === accessibilityLabel);
}

async function press(renderer: ReactTestRenderer, accessibilityLabel: string) {
  await act(async () => {
    byLabel(renderer, accessibilityLabel).props.onPress();
    await settle();
  });
}

function renderedText(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) =>
    String(node.type) === 'Text' || String(node.type) === 'ErrorState')
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === 'string')
    .join(' ');
}

function flattenStyle(style: unknown) {
  return (Array.isArray(style) ? style : [style])
    .filter(Boolean)
    .reduce<Record<string, unknown>>((result, entry) => ({...result, ...(entry as object)}), {});
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return {promise, reject, resolve};
}
