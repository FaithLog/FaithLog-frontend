import type {PropsWithChildren} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, spacing} from '../theme';

type ButtonProps = PropsWithChildren<{
  accessibilityLabel: string;
  variant?: 'primary' | 'secondary' | 'danger';
  onPress: () => void;
}>;

export function Screen({children}: PropsWithChildren) {
  return <View style={styles.screen}>{children}</View>;
}

export function Card({children}: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

export function Eyebrow({children}: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({children}: PropsWithChildren) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({children}: PropsWithChildren) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Pill({children}: PropsWithChildren) {
  return <Text style={styles.pill}>{children}</Text>;
}

export function LoadingState({message}: {message: string}) {
  return (
    <Card>
      <View style={styles.loadingRow}>
        <ActivityIndicator color={colors.primary} />
        <Body>{message}</Body>
      </View>
    </Card>
  );
}

export function Button({
  accessibilityLabel,
  children,
  onPress,
  variant = 'primary',
}: ButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        variant === 'secondary' ? styles.secondaryButton : null,
        variant === 'danger' ? styles.dangerButton : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' ? styles.secondaryButtonText : null,
        ]}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenX,
    paddingTop: 28,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.card,
    shadowColor: '#1f2937',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    gap: spacing.gap,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 36,
  },
  body: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  secondaryButton: {
    backgroundColor: colors.primarySoft,
  },
  dangerButton: {
    backgroundColor: colors.danger,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: colors.primary,
  },
  pressed: {
    opacity: 0.78,
  },
});
