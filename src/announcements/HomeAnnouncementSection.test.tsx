import React from 'react';
import {act, create} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: Record<string, unknown> & {children?: React.ReactNode}) =>
    ReactModule.createElement(name, props, children);
  return {
    Image: host('Image'),
    Pressable: host('Pressable'),
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
    View: host('View'),
  };
});

vi.mock('../auth/accessTokenResolver', () => ({
  resolveCurrentAccessToken: vi.fn().mockResolvedValue('token'),
}));

vi.mock('./announcementApi', () => ({announcementApi: {}}));

import {HomeAnnouncementSection} from './HomeAnnouncementSection';
import type {AnnouncementApi} from './announcementApi';
import type {AnnouncementSummary} from './announcementTypes';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('HomeAnnouncementSection', () => {
  it('renders one pinned and two distinct latest notices while media failure stays isolated', async () => {
    const onOpenAll = vi.fn();
    const onOpenAnnouncement = vi.fn();
    const api = createApi({
      getMediaAccessUrls: vi.fn().mockRejectedValue(new Error('signed URL unavailable')),
      listPublished: vi.fn().mockResolvedValue([
        summary(1, {pinned: true, title: '고정 공지', imageAssetIds: [101]}),
        summary(2, {publishedAt: '2026-08-03T09:00:00Z', title: '최신 공지 A', imageAssetIds: [102]}),
        summary(3, {publishedAt: '2026-08-02T09:00:00Z', title: '최신 공지 B'}),
        summary(4, {publishedAt: '2026-08-01T09:00:00Z', title: '목록에서만 보이는 공지'}),
      ]),
    });
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(
        <HomeAnnouncementSection
          api={api}
          campusId={1}
          onOpenAll={onOpenAll}
          onOpenAnnouncement={onOpenAnnouncement}
        />,
      );
      await flushPromises();
    });

    const text = renderedText(renderer!);
    expect(text).toContain('고정 공지');
    expect(text).toContain('최신 공지 A');
    expect(text).toContain('최신 공지 B');
    expect(text).not.toContain('목록에서만 보이는 공지');
    expect(text.match(/고정 공지/g)).toHaveLength(1);
    expect(text).toContain('이미지를 불러오지 못했지만 공지는 확인할 수 있습니다.');

    press(renderer!, '캠퍼스 공지 전체 보기');
    press(renderer!, '고정 공지 상세 보기');
    expect(onOpenAll).toHaveBeenCalledTimes(1);
    expect(onOpenAnnouncement).toHaveBeenCalledWith(1);
  });

  it('requests only the first thumbnail per visible notice and renders returned thumbnails', async () => {
    const getMediaAccessUrls = vi.fn().mockResolvedValue([
      {assetId: 101, detailUrl: 'detail-101', expiresAt: '2026-08-03T10:00:00Z', thumbnailUrl: 'thumb-101'},
      {assetId: 102, detailUrl: 'detail-102', expiresAt: '2026-08-03T10:00:00Z', thumbnailUrl: 'thumb-102'},
    ]);
    const api = createApi({
      getMediaAccessUrls,
      listPublished: vi.fn().mockResolvedValue([
        summary(1, {pinned: true, imageAssetIds: [101, 999], title: '고정 공지'}),
        summary(2, {imageAssetIds: [102, 998], title: '최신 공지'}),
      ]),
    });
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(
        <HomeAnnouncementSection
          api={api}
          campusId={1}
          onOpenAll={vi.fn()}
          onOpenAnnouncement={vi.fn()}
        />,
      );
      await flushPromises();
    });

    expect(getMediaAccessUrls).toHaveBeenCalledWith('token', 1, [101, 102]);
    expect(renderer!.root.findAllByType('Image' as never).map((node) => node.props.source.uri))
      .toEqual(['thumb-101', 'thumb-102']);
  });

  it('selects latest notices by published time instead of API array order', async () => {
    const api = createApi({
      listPublished: vi.fn().mockResolvedValue([
        summary(1, {publishedAt: '2026-08-01T09:00:00Z', title: '오래된 공지'}),
        summary(2, {publishedAt: '2026-08-03T09:00:00Z', title: '가장 최신 공지'}),
        summary(3, {publishedAt: '2026-08-02T09:00:00Z', title: '두 번째 최신 공지'}),
      ]),
    });
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(
        <HomeAnnouncementSection
          api={api}
          campusId={1}
          onOpenAll={vi.fn()}
          onOpenAnnouncement={vi.fn()}
        />,
      );
      await flushPromises();
    });

    const text = renderedText(renderer!);
    expect(text).toContain('가장 최신 공지');
    expect(text).toContain('두 번째 최신 공지');
    expect(text).not.toContain('오래된 공지');
  });

  it('deduplicates a shared first thumbnail asset before the strict batch request', async () => {
    const getMediaAccessUrls = vi.fn().mockResolvedValue([
      {assetId: 101, detailUrl: 'detail-101', expiresAt: '2026-08-03T10:00:00Z', thumbnailUrl: 'thumb-101'},
    ]);
    const api = createApi({
      getMediaAccessUrls,
      listPublished: vi.fn().mockResolvedValue([
        summary(1, {pinned: true, imageAssetIds: [101], title: '고정 공지'}),
        summary(2, {imageAssetIds: [101], title: '최신 공지'}),
      ]),
    });

    await act(async () => {
      create(
        <HomeAnnouncementSection
          api={api}
          campusId={1}
          onOpenAll={vi.fn()}
          onOpenAnnouncement={vi.fn()}
        />,
      );
      await flushPromises();
    });

    expect(getMediaAccessUrls).toHaveBeenCalledWith('token', 1, [101]);
  });

  it('keeps a retryable thumbnail slot when a batch omits the requested home asset', async () => {
    const getMediaAccessUrls = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {assetId: 101, detailUrl: 'detail-101', expiresAt: '2026-08-03T10:00:00Z', thumbnailUrl: 'thumb-101'},
      ]);
    const api = createApi({
      getMediaAccessUrls,
      listPublished: vi.fn().mockResolvedValue([
        summary(1, {imageAssetIds: [101], title: '누락 홈 이미지 공지'}),
      ]),
    });
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <HomeAnnouncementSection
          api={api}
          campusId={1}
          onOpenAll={vi.fn()}
          onOpenAnnouncement={vi.fn()}
        />,
      );
      await flushPromises();
    });

    expect(renderer!.root.find((node) =>
      node.props.accessibilityLabel === '누락 홈 이미지 공지 미리보기 이미지 다시 불러오기'))
      .toBeTruthy();
    const retryControl = renderer!.root.find((node) =>
      String(node.type) === 'Pressable' &&
      node.props.accessibilityLabel === '누락 홈 이미지 공지 미리보기 이미지 다시 불러오기');
    let ancestor = retryControl.parent;
    while (ancestor) {
      expect(ancestor.props.accessibilityLabel).not.toBe('누락 홈 이미지 공지 상세 보기');
      ancestor = ancestor.parent;
    }
    await act(async () => {
      renderer!.root.find((node) =>
        node.props.accessibilityLabel === '누락 홈 이미지 공지 미리보기 이미지 다시 불러오기')
        .props.onPress({stopPropagation: vi.fn()});
      await flushPromises();
    });

    expect(getMediaAccessUrls).toHaveBeenCalledTimes(2);
    expect(renderer!.root.findAllByType('Image' as never).map((node) => node.props.source.uri))
      .toContain('thumb-101');
  });

  it('does not let an older row retry cover thumbnails resolved by a newer retry', async () => {
    const olderRetry = deferred<Array<{
      assetId: number;
      detailUrl: string;
      expiresAt: string;
      thumbnailUrl: string;
    }>>();
    const newerRetry = deferred<Array<{
      assetId: number;
      detailUrl: string;
      expiresAt: string;
      thumbnailUrl: string;
    }>>();
    const getMediaAccessUrls = vi.fn()
      .mockResolvedValueOnce([])
      .mockImplementationOnce(() => olderRetry.promise)
      .mockImplementationOnce(() => newerRetry.promise);
    const api = createApi({
      getMediaAccessUrls,
      listPublished: vi.fn().mockResolvedValue([
        summary(1, {imageAssetIds: [101], title: '느린 홈 공지'}),
        summary(2, {imageAssetIds: [102], title: '빠른 홈 공지'}),
      ]),
    });
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <HomeAnnouncementSection
          api={api}
          campusId={1}
          onOpenAll={vi.fn()}
          onOpenAnnouncement={vi.fn()}
        />,
      );
      await flushPromises();
    });

    act(() => {
      renderer!.root.find((node) =>
        node.props.accessibilityLabel === '느린 홈 공지 미리보기 이미지 다시 불러오기')
        .props.onPress({stopPropagation: vi.fn()});
      renderer!.root.find((node) =>
        node.props.accessibilityLabel === '빠른 홈 공지 미리보기 이미지 다시 불러오기')
        .props.onPress({stopPropagation: vi.fn()});
    });
    await act(async () => {
      newerRetry.resolve([
        {assetId: 101, detailUrl: 'detail-101', expiresAt: '2026-08-03T10:00:00Z', thumbnailUrl: 'thumb-101'},
        {assetId: 102, detailUrl: 'detail-102', expiresAt: '2026-08-03T10:00:00Z', thumbnailUrl: 'thumb-102'},
      ]);
      await flushPromises();
    });
    await act(async () => {
      const slowImage = renderer!.root.findAllByType('Image' as never)
        .find((node) => node.props.source.uri === 'thumb-101');
      slowImage?.props.onLoad();
      await flushPromises();
    });
    await act(async () => {
      olderRetry.resolve([]);
      await flushPromises();
    });

    expect(getMediaAccessUrls).toHaveBeenCalledTimes(3);
    expect(renderer!.root.findAll((node) =>
      node.props.accessibilityLabel === '느린 홈 공지 미리보기 이미지 다시 불러오기'))
      .toHaveLength(0);
    expect(renderer!.root.findAllByType('Image' as never).map((node) => node.props.source.uri))
      .toEqual(expect.arrayContaining(['thumb-101', 'thumb-102']));
  });

  it('shows a reserved loading thumbnail without a premature retry while the batch is pending', async () => {
    const mediaRequest = deferred<Array<{
      assetId: number;
      detailUrl: string;
      expiresAt: string;
      thumbnailUrl: string;
    }>>();
    const api = createApi({
      getMediaAccessUrls: vi.fn(() => mediaRequest.promise),
      listPublished: vi.fn().mockResolvedValue([
        summary(1, {imageAssetIds: [101], title: '홈 로딩 공지'}),
      ]),
    });
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <HomeAnnouncementSection
          api={api}
          campusId={1}
          onOpenAll={vi.fn()}
          onOpenAnnouncement={vi.fn()}
        />,
      );
      await flushPromises();
    });

    expect(renderer!.root.find((node) =>
      node.props.accessibilityLabel === '홈 로딩 공지 미리보기 이미지 불러오는 중'))
      .toBeTruthy();
    expect(renderer!.root.findAll((node) =>
      node.props.accessibilityLabel === '홈 로딩 공지 미리보기 이미지 다시 불러오기'))
      .toHaveLength(0);

    await act(async () => {
      mediaRequest.resolve([]);
      await flushPromises();
    });
    expect(renderer!.root.find((node) =>
      node.props.accessibilityLabel === '홈 로딩 공지 미리보기 이미지 다시 불러오기'))
      .toBeTruthy();
  });

  it('keeps an empty or failed announcement section local to the section', async () => {
    const api = createApi({listPublished: vi.fn().mockRejectedValue(new Error('offline'))});
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(
        <HomeAnnouncementSection
          api={api}
          campusId={1}
          onOpenAll={vi.fn()}
          onOpenAnnouncement={vi.fn()}
        />,
      );
      await flushPromises();
    });

    expect(renderedText(renderer!)).toContain('공지를 불러오지 못했습니다.');
    expect(renderer!.root.find((node) => node.props.accessibilityLabel === '홈 공지 다시 불러오기'))
      .toBeTruthy();
  });
});

function createApi(overrides: Partial<AnnouncementApi>): AnnouncementApi {
  return {
    archiveAnnouncement: vi.fn(),
    completeMediaUpload: vi.fn(),
    createAnnouncement: vi.fn(),
    createCategory: vi.fn(),
    getDetail: vi.fn(),
    getMediaAccessUrls: vi.fn().mockResolvedValue([]),
    listAdmin: vi.fn(),
    listCategories: vi.fn(),
    listPublished: vi.fn().mockResolvedValue([]),
    reserveMediaUpload: vi.fn(),
    updateAnnouncement: vi.fn(),
    updateCategory: vi.fn(),
    ...overrides,
  } as AnnouncementApi;
}

function summary(id: number, overrides: Partial<AnnouncementSummary> = {}): AnnouncementSummary {
  return {
    body: '본문',
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
  };
}

function press(renderer: ReturnType<typeof create>, accessibilityLabel: string) {
  const node = renderer.root.find((candidate) => candidate.props.accessibilityLabel === accessibilityLabel);
  act(() => node.props.onPress());
}

function renderedText(renderer: ReturnType<typeof create>) {
  return renderer.root.findAllByType('Text' as never)
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === 'string')
    .join(' ');
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return {promise, resolve};
}
