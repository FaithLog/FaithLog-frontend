import {Pressable, StyleSheet, Text, View} from 'react-native';
import {IconexIcon} from '../components/IconexIcon';
import {colors, radius, spacing} from '../theme';
import type {ShepherdAttendanceHome} from './shepherdAttendanceTypes';

export function ShepherdAttendanceHomeCard({data, onPress}: {data: ShepherdAttendanceHome; onPress: () => void}) {
  if (!data.visible || data.assignedGroupCount === 0) return null;
  const complete = data.submittedGroupCount === data.assignedGroupCount;
  return (
    <Pressable accessibilityLabel="주간 목홀타 입력" accessibilityRole="button" onPress={onPress}
      style={({pressed}) => [styles.card, complete ? styles.completeCard : null, pressed ? styles.pressed : null]}>
      <View style={[styles.icon, complete ? styles.completeIcon : null]}>
        <IconexIcon color={complete ? colors.success : colors.primary} name={complete ? 'check' : 'document'} size={22} strokeWidth={1.8} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{complete ? '이번 주 목홀타 입력 완료' : '이번 주 목홀타를 입력해 주세요'}</Text>
        <Text style={styles.body}>{data.submittedGroupCount}/{data.assignedGroupCount}개 목장 입력 완료</Text>
      </View>
      <Text style={styles.action}>{complete ? '보기' : '입력'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, flexDirection: 'row', gap: spacing.gap, padding: spacing.gap},
  completeCard: {backgroundColor: '#F2FBF6', borderColor: '#BFE8CF'},
  icon: {alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 14, height: 46, justifyContent: 'center', width: 46},
  completeIcon: {backgroundColor: '#E2F6EA'}, text: {flex: 1, minWidth: 0},
  title: {color: colors.text, fontSize: 15, fontWeight: '800'}, body: {color: colors.mutedText, fontSize: 13, marginTop: 4},
  action: {color: colors.primary, fontSize: 14, fontWeight: '800'}, pressed: {opacity: 0.78},
});
