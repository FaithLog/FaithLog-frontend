import {StyleSheet} from 'react-native';

import {colors, radius, spacing} from '../theme';

export const pollCreateDesign = StyleSheet.create({
  actions: {flexDirection: 'row', gap: 10},
  addOption: {
    alignItems: 'center', backgroundColor: '#E8F3FF', borderRadius: 14, height: 48,
    justifyContent: 'center', minWidth: 58, paddingHorizontal: 12,
  },
  addOptionText: {color: colors.primary, fontSize: 13, fontWeight: '800'},
  deadlineCard: {
    backgroundColor: colors.borderSoft, borderRadius: radius.item, gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  deadlineDateField: {flexBasis: 190, flexGrow: 2, minWidth: 170},
  deadlineFields: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  deadlineHint: {color: colors.textMuted, fontSize: 12, fontWeight: '600', lineHeight: 17},
  deadlineLabel: {color: colors.textMuted, fontSize: 13, fontWeight: '800', lineHeight: 18},
  deadlineTimeField: {flexBasis: 110, flexGrow: 1, minWidth: 108},
  description: {color: colors.textSecondary, fontSize: 15, lineHeight: 22},
  disabled: {opacity: 0.48},
  fixedPill: {
    alignItems: 'center', backgroundColor: colors.borderSoft, borderRadius: 14,
    height: 40, justifyContent: 'center', minWidth: 58, paddingHorizontal: 12,
  },
  fixedPillText: {color: colors.textSecondary, fontSize: 13, fontWeight: '800'},
  fixedSelection: {
    backgroundColor: colors.borderSoft, borderRadius: radius.item, gap: 6,
    padding: 16, position: 'relative',
  },
  fixedSelectionDescription: {
    color: colors.textSecondary, fontSize: 13, lineHeight: 19, paddingRight: 68,
  },
  fixedSelectionPill: {
    backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 12,
    paddingVertical: 7, position: 'absolute', right: 14, top: 14,
  },
  fixedSelectionPillText: {color: colors.primary, fontSize: 12, fontWeight: '800'},
  fixedSelectionTitle: {color: colors.textPrimary, fontSize: 16, fontWeight: '800', lineHeight: 22},
  fixedTypeCard: {alignItems: 'center', flexDirection: 'row', gap: 14},
  header: {gap: 6},
  headerText: {flex: 1, gap: 6, minWidth: 0},
  optionField: {flex: 1, minWidth: 0},
  optionList: {gap: 12},
  optionNumber: {
    alignItems: 'center', backgroundColor: '#E8F3FF', borderRadius: 18,
    height: 36, justifyContent: 'center', width: 36,
  },
  optionNumberText: {color: colors.primary, fontSize: 14, fontWeight: '800'},
  optionRow: {alignItems: 'center', flexDirection: 'row', gap: 10},
  pressed: {opacity: 0.75},
  primaryAction: {
    alignItems: 'center', backgroundColor: colors.primary, borderRadius: 18,
    flex: 1, justifyContent: 'center', minHeight: 54,
  },
  primaryActionText: {color: colors.surface, fontSize: 16, fontWeight: '800'},
  removeOption: {
    alignItems: 'center', backgroundColor: colors.borderSoft, borderRadius: 18,
    height: 48, justifyContent: 'center', width: 48,
  },
  removeOptionText: {color: colors.textSecondary, fontSize: 20, fontWeight: '800', lineHeight: 22},
  secondaryAction: {
    alignItems: 'center', backgroundColor: colors.borderSoft, borderRadius: 18,
    flex: 1, justifyContent: 'center', minHeight: 54,
  },
  secondaryActionText: {color: colors.textSecondary, fontSize: 16, fontWeight: '800'},
  sectionDescription: {
    color: colors.textSecondary, flexShrink: 1, fontSize: 13, lineHeight: 19,
  },
  sectionHeader: {
    alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.gap,
    justifyContent: 'space-between',
  },
  sectionTitle: {color: colors.textPrimary, fontSize: 16, fontWeight: '800', lineHeight: 22},
  shell: {gap: 16, paddingBottom: 8},
  title: {color: colors.textPrimary, fontSize: 22, fontWeight: '800', lineHeight: 30},
  toggle: {
    alignItems: 'center', backgroundColor: colors.borderSoft, borderRadius: 18,
    height: 36, justifyContent: 'center', minWidth: 58, paddingHorizontal: 12,
  },
  toggleActive: {backgroundColor: '#E8F3FF'},
  toggleRow: {
    alignItems: 'center', flexDirection: 'row', gap: 14, justifyContent: 'space-between',
  },
  toggleText: {color: colors.textSecondary, fontSize: 13, fontWeight: '800'},
  toggleTextActive: {color: colors.primary},
  typeIcon: {
    alignItems: 'center', backgroundColor: '#E8F6F7', borderRadius: 15,
    height: 42, justifyContent: 'center', width: 42,
  },
  typeIconText: {color: colors.faith, fontSize: 15, fontWeight: '800'},
});
