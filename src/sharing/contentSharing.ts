import {Share} from 'react-native';

import {trackContentShareCompleted, trackContentShareStarted} from '../analytics/appAnalytics';

export const PRODUCTION_CONTENT_LINK_BASE_URL = 'https://app.faithlog.kr';

export type SharedContentType = 'announcement' | 'poll';
export type ContentDeepLinkTarget = {
  campusId: number;
  contentId: number;
  type: SharedContentType;
};
export type ShareContent = {
  buttonTitle: string;
  contentType: SharedContentType;
  description: string;
  title: string;
  url: string;
};
export type ShareResult = {status: 'busy' | 'cancelled' | 'completed'};
type ShareAdapterResult = {status: 'cancelled' | 'completed'};

export function createContentDeepLinkDeduper(
  windowMs = 1_000,
  now: () => number = Date.now,
) {
  let last: {key: string; openedAt: number} | null = null;
  return {
    clear() {
      last = null;
    },
    shouldOpen(target: ContentDeepLinkTarget) {
      const key = `${target.type}:${target.campusId}:${target.contentId}`;
      const openedAt = now();
      if (last?.key === key && openedAt - last.openedAt < windowMs) return false;
      last = {key, openedAt};
      return true;
    },
  };
}

export function buildPollShareContent(input: {
  campusId: number;
  pollId: number;
  title: string;
}, baseUrl = resolveContentLinkBaseUrl()): ShareContent {
  const campusId = requirePositiveSafeInteger(input.campusId, 'campusId');
  const contentId = requirePositiveSafeInteger(input.pollId, 'pollId');
  return {
    buttonTitle: '투표 참여하기',
    contentType: 'poll',
    description: input.title,
    title: '새 투표가 등록되었어요',
    url: `${baseUrl}/campuses/${campusId}/polls/${contentId}`,
  };
}

export function buildAnnouncementShareContent(input: {
  announcementId: number;
  campusId: number;
  categoryName: string;
  title: string;
}, baseUrl = resolveContentLinkBaseUrl()): ShareContent {
  const campusId = requirePositiveSafeInteger(input.campusId, 'campusId');
  const contentId = requirePositiveSafeInteger(input.announcementId, 'announcementId');
  return {
    buttonTitle: '공지 확인하기',
    contentType: 'announcement',
    description: `[${input.categoryName}] ${input.title}`,
    title: '새 공지가 등록되었어요',
    url: `${baseUrl}/campuses/${campusId}/announcements/${contentId}`,
  };
}

export function parseContentDeepLink(rawUrl: string): ContentDeepLinkTarget | null {
  try {
    const url = new URL(rawUrl);
    const isProductionHttps = url.origin === PRODUCTION_CONTENT_LINK_BASE_URL;
    const isFaithLogAppUrl = url.protocol === 'faithlog:' && url.hostname === '';
    if ((!isProductionHttps && !isFaithLogAppUrl) || url.search || url.hash) return null;
    const match = /^\/campuses\/([1-9][0-9]*)\/(polls|announcements)\/([1-9][0-9]*)\/?$/.exec(
      url.pathname,
    );
    if (!match) return null;
    const campusId = Number(match[1]);
    const contentId = Number(match[3]);
    if (!Number.isSafeInteger(campusId) || !Number.isSafeInteger(contentId)) return null;
    return {campusId, contentId, type: match[2] === 'polls' ? 'poll' : 'announcement'};
  } catch {
    return null;
  }
}

export function createContentShareCoordinator(adapters: {
  shareKakao: (content: ShareContent) => Promise<ShareAdapterResult>;
  shareLink: (content: ShareContent) => Promise<ShareAdapterResult>;
}) {
  let busy = false;
  return {
    async share(channel: 'kakao' | 'link', content: ShareContent): Promise<ShareResult> {
      if (busy) return {status: 'busy'};
      busy = true;
      trackContentShareStarted(content.contentType);
      try {
        const result = channel === 'kakao'
          ? await adapters.shareKakao(content)
          : await adapters.shareLink(content);
        if (result.status === 'completed') {
          trackContentShareCompleted(content.contentType, channel);
        }
        return result;
      } finally {
        busy = false;
      }
    },
  };
}

export const contentShareCoordinator = createContentShareCoordinator({
  shareKakao: async (content) => {
    const {shareWithKakaoTalk} = await import('./nativeKakaoShare');
    return shareWithKakaoTalk(content);
  },
  shareLink: async (content) => {
    const result = await Share.share({
      message: `${content.title}\n${content.description}\n${content.url}`,
      title: content.title,
      url: content.url,
    });
    return {status: result.action === Share.dismissedAction ? 'cancelled' : 'completed'};
  },
});

export function resolveContentLinkBaseUrl() {
  const appEnv = process.env.EXPO_PUBLIC_APP_ENV;
  if (appEnv === 'production') return PRODUCTION_CONTENT_LINK_BASE_URL;
  const configured = process.env.EXPO_PUBLIC_CONTENT_LINK_BASE_URL?.trim();
  if (!configured) throw new Error('Content sharing is not configured for this environment.');
  const parsed = new URL(configured);
  const isLocalHttp = parsed.protocol === 'http:' && parsed.hostname === 'localhost';
  const isIsolatedHttps = parsed.protocol === 'https:'
    && parsed.origin !== PRODUCTION_CONTENT_LINK_BASE_URL;
  const isOriginOnly = parsed.pathname === '/'
    && !parsed.search
    && !parsed.hash
    && !parsed.username
    && !parsed.password;
  if ((!isLocalHttp && !isIsolatedHttps) || !isOriginOnly) {
    throw new Error('Content sharing base URL is invalid.');
  }
  return parsed.origin;
}

function requirePositiveSafeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} is invalid.`);
  return value;
}
