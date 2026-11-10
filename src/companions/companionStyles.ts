import {StyleSheet} from 'react-native';
import {colors, radius, spacing, typography} from '../theme';
export const companionStyles = StyleSheet.create({
  page: {gap: spacing.gap},
  row: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8},
  between: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  stack: {gap: 10},
  title: {...typography.sectionTitle, color: colors.textPrimary},
  name: {...typography.cardTitle, color: colors.textPrimary},
  body: {...typography.body, color: colors.textSecondary},
  caption: {...typography.caption, color: colors.textSecondary},
  points: {...typography.screenTitle, color: colors.primary},
  action: {flexGrow: 1, flexBasis: 90, minWidth: 0},
  card: {backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.card, gap: 12},
  notice: {backgroundColor: colors.faithSoft, borderRadius: radius.control, padding: 12, gap: 6},
  tabs: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 12},
  tile: {flexBasis: '46%', flexGrow: 1, maxWidth: '100%', backgroundColor: colors.surface, borderRadius: radius.item, padding: 12, gap: 8, alignItems: 'center'},
  selected: {backgroundColor: colors.primarySoft},
  detail: {alignItems: 'center', gap: 12},
  message: {color: colors.faith, ...typography.caption},
});
