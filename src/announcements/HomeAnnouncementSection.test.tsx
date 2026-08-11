import React from 'react';
import {act, create} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders one pinned notice and this week latest notice without image previews', async () => {
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
    expect(text).not.toContain('최신 공지 B');
    expect(text).not.toContain('목록에서만 보이는 공지');
    expect(text.match(/고정 공지/g)).toHaveLength(1);
    expect(api.getMediaAccessUrls).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByType('Image' as never)).toHaveLength(0);

    press(renderer!, '캠퍼스 공지 전체 보기');
    press(renderer!, '고정 공지 상세 보기');
    expect(onOpenAll).toHaveBeenCalledTimes(1);
    expect(onOpenAnnouncement).toHaveBeenCalledWith(1);
  });

  it('omits an ordinary latest notice when it was not published this week', async () => {
    const api = createApi({
      listPublished: vi.fn().mockResolvedValue([
        summary(1, {pinned: true, title: '고정 공지'}),
        summary(2, {publishedAt: '2026-07-31T09:00:00Z', publishAt: '2026-07-31T09:00:00Z', title: '지난주 공지'}),
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
    expect(text).toContain('고정 공지');
    expect(text).not.toContain('지난주 공지');
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
    expect(text).not.toContain('두 번째 최신 공지');
    expect(text).not.toContain('오래된 공지');
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
    deactivateCategory: vi.fn(),
    getDetail: vi.fn(),
    getMediaAccessUrls: vi.fn().mockResolvedValue([]),
    listAdmin: vi.fn(),
    listCategories: vi.fn(),
    listPublished: vi.fn().mockResolvedValue([]),
    publishAnnouncement: vi.fn(),
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
    attachmentCount: overrides.attachmentCount ?? 0,
    documentAssetIds: overrides.documentAssetIds ?? [],
    hasAttachments: overrides.hasAttachments ?? false,
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
