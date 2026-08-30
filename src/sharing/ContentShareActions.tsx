import {useMemo, useState} from 'react';
import {Alert, Image, Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, radius} from '../theme';
import {
  buildAnnouncementShareContent,
  buildPollShareContent,
  contentShareCoordinator,
  type ShareContent,
} from './contentSharing';
import {KAKAO_TALK_SHARING_ICON_DATA_URI} from './kakaoTalkSharingIcon';

type Props =
  | {announcementId: number; campusId: number; categoryName: string; kind: 'announcement'; title: string}
  | {campusId: number; kind: 'poll'; pollId: number; title: string};

export function ContentShareActions(props: Props) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const content = useMemo<ShareContent | null>(() => {
    try {
      return props.kind === 'poll'
        ? buildPollShareContent(props)
        : buildAnnouncementShareContent(props);
    } catch {
      return null;
    }
  }, [props]);

  const share = async (channel: 'kakao' | 'link') => {
    if (busy) return;
    setMenuOpen(false);
    if (!content) {
      Alert.alert('공유를 사용할 수 없습니다', '현재 빌드의 공유 설정을 확인해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const result = await contentShareCoordinator.share(channel, content);
      if (result.status === 'busy') return;
    } catch {
      Alert.alert('공유하지 못했습니다', '잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrapper, menuOpen ? styles.wrapperOpen : null]}>
      <Pressable
        accessibilityLabel="공유 방법 열기"
        accessibilityRole="button"
        disabled={busy}
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          setMenuOpen((current) => !current);
        }}
        style={({pressed}) => [styles.trigger, pressed && styles.pressed]}>
        <Text style={styles.triggerIcon}>↗</Text>
        <Text style={styles.triggerText}>공유</Text>
      </Pressable>
      {menuOpen ? (
        <View accessibilityLabel="공유 방법" style={styles.dropdown}>
          <Text style={styles.dropdownTitle}>공유 방법</Text>
          <Pressable
            accessibilityLabel="링크 공유"
            accessibilityRole="button"
            disabled={busy}
            onPress={(event) => {
              event.stopPropagation();
              void share('link');
            }}
            style={({pressed}) => [styles.option, pressed && styles.pressed]}>
            <View style={styles.linkIconBox}><LinkIcon /></View>
            <Text style={styles.linkOptionText}>링크 공유</Text>
          </Pressable>
          <View style={styles.separator} />
          <Pressable
            accessibilityLabel="카카오톡으로 공유"
            accessibilityRole="button"
            disabled={busy}
            onPress={(event) => {
              event.stopPropagation();
              void share('kakao');
            }}
            style={({pressed}) => [styles.option, pressed && styles.pressed]}>
            <KakaoIcon />
            <Text style={styles.kakaoOptionText}>카카오톡</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function LinkIcon() {
  return <Text style={styles.linkIcon}>↗</Text>;
}

function KakaoIcon() {
  return (
    <Image
      accessibilityIgnoresInvertColors
      source={{uri: KAKAO_TALK_SHARING_ICON_DATA_URI}}
      style={styles.kakaoIcon}
    />
  );
}

const styles = StyleSheet.create({
  dropdown: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, elevation: 9, padding: 6, position: 'absolute', right: 0, shadowColor: colors.shadow, shadowOffset: {height: 5, width: 0}, shadowOpacity: 0.16, shadowRadius: 12, top: 42, width: 168, zIndex: 100},
  dropdownTitle: {color: colors.textMuted, fontSize: 11, fontWeight: '700', paddingBottom: 5, paddingHorizontal: 9, paddingTop: 3},
  kakaoIcon: {height: 28, width: 28},
  kakaoOptionText: {color: '#191919', fontSize: 14, fontWeight: '800'},
  linkIcon: {color: colors.primary, fontSize: 20, fontWeight: '800', lineHeight: 22},
  linkIconBox: {alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, height: 32, justifyContent: 'center', width: 32},
  linkOptionText: {color: colors.primary, fontSize: 14, fontWeight: '800'},
  option: {alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 10, minHeight: 46, paddingHorizontal: 9},
  pressed: {opacity: 0.72},
  separator: {backgroundColor: colors.border, height: 1, marginHorizontal: 7},
  trigger: {alignItems: 'center', alignSelf: 'flex-end', backgroundColor: colors.primarySoft, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', minHeight: 36, paddingHorizontal: 11},
  triggerIcon: {color: colors.primary, fontSize: 17, fontWeight: '800', lineHeight: 19},
  triggerText: {color: colors.primary, fontSize: 13, fontWeight: '800'},
  wrapper: {alignSelf: 'flex-end', position: 'relative'},
  wrapperOpen: {elevation: 10, zIndex: 100},
});
