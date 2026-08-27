import {Linking, StyleSheet, Text, type StyleProp, type TextStyle} from 'react-native';

import {colors} from '../theme';

export type LinkifiedTextSegment =
  | {kind: 'link'; url: string; value: string}
  | {kind: 'text'; value: string};

const WEB_LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>\[\]{}"']+/giu;
const TRAILING_PUNCTUATION_PATTERN = /[.,!?;:，。！？、)\]}]+$/u;

export function parseLinkifiedText(text: string): LinkifiedTextSegment[] {
  const segments: LinkifiedTextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(WEB_LINK_PATTERN)) {
    const matchIndex = match.index;
    const candidate = match[0];
    if (matchIndex === undefined || candidate === undefined) continue;

    if (matchIndex > cursor) appendText(segments, text.slice(cursor, matchIndex));

    const trailing = candidate.match(TRAILING_PUNCTUATION_PATTERN)?.[0] ?? '';
    const displayValue = trailing.length > 0 ? candidate.slice(0, -trailing.length) : candidate;
    const normalizedUrl = normalizeWebUrl(displayValue);

    if (normalizedUrl === null || displayValue.length === 0) {
      appendText(segments, candidate);
    } else {
      segments.push({kind: 'link', url: normalizedUrl, value: displayValue});
      appendText(segments, trailing);
    }
    cursor = matchIndex + candidate.length;
  }

  if (cursor < text.length) appendText(segments, text.slice(cursor));
  if (segments.length === 0) segments.push({kind: 'text', value: text});
  return segments;
}

export function LinkifiedText({
  linkStyle,
  style,
  text,
}: {
  linkStyle?: StyleProp<TextStyle>;
  style?: StyleProp<TextStyle>;
  text: string;
}) {
  const segments = parseLinkifiedText(text);
  return (
    <Text style={style}>
      {segments.map((segment, index) => segment.kind === 'link' ? (
        <Text
          accessibilityLabel={`링크 열기 ${segment.value}`}
          accessibilityRole="link"
          key={`${segment.url}-${index}`}
          onPress={() => void openWebUrl(segment.url)}
          style={[styles.link, linkStyle]}>
          {segment.value}
        </Text>
      ) : segment.value)}
    </Text>
  );
}

function appendText(segments: LinkifiedTextSegment[], value: string) {
  if (value.length === 0) return;
  const previous = segments.at(-1);
  if (previous?.kind === 'text') previous.value += value;
  else segments.push({kind: 'text', value});
}

function normalizeWebUrl(value: string) {
  const candidate = value.toLowerCase().startsWith('www.') ? `https://${value}` : value;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? candidate : null;
  } catch {
    return null;
  }
}

async function openWebUrl(url: string) {
  try {
    if (!await Linking.canOpenURL(url)) return;
    await Linking.openURL(url);
  } catch {
    // 링크 실행 실패는 공지 열람 흐름을 막지 않는다.
  }
}

const styles = StyleSheet.create({
  link: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
