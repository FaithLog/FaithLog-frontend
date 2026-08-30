import {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {isActiveDutyForRequest} from '../admin/adminMemberDutyFilter';
import {FaithLogApiError, fetchMyDutyAssignment} from '../api/client';
import {
  getAuthSessionGeneration,
  isAuthSessionRequestAllowed,
  StaleAuthSessionReadError,
} from '../api/tokenStorage';
import type {MyDutyAssignment} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {shouldHandleRequestError} from '../auth/requestErrorLineage';
import {IconexIcon, type IconexIconName} from '../components/IconexIcon';
import {mealApi} from '../meal/mealApi';
import type {MealMyDutyAssignment} from '../meal/mealTypes';
import {colors, radius, typography} from '../theme';

type DutyAccess = 'allowed' | 'error' | 'hidden' | 'loading';

type DutyAccessState = {
  coffee: DutyAccess;
  meal: DutyAccess;
};

export type HomeDutyManagementApi = {
  getCoffeeDuty: (
    accessToken: string,
    campusId: number,
    userId: number,
  ) => Promise<MyDutyAssignment>;
  getMealDuty: (
    accessToken: string,
    campusId: number,
    userId: number,
  ) => Promise<MealMyDutyAssignment>;
};

const runtimeApi: HomeDutyManagementApi = {
  getCoffeeDuty: (accessToken, campusId) => fetchMyDutyAssignment(accessToken, campusId),
  getMealDuty: (accessToken, campusId, userId) =>
    mealApi.getMyDuty(accessToken, campusId, userId),
};

export function HomeDutyManagementCards({
  api = runtimeApi,
  campusId,
  onOpenCoffee,
  onOpenMeal,
  setAuthState,
  userId,
}: {
  api?: HomeDutyManagementApi;
  campusId: number;
  onOpenCoffee: () => void;
  onOpenMeal: () => void;
  setAuthState: (state: AuthGateState) => void;
  userId: number;
}) {
  const [accessState, setAccessState] = useState<DutyAccessState>({
    coffee: 'loading',
    meal: 'loading',
  });
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestSequence = useRef(0);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    const requestGeneration = getAuthSessionGeneration();
    setAccessState({coffee: 'loading', meal: 'loading'});

    void (async () => {
      try {
        const accessToken = await resolveCurrentAccessToken((generation) => {
          if (
            sequence === requestSequence.current &&
            generation === requestGeneration
          ) {
            setAuthState({
              status: 'sessionExpired',
              message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
            });
          }
        });

        if (
          !accessToken ||
          sequence !== requestSequence.current ||
          !isAuthSessionRequestAllowed(requestGeneration)
        ) {
          return;
        }

        const [coffeeResult, mealResult] = await Promise.allSettled([
          api.getCoffeeDuty(accessToken, campusId, userId),
          api.getMealDuty(accessToken, campusId, userId),
        ]);

        if (
          sequence !== requestSequence.current ||
          !isAuthSessionRequestAllowed(requestGeneration)
        ) {
          return;
        }

        const coffee = getDutyResultState(coffeeResult, (duty) =>
          isActiveDutyForRequest(duty, {campusId, dutyType: 'COFFEE', userId}),
        );
        const meal = getDutyResultState(mealResult, (duty) =>
          duty.campusId === campusId &&
          duty.userId === userId &&
          duty.dutyType === 'MEAL' &&
          duty.isActive,
        );
        const sessionExpiredError = [coffeeResult, mealResult]
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason)
          .find((error) => isCurrentSessionExpiredError(error, requestGeneration));

        if (sessionExpiredError instanceof FaithLogApiError) {
          setAuthState({status: 'sessionExpired', message: sessionExpiredError.detail.message});
          return;
        }

        setAccessState({coffee, meal});
      } catch (error) {
        if (
          error instanceof StaleAuthSessionReadError ||
          sequence !== requestSequence.current ||
          !isAuthSessionRequestAllowed(requestGeneration)
        ) {
          return;
        }
        if (isCurrentSessionExpiredError(error, requestGeneration) && error instanceof FaithLogApiError) {
          setAuthState({status: 'sessionExpired', message: error.detail.message});
          return;
        }
        setAccessState({coffee: 'error', meal: 'error'});
      }
    })();

    return () => {
      if (sequence === requestSequence.current) {
        requestSequence.current += 1;
      }
    };
  }, [api, campusId, reloadVersion, setAuthState, userId]);

  const showCoffee = accessState.coffee === 'allowed';
  const showMeal = accessState.meal === 'allowed';
  const hasError = accessState.coffee === 'error' || accessState.meal === 'error';

  if (!showCoffee && !showMeal && !hasError) {
    return null;
  }

  return (
    <View accessibilityLabel="담당 관리" style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>담당 관리</Text>
      <View style={styles.cardList}>
        {showCoffee ? (
          <DutyManagementCard
            accessibilityLabel="커피 정산 관리 열기"
            body="커피 투표·계좌·정산"
            icon="coins"
            onPress={onOpenCoffee}
            title="커피 정산 관리"
          />
        ) : null}
        {showMeal ? (
          <DutyManagementCard
            accessibilityLabel="밥 정산 관리 열기"
            body="밥 투표·계좌·정산"
            icon="receipt"
            onPress={onOpenMeal}
            title="밥 정산 관리"
          />
        ) : null}
        {hasError ? (
          <View accessibilityRole="alert" style={styles.errorRow}>
            <Text style={styles.errorText}>일부 담당 정보를 확인하지 못했어요.</Text>
            <Pressable
              accessibilityLabel="담당 관리 권한 다시 확인"
              accessibilityRole="button"
              onPress={() => setReloadVersion((current) => current + 1)}
              style={({pressed}) => [styles.retryButton, pressed ? styles.pressed : null]}>
              <Text style={styles.retryButtonText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DutyManagementCard({
  accessibilityLabel,
  body,
  icon,
  onPress,
  title,
}: {
  accessibilityLabel: string;
  body: string;
  icon: IconexIconName;
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.card, pressed ? styles.pressed : null]}>
      <View style={styles.icon}>
        <IconexIcon color={colors.primary} name={icon} size={22} strokeWidth={1.7} />
      </View>
      <View style={styles.cardText}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.cardTitle}>{title}</Text>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.cardBody}>{body}</Text>
      </View>
      <View style={styles.actionPill}>
        <Text style={styles.actionText}>관리</Text>
      </View>
    </Pressable>
  );
}

