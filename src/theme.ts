export const colors = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  primary: '#2368D3',
  faith: '#2E7078',
  mint: '#92C7CF',
  // Mint identifies community/devotion content; blue identifies actions.
  faithSoft: '#E8F6F7',
  danger: '#BF2B2B',
  success: '#147A3A',
  warning: '#A65B00',
  textPrimary: '#191F28',
  textSecondary: '#4E5968',
  textMuted: '#8B95A1',
  borderSoft: '#EEF1F4',

  // Semantic backgrounds pair with the matching foreground for readable status labels.
  primarySoft: '#E8F3FF',
  teal: '#2E7078',
  tealSoft: '#E8F6F7',
  text: '#191F28',
  mutedText: '#4E5968',
  subtleText: '#8B95A1',
  border: '#EEF1F4',
  neutralSoft: '#F7F8FA',
  dangerSoft: '#FEE2E2',
  warningSoft: '#FFF4DB',
  successSoft: '#E8F5EC',
  shadow: '#191F28',
};

export const spacing = {
  screenX: 24,
  card: 20,
  gap: 12,
  bottomSafe: 24,
};

export const typography = {
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    lineHeight: 28,
  },
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
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
  },
};

export const radius = {
  card: 24,
  control: 14,
  item: 18,
  pill: 999,
};

// Compact controls retain a full touch target even when their text is smaller.
export const control = {
  height: 48,
  compactHeight: 44,
  paddingX: 16,
};
