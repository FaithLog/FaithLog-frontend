import {useMemo, useState} from 'react';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, radius} from '../theme';
import {
  buildAnnouncementShareContent,
  buildPollShareContent,
  contentShareCoordinator,
  type ShareContent,
} from './contentSharing';

type Props =
  | {announcementId: number; campusId: number; categoryName: string; kind: 'announcement'; title: string}
  | {campusId: number; kind: 'poll'; pollId: number; title: string};

export function ContentShareActions(props: Props) {
  const [busy, setBusy] = useState(false);
  const content = useMemo<ShareContent | null>(() => {
    try {
      return props.kind === 'poll'
        ? buildPollShareContent(props)
        : buildAnnouncementShareContent(props);
    } catch {
      return null;
    }
  }, [props]);

  const share = async () => {
    if (busy) return;
    if (!content) {
      Alert.alert('공유를 사용할 수 없습니다', '현재 빌드의 공유 설정을 확인해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const result = await contentShareCoordinator.share('link', content);
      if (result.status === 'busy') return;
    } catch {
      Alert.alert('공유하지 못했습니다', '잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityLabel="링크 공유"
        accessibilityRole="button"
        disabled={busy}
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          void share();
        }}
        style={({pressed}) => [styles.trigger, pressed && styles.pressed]}>
        <Text style={styles.triggerIcon}>↗</Text>
        <Text style={styles.triggerText}>공유</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {opacity: 0.72},
  trigger: {alignItems: 'center', alignSelf: 'flex-end', backgroundColor: colors.primarySoft, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', minHeight: 36, paddingHorizontal: 11},
  triggerIcon: {color: colors.primary, fontSize: 17, fontWeight: '800', lineHeight: 19},
  triggerText: {color: colors.primary, fontSize: 13, fontWeight: '800'},
  wrapper: {alignSelf: 'flex-end', position: 'relative'},
});
