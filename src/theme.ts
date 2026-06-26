export const colors = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  primary: '#3182F6',
  faith: '#5BA8B0',
  mint: '#92C7CF',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  textPrimary: '#191F28',
  textSecondary: '#4E5968',
  textMuted: '#8B95A1',
  borderSoft: '#EEF1F4',
  primaryActive: '#F2F7FF',

  // Backward-compatible semantic aliases. Values must remain mapped to the
  // Foundations/Tokens swatches above.
  primarySoft: '#EEF1F4',
  teal: '#5BA8B0',
  tealSoft: '#92C7CF',
  text: '#191F28',
  mutedText: '#4E5968',
  subtleText: '#8B95A1',
  border: '#EEF1F4',
  neutralSoft: '#F7F8FA',
  dangerSoft: '#EEF1F4',
  warningSoft: '#EEF1F4',
  successSoft: '#EEF1F4',
  shadow: '#191F28',
};

export const spacing = {
  screenX: 24,
  card: 20,
  gap: 12,
  bottomSafe: 24,
};

export const typography = {
  screenTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 32,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: '600' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
};

export const radius = {
  card: 24,
  control: 14,
  item: 18,
  pill: 999,
};
