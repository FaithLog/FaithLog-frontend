import {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {colors, radius} from '../theme';
import type {AnnouncementCategory} from './announcementTypes';

export const AnnouncementCategoryBadge = memo(function AnnouncementCategoryBadge({
  category,
}: {
  category: AnnouncementCategory;
}) {
  return (
    <View accessibilityLabel={`카테고리 ${category.name}`} style={styles.badge}>
      <View accessibilityElementsHidden style={[styles.dot, {backgroundColor: category.color}]} />
      <Text numberOfLines={1} style={styles.label}>{category.name}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.background, borderRadius: radius.pill, flexDirection: 'row', gap: 6, minHeight: 28, paddingHorizontal: 10},
  dot: {borderRadius: 4, height: 8, width: 8},
  label: {color: colors.textSecondary, fontSize: 13, fontWeight: '700'},
});
