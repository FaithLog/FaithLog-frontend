import {StyleSheet, Text, View} from 'react-native';

import {FaithLogApiError} from '../api/client';
import type {ApiError} from '../api/types';
import {Button, Card, Chip, Loading, Title} from '../components/ui';
import {colors, radius, spacing} from '../theme';
import {getMealErrorPresentation, notifyMealSessionExpired} from './mealModel';

export type MealLoadState<T> =
  | {status: 'loading'}
  | {status: 'success'; data: T}
  | {status: 'empty'}
  | {status: 'error'; error: ApiError};

export function MealErrorState({error, onRetry}: {error: ApiError; onRetry?: () => void}) {
  const presentation = getMealErrorPresentation(error);
  const statusLabel = error.status ? `${error.status}` : error.code ?? 'ERROR';

  return (
    <Card>
      <View style={mealStyles.rowBetween}>
        <Chip label={statusLabel} tone={error.status === 403 ? 'warning' : 'default'} />
      </View>
      <Title>{presentation.title}</Title>
      <Text style={mealStyles.body}>{presentation.message}</Text>
      {onRetry && presentation.retryable ? (
        <Button accessibilityLabel={`${presentation.actionLabel} 실행`} onPress={onRetry}>
          {presentation.actionLabel}
        </Button>
      ) : null}
    </Card>
  );
}

export function MealLoading({label}: {label: string}) {
  return <Loading message={label} />;
}

export function toMealApiError(
  error: unknown,
  fallback: string,
  onSessionExpired?: (message: string) => void,
): ApiError {
  let apiError: ApiError;

  if (error instanceof FaithLogApiError) {
    apiError = error.detail;
  } else if (error instanceof Error && error.message.trim()) {
    apiError = {kind: 'error', status: 400, message: error.message};
  } else {
    apiError = {kind: 'error', message: fallback};
  }

  notifyMealSessionExpired(apiError, onSessionExpired);

  return apiError;
}

export const mealStyles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  dangerText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  fieldGroup: {
    gap: 10,
  },
  list: {
    gap: spacing.gap,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  page: {
    gap: spacing.gap,
    paddingBottom: spacing.card,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: spacing.gap,
    padding: spacing.card,
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.46)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  softBox: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.item,
    gap: 6,
    padding: 14,
  },
  successText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
