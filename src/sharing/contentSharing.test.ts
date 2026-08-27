import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('react-native', () => ({
  Share: {dismissedAction: 'dismissedAction', share: vi.fn()},
}));
vi.mock('./nativeKakaoShare', () => ({shareWithKakaoTalk: vi.fn()}));

import {
  buildAnnouncementShareContent,
  buildPollShareContent,
  createContentDeepLinkDeduper,
  createContentShareCoordinator,
  parseContentDeepLink,
  resolveContentLinkBaseUrl,
} from './contentSharing';

describe('content sharing contract', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
  });
  it('builds exact poll and announcement links with campus identity', () => {
    expect(buildPollShareContent({campusId: 7, pollId: 31, title: '점심 메뉴'})).toEqual({
      buttonTitle: '투표 참여하기',
      contentType: 'poll',
      description: '점심 메뉴',
      title: '새 투표가 등록되었어요',
      url: 'https://app.faithlog.kr/campuses/7/polls/31',
    });
    expect(buildAnnouncementShareContent({
      announcementId: 41,
      campusId: 7,
      categoryName: '예배',
      title: '주일 안내',
    })).toEqual({
      buttonTitle: '공지 확인하기',
      contentType: 'announcement',
      description: '[예배] 주일 안내',
      title: '새 공지가 등록되었어요',
      url: 'https://app.faithlog.kr/campuses/7/announcements/41',
    });
  });

  it('rejects unsafe ids and never accepts Cloud Run or unrelated paths', () => {
    expect(() => buildPollShareContent({campusId: 0, pollId: 1, title: 'x'})).toThrow();
    expect(parseContentDeepLink('https://faithlog-123.run.app/campuses/1/polls/2')).toBeNull();
    expect(parseContentDeepLink('https://app.faithlog.kr/campuses/1/users/2')).toBeNull();
    expect(parseContentDeepLink('https://app.faithlog.kr/campuses/1/polls/2?token=secret')).toBeNull();
  });

  it('requires an explicit isolated origin outside production', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';

    process.env.EXPO_PUBLIC_CONTENT_LINK_BASE_URL = 'http://localhost:4173';
    expect(resolveContentLinkBaseUrl()).toBe('http://localhost:4173');

    process.env.EXPO_PUBLIC_CONTENT_LINK_BASE_URL = 'https://preview.faithlog.example';
    expect(resolveContentLinkBaseUrl()).toBe('https://preview.faithlog.example');

    process.env.EXPO_PUBLIC_CONTENT_LINK_BASE_URL = 'https://app.faithlog.kr';
    expect(() => resolveContentLinkBaseUrl()).toThrow();

    process.env.EXPO_PUBLIC_CONTENT_LINK_BASE_URL = 'https://preview.faithlog.example/path?token=x';
    expect(() => resolveContentLinkBaseUrl()).toThrow();
  });

  it('parses only the two allowed routes into structured identifiers', () => {
    expect(parseContentDeepLink('https://app.faithlog.kr/campuses/1/polls/2')).toEqual({
      campusId: 1,
      contentId: 2,
      type: 'poll',
    });
    expect(parseContentDeepLink('https://app.faithlog.kr/campuses/3/announcements/4')).toEqual({
      campusId: 3,
      contentId: 4,
      type: 'announcement',
    });
  });

  it('deduplicates one delivery burst without blocking a later explicit reopen', () => {
    let time = 10_000;
    const deduper = createContentDeepLinkDeduper(1_000, () => time);
    const target = {campusId: 1, contentId: 2, type: 'poll'} as const;

    expect(deduper.shouldOpen(target)).toBe(true);
    time += 200;
    expect(deduper.shouldOpen(target)).toBe(false);
    time += 1_000;
    expect(deduper.shouldOpen(target)).toBe(true);
    deduper.clear();
    expect(deduper.shouldOpen(target)).toBe(true);
  });

  it('single-flights share actions and treats OS cancellation as non-error', async () => {
    let resolve!: (value: {status: 'cancelled' | 'completed'}) => void;
    const shareLink = vi.fn(() => new Promise<{status: 'cancelled' | 'completed'}>((done) => {
      resolve = done;
    }));
    const coordinator = createContentShareCoordinator({shareKakao: vi.fn(), shareLink});
    const content = buildPollShareContent({campusId: 1, pollId: 2, title: '투표'});

    const first = coordinator.share('link', content);
    const second = coordinator.share('link', content);
    expect(shareLink).toHaveBeenCalledOnce();
    resolve({status: 'cancelled'});
    await expect(first).resolves.toEqual({status: 'cancelled'});
    await expect(second).resolves.toEqual({status: 'busy'});
  });

  it('passes only the allowlisted card fields to the native Kakao adapter', async () => {
    const shareKakao = vi.fn().mockResolvedValue({status: 'completed'});
    const coordinator = createContentShareCoordinator({shareKakao, shareLink: vi.fn()});
    const content = buildAnnouncementShareContent({
      announcementId: 2,
      campusId: 1,
      categoryName: '일반',
      title: '공지',
    });

    await coordinator.share('kakao', content);
    expect(shareKakao).toHaveBeenCalledWith(content);
    expect(JSON.stringify(shareKakao.mock.calls)).not.toMatch(/jwt|authorization|cloudrun|r2/i);
  });
});
