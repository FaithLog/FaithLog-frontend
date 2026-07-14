import {StyleSheet, Text} from 'react-native';

import {FaithLogApiError} from '../api/client';
import type {ApiError} from '../api/types';
import {Card, Title} from '../components/ui';
import {DutyActionButton, DutyAsyncState} from '../duty/DutyPresentation';
import {colors, radius, spacing} from '../theme';
import {
  getMealErrorPresentation,
  MealLocalValidationError,
  notifyMealSessionExpired,
} from './mealModel';
import type {MealRequestIdentity, MealRequestTracker} from './mealRequestLifecycle';

export type MealLoadState<T> =
  | {status: 'loading'}
  | {status: 'success'; data: T}
  | {status: 'empty'}
  | {status: 'error'; error: ApiError};

export function MealErrorState({error, onRetry}: {error: ApiError; onRetry?: () => void}) {
  const presentation = getMealErrorPresentation(error);

  return <DutyAsyncState
    {...(onRetry && presentation.retryable
      ? {
          actionAccessibilityLabel: `${presentation.actionLabel} 실행`,
          actionLabel: presentation.actionLabel,
          onAction: onRetry,
        }
      : {})}
    message={presentation.message}
    status="error"
    title={presentation.title}
  />;
}

export function MealLoading({label}: {label: string}) {
  return <DutyAsyncState message={label} status="loading" />;
}

export function MealRefreshWarning({onRetry}: {onRetry: () => void}) {
  return (
    <Card>
      <Title>처리는 완료됐어요</Title>
      <Text style={mealStyles.body}>최신 상태를 불러오지 못했습니다. 다시 불러와 확인해 주세요.</Text>
      <DutyActionButton accessibilityLabel="최신 상태 다시 불러오기" label="다시 불러오기" onPress={onRetry} />
    </Card>
  );
}

export function toMealApiError(
  error: unknown,
  fallback: string,
): ApiError {
  if (error instanceof FaithLogApiError) {
    return error.detail;
  }

  if (error instanceof MealLocalValidationError) {
    return {kind: 'error', status: 400, code: error.code, message: error.message};
  }

  return {kind: 'error', message: fallback};
}

export function getCurrentMealRequestError({
  error,
  fallback,
  identity,
  onSessionExpired,
  tracker,
}: {
  error: unknown;
  fallback: string;
  identity: MealRequestIdentity;
  onSessionExpired: (message: string) => void;
  tracker: MealRequestTracker;
}) {
  const apiError = toMealApiError(error, fallback);
  if (!tracker.shouldApplyError(identity, apiError)) return null;
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
  content: {
    gap: spacing.card,
    paddingBottom: 130,
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
  frame: {
    backgroundColor: colors.background,
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  header: {
    gap: spacing.gap,
    marginBottom: spacing.gap,
  },
  headerText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  kicker: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
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
  pressed: {
    opacity: 0.75,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: spacing.gap,
    maxHeight: '90%',
    padding: spacing.card,
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.46)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetSummaryScroll: {
    flexShrink: 1,
    maxHeight: 420,
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
