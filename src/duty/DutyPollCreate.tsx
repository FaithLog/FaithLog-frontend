import type {PropsWithChildren} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../theme';
import {DutyFormSection} from './DutyPresentation';

export function DutyPollCreateShell({children}: PropsWithChildren) {
  return <View style={styles.shell}>{children}</View>;
}

export function DutyPollCreateHeader({description, title}: {description: string; title: string}) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

export function DutyPollTypeCard({
  description,
  iconLabel,
  title,
}: {
  description: string;
  iconLabel: string;
  title: string;
}) {
  return (
    <DutyFormSection>
      <View style={styles.typeCard}>
        <View style={styles.typeIcon}>
          <Text style={styles.typeIconText}>{iconLabel}</Text>
        </View>
        <View style={styles.grow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionDescription}>{description}</Text>
        </View>
        <View style={styles.fixedPill}>
          <Text style={styles.fixedPillText}>고정</Text>
        </View>
      </View>
    </DutyFormSection>
  );
}

export function DutyDateTimeField({
  accessibilityLabel,
  disabled = false,
  hint = '달력과 시간 선택으로 마감 시각을 정합니다.',
  label,
  onPress,
  value,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  hint?: string;
  label: string;
  onPress: () => void;
  value: string;
}) {
  return (
    <DutyFormSection>
      <Text style={styles.eyebrow}>{label}</Text>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{disabled}}
        disabled={disabled}
        onPress={onPress}
        style={({pressed}) => [
          styles.dateTimeField,
          disabled ? styles.disabled : null,
          pressed ? styles.pressed : null,
        ]}>
        <Text style={styles.dateTimeLabel}>{label}</Text>
        <Text style={styles.dateTimeValue}>{value}</Text>
        <Text style={styles.dateTimeHint}>{hint}</Text>
      </Pressable>
    </DutyFormSection>
  );
}

export function DutyToggleField({
  accessibilityLabel,
  checked,
  description,
  disabled = false,
  onPress,
  title,
}: {
  accessibilityLabel: string;
  checked: boolean;
  description: string;
  disabled?: boolean;
  onPress: () => void;
  title: string;
}) {
  return (
    <DutyFormSection>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="switch"
        accessibilityState={{checked, disabled}}
        disabled={disabled}
        onPress={onPress}
        style={({pressed}) => [styles.toggleRow, disabled ? styles.disabled : null, pressed ? styles.pressed : null]}>
        <View style={styles.grow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionDescription}>{description}</Text>
        </View>
        <View style={[styles.toggle, checked ? styles.toggleActive : null]}>
          <Text style={[styles.toggleText, checked ? styles.toggleTextActive : null]}>
            {checked ? 'ON' : 'OFF'}
          </Text>
        </View>
      </Pressable>
    </DutyFormSection>
  );
}

export const dutyPollCreateStyles = StyleSheet.create({
  actions: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.gap},
  addButton: {
    alignItems: 'center', backgroundColor: '#E8F3FF', borderRadius: radius.control,
    justifyContent: 'center', minHeight: 48, minWidth: 58, paddingHorizontal: 14,
  },
  addButtonText: {color: colors.primary, fontSize: 13, fontWeight: '800'},
  disabled: {opacity: 0.48},
  field: {flex: 1, minWidth: 0},
  optionIndicator: {
    alignItems: 'center', backgroundColor: '#E8F3FF', borderRadius: 18,
    height: 36, justifyContent: 'center', width: 36,
  },
  optionIndicatorText: {color: colors.primary, fontSize: 14, fontWeight: '800'},
  optionList: {gap: spacing.gap},
  optionRow: {alignItems: 'center', flexDirection: 'row', gap: 10},
  removeButton: {
    alignItems: 'center', borderColor: colors.borderSoft, borderRadius: radius.control,
    borderWidth: 1, justifyContent: 'center', minHeight: 48, minWidth: 48,
  },
  removeButtonText: {color: colors.textMuted, fontSize: 20, fontWeight: '700'},
  sectionHeader: {
    alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.gap,
    justifyContent: 'space-between',
  },
  sectionHeaderText: {flex: 1, gap: 4, minWidth: 0},
});

const styles = StyleSheet.create({
  dateTimeField: {
    backgroundColor: colors.borderSoft, borderRadius: radius.item, gap: 6,
    minHeight: 82, paddingHorizontal: 16, paddingVertical: 14,
  },
  dateTimeHint: {color: colors.textMuted, fontSize: 12, fontWeight: '600', lineHeight: 17},
  dateTimeLabel: {color: colors.textMuted, fontSize: 13, fontWeight: '800', lineHeight: 18},
  dateTimeValue: {color: colors.textPrimary, fontSize: 18, fontWeight: '900', lineHeight: 25},
  description: {...typography.body, color: colors.textSecondary},
  disabled: {opacity: 0.48},
  eyebrow: {...typography.label, color: colors.primary},
  fixedPill: {backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7},
  fixedPillText: {color: colors.primary, fontSize: 13, fontWeight: '800'},
  grow: {flex: 1, gap: 4, minWidth: 0},
  header: {gap: 6},
  pressed: {opacity: 0.75},
  sectionDescription: {...typography.body, color: colors.textSecondary},
  sectionTitle: {...typography.cardTitle, color: colors.textPrimary},
  shell: {gap: spacing.card, paddingBottom: spacing.card},
  title: {...typography.screenTitle, color: colors.textPrimary},
  toggle: {
    alignItems: 'center', backgroundColor: colors.borderSoft, borderRadius: radius.pill,
    justifyContent: 'center', minHeight: 48, minWidth: 58, paddingHorizontal: 12,
  },
  toggleActive: {backgroundColor: colors.primary},
  toggleRow: {alignItems: 'center', flexDirection: 'row', gap: spacing.gap, minHeight: 48},
  toggleText: {color: colors.textMuted, fontSize: 12, fontWeight: '900'},
  toggleTextActive: {color: colors.surface},
  typeCard: {
    alignItems: 'flex-start', backgroundColor: '#F0F9FA', borderColor: colors.faith,
    borderRadius: radius.item, borderWidth: 1.5, flexDirection: 'row', gap: spacing.gap,
    padding: 16,
  },
  typeIcon: {
    alignItems: 'center', backgroundColor: colors.faith, borderRadius: radius.item,
    height: 48, justifyContent: 'center', width: 48,
  },
  typeIconText: {color: colors.surface, fontSize: 14, fontWeight: '900'},
});
