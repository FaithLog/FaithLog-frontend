import {memo} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {IconexIcon} from '../components/IconexIcon';
import {colors, spacing} from '../theme';

export const YearlyRecapHomeCard = memo(function YearlyRecapHomeCard({
  onPress,
  recapYear,
}: {
  onPress: () => void;
  recapYear: number;
}) {
  return (
    <Pressable
      accessibilityHint="지난 한 해의 FaithLog 활동을 장면별로 확인합니다."
      accessibilityLabel={`${recapYear}년 기록 돌아보기`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.card, pressed ? styles.pressed : null]}>
      <View style={styles.icon}>
        <IconexIcon color={colors.primary} name="calendar" size={22} strokeWidth={1.7} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>{recapYear}년 기록 돌아보기</Text>
        <Text style={styles.body}>FaithLog와 함께한 지난 한 해를 다시 확인해 보세요.</Text>
      </View>
      <View style={styles.action}>
        <Text style={styles.actionText}>보기</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  actionText: {color: colors.surface, fontSize: 14, fontWeight: '700'},
  body: {color: colors.textSecondary, fontSize: 14, lineHeight: 20},
  card: {
    alignItems: 'center',
    backgroundColor: '#EEF6FF',
    borderColor: '#DCEBFF',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.gap,
    minHeight: 104,
    padding: spacing.card,
  },
  copy: {flex: 1, gap: 4, minWidth: 0},
  icon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  pressed: {opacity: 0.78},
  title: {color: colors.textPrimary, fontSize: 17, fontWeight: '700', lineHeight: 23},
});
