import {describe, expect, it} from 'vitest';

import {extractBookmarkUrls, parseLinkPreviewHtml, stripBookmarkUrls} from './linkBookmarks';

describe('linkBookmarks', () => {
  it('extracts unique http links and removes sentence punctuation', () => {
    expect(extractBookmarkUrls([
      '안내는 https://faithlog.kr/guide 에서 확인해 주세요.',
      '같은 링크 https://faithlog.kr/guide, 다른 링크 https://example.com/news).',
    ].join('\n'))).toEqual([
      'https://faithlog.kr/guide',
      'https://example.com/news',
    ]);
  });

  it('does not preview unsafe schemes, credentials, or local network links', () => {
    expect(extractBookmarkUrls([
      'javascript:alert(1)',
      'https://user:secret@example.com/private',
      'http://localhost:8080/internal',
      'http://127.0.0.1/internal',
      'https://safe.example/path',
    ].join(' '))).toEqual(['https://safe.example/path']);
  });

  it('reads open graph metadata without exposing markup', () => {
    expect(parseLinkPreviewHtml(`
      <html><head>
        <meta property="og:title" content="FaithLog &amp; 공동체" />
        <meta property="og:description" content="함께 기록하는 경건 생활" />
        <meta property="og:image" content="/preview.png" />
      </head></html>
    `, 'https://faithlog.kr/news')).toEqual({
      description: '함께 기록하는 경건 생활',
      imageUrl: 'https://faithlog.kr/preview.png',
      title: 'FaithLog & 공동체',
    });
  });

  it('removes previewed URL text while preserving the surrounding message', () => {
    expect(stripBookmarkUrls('자세한 내용은 https://faithlog.kr/news 에서 확인해 주세요.'))
      .toBe('자세한 내용은 에서 확인해 주세요.');
  });
});
