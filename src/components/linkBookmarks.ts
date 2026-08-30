export type LinkPreview = {
  description: string | null;
  imageUrl: string | null;
  title: string;
};

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[),.\]}>!?;:'"，。！？；：、]+$/u;
const MAX_BOOKMARKS = 4;

export function extractBookmarkUrls(text: string): string[] {
  const unique = new Set<string>();
  for (const candidate of text.match(URL_PATTERN) ?? []) {
    const normalized = candidate.replace(TRAILING_PUNCTUATION, '');
    if (!isSafePublicUrl(normalized)) continue;
    unique.add(normalized);
    if (unique.size === MAX_BOOKMARKS) break;
  }
  return [...unique];
}

export function getBookmarkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function stripBookmarkUrls(text: string): string {
  return text
    .replace(URL_PATTERN, (candidate) => {
      const normalized = candidate.replace(TRAILING_PUNCTUATION, '');
      return isSafePublicUrl(normalized) ? candidate.slice(normalized.length) : candidate;
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseLinkPreviewHtml(html: string, sourceUrl: string): LinkPreview {
  const properties = new Map<string, string>();
  for (const tag of html.slice(0, 250_000).match(/<meta\s+[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/gi)) {
      const attributeName = match[1];
      const attributeValue = match[2];
      if (attributeName !== undefined && attributeValue !== undefined) {
        attributes.set(attributeName.toLowerCase(), decodeHtml(attributeValue).trim());
      }
    }
    const key = attributes.get('property') ?? attributes.get('name');
    const content = attributes.get('content');
    if (key && content) properties.set(key.toLowerCase(), content);
  }

  const documentTitle = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const title = properties.get('og:title') ?? properties.get('twitter:title') ?? documentTitle ?? '';
  const description = properties.get('og:description') ?? properties.get('description') ?? null;
  const rawImage = properties.get('og:image') ?? properties.get('twitter:image') ?? null;
  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      const resolved = new URL(rawImage, sourceUrl).toString();
      imageUrl = isSafePublicUrl(resolved) ? resolved : null;
    } catch {
      imageUrl = null;
    }
  }

  return {
    description: description ? description.replace(/\s+/g, ' ').trim().slice(0, 220) : null,
    imageUrl,
    title: title.replace(/\s+/g, ' ').trim().slice(0, 140) || getBookmarkHost(sourceUrl),
  };
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  if (!isSafePublicUrl(url)) throw new Error('UNSAFE_LINK');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, {
      headers: {Accept: 'text/html,application/xhtml+xml'},
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('PREVIEW_UNAVAILABLE');
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('PREVIEW_UNAVAILABLE');
    }
    return parseLinkPreviewHtml(await response.text(), url);
  } finally {
    clearTimeout(timer);
  }
}

function isSafePublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return false;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
    const private172 = host.match(/^172\.(\d{1,3})\./);
    const private172SecondOctet = private172?.[1];
    if (private172SecondOctet !== undefined
      && Number(private172SecondOctet) >= 16
      && Number(private172SecondOctet) <= 31) return false;
    return true;
  } catch {
    return false;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}
