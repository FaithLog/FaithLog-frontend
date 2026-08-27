import {useEffect, useMemo, useState} from 'react';
import {Alert, Image, Linking, Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../theme';
import {
  extractBookmarkUrls,
  fetchLinkPreview,
  getBookmarkHost,
  stripBookmarkUrls,
  type LinkPreview,
} from './linkBookmarks';

const previewCache = new Map<string, LinkPreview>();

export function RichLinkBookmarks({
  loadPreview = fetchLinkPreview,
  text,
}: {
  loadPreview?: (url: string) => Promise<LinkPreview>;
  text: string;
}) {
  const urls = useMemo(() => extractBookmarkUrls(text), [text]);
  const visibleText = useMemo(() => stripBookmarkUrls(text), [text]);
  const [previews, setPreviews] = useState<Record<string, LinkPreview>>({});

  useEffect(() => {
    let active = true;
    for (const url of urls) {
      const cached = previewCache.get(url);
      if (cached) {
        setPreviews((current) => ({...current, [url]: cached}));
        continue;
      }
      void loadPreview(url)
        .then((preview) => {
          if (!active) return;
          previewCache.set(url, preview);
          setPreviews((current) => ({...current, [url]: preview}));
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [loadPreview, urls]);

  return (
    <View style={styles.shell}>
      {visibleText ? <Text style={styles.body}>{visibleText}</Text> : null}
      {urls.length > 0 ? (
        <View accessibilityLabel="첨부 링크" style={styles.bookmarkList}>
          {urls.map((url) => <BookmarkCard key={url} preview={previews[url]} url={url} />)}
        </View>
      ) : null}
    </View>
  );
}

function BookmarkCard({preview, url}: {preview: LinkPreview | undefined; url: string}) {
  const host = getBookmarkHost(url);
  const title = preview?.title || host;
  const open = async () => {
    try {
      if (!await Linking.canOpenURL(url)) throw new Error('UNSUPPORTED_LINK');
      await Linking.openURL(url);
    } catch {
      Alert.alert('링크를 열지 못했습니다', '잠시 후 다시 시도해 주세요.');
    }
  };

  return (
    <Pressable
      accessibilityHint="외부 브라우저에서 엽니다"
      accessibilityLabel={`링크 열기 ${title}`}
      accessibilityRole="link"
      onPress={() => void open()}
      style={({pressed}) => [styles.bookmark, pressed ? styles.pressed : null]}>
      <View style={styles.bookmarkCopy}>
        <Text numberOfLines={2} style={styles.bookmarkTitle}>{title}</Text>
        {preview?.description ? (
          <Text numberOfLines={2} style={styles.bookmarkDescription}>{preview.description}</Text>
        ) : null}
        <View style={styles.domainRow}>
          <View style={styles.domainMark}><Text style={styles.domainMarkText}>↗</Text></View>
          <Text numberOfLines={1} style={styles.domain}>{host}</Text>
        </View>
      </View>
      {preview?.imageUrl ? (
        <Image accessibilityIgnoresInvertColors source={{uri: preview.imageUrl}} style={styles.previewImage} />
      ) : (
        <View style={styles.previewFallback}><Text style={styles.previewFallbackText}>↗</Text></View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {...typography.body, color: colors.textPrimary},
  bookmark: {backgroundColor: colors.surface, borderColor: colors.borderSoft, borderRadius: radius.control, borderWidth: 1, flexDirection: 'row', minHeight: 104, overflow: 'hidden'},
  bookmarkCopy: {flex: 1, gap: 5, justifyContent: 'center', minWidth: 0, padding: 14},
  bookmarkDescription: {color: colors.textSecondary, fontSize: 13, lineHeight: 18},
  bookmarkList: {gap: spacing.gap},
  bookmarkTitle: {color: colors.textPrimary, fontSize: 15, fontWeight: '700', lineHeight: 20},
  domain: {color: colors.textMuted, flex: 1, fontSize: 12},
  domainMark: {alignItems: 'center', backgroundColor: colors.borderSoft, borderRadius: 5, height: 18, justifyContent: 'center', width: 18},
  domainMarkText: {color: colors.textSecondary, fontSize: 11, fontWeight: '800'},
  domainRow: {alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 2},
  pressed: {opacity: 0.74},
  previewFallback: {alignItems: 'center', backgroundColor: colors.borderSoft, justifyContent: 'center', width: 96},
  previewFallbackText: {color: colors.textMuted, fontSize: 28, fontWeight: '700'},
  previewImage: {backgroundColor: colors.borderSoft, width: 96},
  shell: {gap: 14},
});