function getDutyResultState<T>(
  result: PromiseSettledResult<T>,
  isAllowed: (value: T) => boolean,
): DutyAccess {
  if (result.status === 'fulfilled') {
    return isAllowed(result.value) ? 'allowed' : 'hidden';
  }

  if (result.reason instanceof FaithLogApiError) {
    if (
      result.reason.detail.kind === 'permissionDenied' ||
      result.reason.detail.code?.endsWith('_NOT_FOUND')
    ) {
      return 'hidden';
    }
    if (result.reason.detail.kind === 'sessionExpired') {
      return 'hidden';
    }
  }

  return 'error';
}

function isCurrentSessionExpiredError(error: unknown, requestGeneration: number) {
  return error instanceof FaithLogApiError &&
    error.detail.kind === 'sessionExpired' &&
    shouldHandleRequestError(
      error.detail,
      requestGeneration,
      getAuthSessionGeneration(),
    );
}

const styles = StyleSheet.create({
  actionPill: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 58,
  },
  actionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 14,
    minHeight: 84,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  cardBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  cardList: {
    gap: 12,
  },
  cardText: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  cardTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  errorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 4,
  },
  errorText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 15,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pressed: {
    opacity: 0.78,
  },
  retryButton: {
    alignItems: 'center',
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  retryButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
});
