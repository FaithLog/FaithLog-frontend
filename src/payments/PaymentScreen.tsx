import {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {
  FaithLogApiError,
  fetchChargeSummary,
  fetchMyCharges,
  fetchPaymentAccounts,
  markMyChargePaid,
} from '../api/client';
import {getApiErrorPresentation} from '../api/errorPolicy';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {
  ApiError,
  ChargeItem,
  ChargeList,
  ChargeStatus,
  ChargeSummary,
  MarkChargePaidResponse,
  PaymentAccount,
  PaymentCategory,
} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {
  Body,
  Button,
  Card,
  Chip,
  Conflict,
  Empty,
  ErrorState,
  Eyebrow,
  ListRow,
  Loading,
  Offline,
  PermissionDenied,
  Title,
} from '../components/ui';
import {colors, radius, spacing} from '../theme';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type Notice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

type PaymentScreenProps = {
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
  state: AuthenticatedState;
};

type CategoryFilter = 'ALL' | PaymentCategory;
type StatusFilter = 'ALL' | ChargeStatus;
type SortOption = 'createdAtDesc' | 'createdAtAsc' | 'dueDateAsc' | 'amountDesc';

type PaymentLoadState =
  | {status: 'loading'}
  | {
      status: 'success';
      accounts: PaymentAccount[];
      charges: ChargeList;
      summary: ChargeSummary;
    }
  | {status: 'error'; error: ApiError};

type PaymentActionState =
  | {status: 'idle'}
  | {status: 'markingPaid'; chargeItemId: number}
  | {status: 'complete'; charge: MarkChargePaidResponse}
  | {status: 'error'; error: ApiError};

const PAGE_SIZE = 20;

const categoryFilters: Array<{label: string; value: CategoryFilter}> = [
  {label: '전체', value: 'ALL'},
  {label: '벌금', value: 'PENALTY'},
  {label: '커피', value: 'COFFEE'},
];

const statusFilters: Array<{label: string; value: StatusFilter}> = [
  {label: '전체', value: 'ALL'},
  {label: '미납', value: 'UNPAID'},
  {label: '납부 완료', value: 'PAID'},
];

const sortOptions: Array<{label: string; value: SortOption}> = [
  {label: '최신순', value: 'createdAtDesc'},
  {label: '오래된순', value: 'createdAtAsc'},
  {label: '기한순', value: 'dueDateAsc'},
  {label: '금액순', value: 'amountDesc'},
];

export function PaymentScreen({setAuthState, setNotice, state}: PaymentScreenProps) {
  const campusId = state.selectedCampus.campusId;
  const today = useMemo(() => new Date(), []);
  const {month, year} = getYearMonth(today);
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [status, setStatus] = useState<StatusFilter>('UNPAID');
  const [sort, setSort] = useState<SortOption>('createdAtDesc');
  const [page, setPage] = useState(0);
  const [lastKnownLastPage, setLastKnownLastPage] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<PaymentLoadState>({status: 'loading'});
  const [actionState, setActionState] = useState<PaymentActionState>({status: 'idle'});

  const loadPayments = async (nextPage = page) => {
    const previousSuccess = loadState.status === 'success' ? loadState : null;
    setLoadState({status: 'loading'});
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const [summary, charges, accounts] = await Promise.all([
        fetchChargeSummary(accessToken, campusId, {year, month}),
        fetchMyCharges(accessToken, campusId, {
          page: nextPage,
          paymentCategory: category,
          size: PAGE_SIZE,
          sort: toChargeSort(sort),
          status,
        }),
        fetchPaymentAccounts(accessToken, campusId),
      ]);

      if (nextPage > 0 && charges.items.length === 0) {
        const fallbackPage = nextPage - 1;
        setLastKnownLastPage(fallbackPage);
        setPage(fallbackPage);

        if (previousSuccess) {
          setLoadState(previousSuccess);
          setNotice({
            tone: 'info',
            title: '마지막 페이지입니다',
            message: '더 이상 조회할 청구가 없어 직전 페이지로 돌아왔습니다.',
          });
          return;
        }

        const fallbackCharges = await fetchMyCharges(accessToken, campusId, {
          page: fallbackPage,
          paymentCategory: category,
          size: PAGE_SIZE,
          sort: toChargeSort(sort),
          status,
        });
        setLoadState({status: 'success', summary, charges: fallbackCharges, accounts});
        return;
      }

      if (charges.items.length < PAGE_SIZE) {
        setLastKnownLastPage(nextPage);
      }

      setPage(nextPage);
      setLoadState({status: 'success', summary, charges, accounts});
    } catch (error) {
      const apiError = toApiError(error, '납부 정보를 불러오지 못했습니다.');
      setLoadState({status: 'error', error: apiError});
      handleAuthError(apiError, setAuthState);
    }
  };

  useEffect(() => {
    setLastKnownLastPage(null);
    void loadPayments(0);
  }, [campusId, category, status, sort]);

  const markPaid = async (charge: ChargeItem) => {
    if (actionState.status === 'markingPaid' || charge.status !== 'UNPAID') {
      return;
    }

    if (!charge.account) {
      setActionState({
        status: 'error',
        error: {
          kind: 'conflict',
          message: '이 청구에 연결된 납부 계좌가 없습니다. 관리자에게 계좌 등록을 요청해 주세요.',
        },
      });
      return;
    }

    setActionState({status: 'markingPaid', chargeItemId: charge.id});
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const paid = await markMyChargePaid(accessToken, campusId, charge.id);
      setActionState({status: 'complete', charge: paid});
      setNotice({
        tone: 'success',
        title: '납부 완료 처리',
        message: `${paid.title} 항목을 납부 완료로 반영했습니다.`,
      });
      await loadPayments(page);
    } catch (error) {
      const apiError = toApiError(error, '납부 완료 처리를 하지 못했습니다.');
      setActionState({status: 'error', error: apiError});
      handleAuthError(apiError, setAuthState);
    }
  };

  if (loadState.status === 'error') {
    return <PaymentErrorState error={loadState.error} onRetry={() => loadPayments(page)} />;
  }

  if (loadState.status === 'loading') {
    return <Loading message="납부 요약, 청구 목록, 계좌 정보를 불러오고 있어요." />;
  }

  const {accounts, charges, summary} = loadState;
  const hasNextPage =
    charges.items.length >= PAGE_SIZE &&
    (lastKnownLastPage === null || page < lastKnownLastPage);
  const accountMissing = getAccountMissingState(accounts, charges.items, category);

  return (
    <View style={styles.figmaScreen}>
      <View style={styles.figmaHeader}>
        <Text style={styles.figmaTitle}>납부</Text>
        <View style={styles.figmaCampusChip}>
          <Text style={styles.figmaCampusText}>
            {state.selectedCampus.region} {state.selectedCampus.campusName}
          </Text>
        </View>
      </View>

      <View style={styles.paymentHeroCard}>
        <View style={styles.paymentHeroText}>
          <Text style={styles.paymentHeroLabel}>총 미납 금액</Text>
          <Text style={styles.paymentHeroAmount}>{formatWon(summary.monthlyUnpaidAmount)}</Text>
        </View>
        <Pressable
          accessibilityLabel="미납 항목 납부 확인"
          accessibilityRole="button"
          onPress={() => loadPayments(page)}
          style={styles.paymentHeroButton}>
          <Text style={styles.paymentHeroButtonText}>새로고침</Text>
        </Pressable>
      </View>

      {accountMissing ? (
        <PaymentAccountMissingState
          category={accountMissing}
          onContactAdmin={() =>
            setNotice({
              tone: 'warning',
              title: '관리자 문의',
              message: '캠퍼스 관리자에게 납부 계좌 등록 또는 청구 계좌 연결을 요청해 주세요.',
            })
          }
        />
      ) : null}

      {actionState.status === 'markingPaid' ? (
        <View style={styles.paymentStatusNotice}>
          <Text style={styles.paymentStatusTitle}>납부 완료 처리 중</Text>
          <Text style={styles.paymentStatusBody}>
            선택한 청구를 납부 완료로 바꾸고 있어요. 중복 처리를 막기 위해 잠시만 기다려 주세요.
          </Text>
        </View>
      ) : null}

      {actionState.status === 'complete' ? (
        <View style={styles.paymentStatusNotice}>
          <Text style={styles.paymentStatusTitle}>납부 완료</Text>
          <Text style={styles.paymentStatusBody}>
            {actionState.charge.title} 항목이 납부 완료로 바뀌었습니다.
          </Text>
        </View>
      ) : null}

      {actionState.status === 'error' ? (
        <PaymentErrorState
          error={actionState.error}
          onRetry={() => loadPayments(page)}
        />
      ) : null}

      <View style={styles.filterPanel}>
        <Text style={styles.figmaSectionTitle}>청구 항목</Text>
        <FilterRow
          accessibilityPrefix="납부 유형 필터"
          items={categoryFilters}
          onSelect={(value) => {
            setCategory(value);
            setLastKnownLastPage(null);
            setPage(0);
            setActionState({status: 'idle'});
          }}
          selected={category}
        />
        <FilterRow
          accessibilityPrefix="납부 상태 필터"
          items={statusFilters}
          onSelect={(value) => {
            setStatus(value);
            setLastKnownLastPage(null);
            setPage(0);
            setActionState({status: 'idle'});
          }}
          selected={status}
        />
        <FilterRow
          accessibilityPrefix="납부 목록 정렬"
          items={sortOptions}
          onSelect={(value) => {
            setSort(value);
            setLastKnownLastPage(null);
            setPage(0);
            setActionState({status: 'idle'});
          }}
          selected={sort}
        />
      </View>

      {charges.items.length === 0 ? (
        <Empty
          title="조회된 청구가 없습니다"
          message="선택한 필터에 맞는 청구가 없습니다. 필터를 바꾸거나 나중에 다시 확인해 주세요."
          actionLabel="전체 보기"
          actionAccessibilityLabel="납부 목록 필터 전체로 변경"
          onActionPress={() => {
            setCategory('ALL');
            setStatus('ALL');
            setLastKnownLastPage(null);
            setPage(0);
          }}
        />
      ) : (
        <View style={styles.chargeList}>
          <View style={styles.chargeList}>
            {charges.items.map((charge) => (
              <ChargeCard
                charge={charge}
                disabled={actionState.status === 'markingPaid'}
                key={charge.id}
                markingPaid={
                  actionState.status === 'markingPaid' &&
                  actionState.chargeItemId === charge.id
                }
                onMarkPaid={() => markPaid(charge)}
              />
            ))}
          </View>
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="이전 납부 목록 페이지"
              disabled={page === 0}
              onPress={() => loadPayments(Math.max(0, page - 1))}
              variant="secondary">
              이전
            </Button>
            <Button
              accessibilityLabel="다음 납부 목록 페이지"
              disabled={!hasNextPage}
              onPress={() => loadPayments(page + 1)}
              variant="secondary">
              다음
            </Button>
          </View>
        </View>
      )}

      <View style={styles.accountPanel}>
        <Text style={styles.figmaSectionTitle}>납부 계좌</Text>
        {accounts.length === 0 ? (
          <Body>현재 활성 납부 계좌가 없습니다. 관리자에게 계좌 등록을 요청해 주세요.</Body>
        ) : (
          <View style={styles.chargeList}>
            {accounts.map((account) => (
              <ListRow
                key={account.id}
                label={`${getPaymentCategoryLabel(account.accountType)} · ${account.bankName}`}
                supportingText={`${account.nickname} · ${account.accountHolder}`}
                value={account.accountNumber}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function FilterRow<T extends string>({
  accessibilityPrefix,
  items,
  onSelect,
  selected,
}: {
  accessibilityPrefix: string;
  items: Array<{label: string; value: T}>;
  onSelect: (value: T) => void;
  selected: T;
}) {
  return (
    <View style={styles.filterRow}>
      {items.map((item) => {
        const active = item.value === selected;

        return (
          <Pressable
            accessibilityLabel={`${accessibilityPrefix}: ${item.label}`}
            accessibilityRole="button"
            accessibilityState={{selected: active}}
            key={item.value}
            onPress={() => onSelect(item.value)}
            style={({pressed}) => [
              styles.filterChip,
              active ? styles.filterChipActive : null,
              pressed ? styles.pressed : null,
            ]}>
            <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PaymentAccountMissingState({
  category,
  onContactAdmin,
}: {
  category: CategoryFilter;
  onContactAdmin: () => void;
}) {
  return (
    <PermissionDenied
      title="납부 계좌가 필요합니다"
      message={`${getPaymentCategoryFilterLabel(category)} 청구를 납부하려면 활성 계좌가 필요합니다. 계좌가 없거나 청구에 연결되지 않은 상태입니다.`}
      actionLabel="관리자 문의"
      actionAccessibilityLabel="납부 계좌 없음 상태에서 관리자 문의 안내"
      onActionPress={onContactAdmin}
    />
  );
}

function ChargeCard({
  charge,
  disabled,
  markingPaid,
  onMarkPaid,
}: {
  charge: ChargeItem;
  disabled: boolean;
  markingPaid: boolean;
  onMarkPaid: () => void;
}) {
  const canMarkPaid = charge.status === 'UNPAID' && Boolean(charge.account);

  return (
    <View style={styles.figmaChargeRow}>
      <View style={styles.figmaChargeIcon}>
        <Text style={styles.figmaChargeIconText}>
          {charge.paymentCategory === 'COFFEE' ? 'C' : charge.status === 'PAID' ? '✓' : '₩'}
        </Text>
      </View>
      <View style={styles.figmaChargeText}>
        <Text style={styles.chargeTitle}>{charge.title}</Text>
        <Text style={styles.chargeReason}>
          {charge.status === 'PAID' ? '납부 완료' : charge.reason || getPaymentCategoryLabel(charge.paymentCategory)}
        </Text>
      </View>
      <Text style={styles.figmaChargeAmount}>{formatWon(charge.amount)}</Text>
      <Pressable
        accessibilityLabel={`${charge.title} 납부 완료 처리`}
        accessibilityRole="button"
        accessibilityState={{disabled: disabled || !canMarkPaid}}
        disabled={disabled || !canMarkPaid}
        onPress={onMarkPaid}
        style={({pressed}) => [
          styles.figmaChargeButton,
          !canMarkPaid ? styles.figmaChargeButtonDone : null,
          pressed ? styles.pressed : null,
        ]}>
        <Text style={styles.figmaChargeButtonText}>
          {markingPaid ? '처리' : charge.status === 'UNPAID' ? '입금' : '완료'}
        </Text>
      </Pressable>
    </View>
  );
}

function PaymentErrorState({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  const presentation = getApiErrorPresentation(error, {
    conflictTitle: '청구 상태가 바뀌었습니다',
    conflictMessage: '청구 또는 납부 상태가 최신 정보와 충돌했습니다. 최신 정보를 다시 불러와 주세요.',
    permissionTitle: '납부 정보를 볼 권한이 없습니다',
    permissionMessage: '현재 계정으로는 이 납부 정보를 확인하거나 처리할 수 없습니다.',
    defaultTitle: '납부 처리 중 문제가 발생했습니다',
  });

  switch (error.kind) {
    case 'sessionExpired':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="세션 만료 후 납부 정보 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'permissionDenied':
      return (
        <PermissionDenied
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="권한 오류 후 납부 정보 다시 확인"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title={presentation.title}
          message={presentation.message}
          actionLabel="최신 정보 불러오기"
          actionAccessibilityLabel="청구 충돌 후 최신 정보 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="오프라인 후 납부 정보 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="납부 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    default:
      return assertNever(error.kind);
  }
}

async function resolveAccessToken(setAuthState: (state: AuthGateState) => void) {
  const {accessToken} = await getStoredTokens();

  if (!accessToken) {
    setAuthState({status: 'sessionExpired', message: '저장된 access token이 없습니다.'});
    return null;
  }

  return accessToken;
}

function handleAuthError(error: ApiError, setAuthState: (state: AuthGateState) => void) {
  if (error.kind !== 'sessionExpired') {
    return;
  }

  void clearTokens();
  setAuthState({status: 'sessionExpired', message: error.message});
}

function toApiError(error: unknown, fallback: string): ApiError {
  if (error instanceof FaithLogApiError) {
    return error.detail;
  }

  return {kind: 'error', message: fallback};
}

function toChargeSort(sort: SortOption) {
  switch (sort) {
    case 'createdAtDesc':
      return {key: 'createdAt' as const, direction: 'desc' as const};
    case 'createdAtAsc':
      return {key: 'createdAt' as const, direction: 'asc' as const};
    case 'dueDateAsc':
      return {key: 'dueDate' as const, direction: 'asc' as const};
    case 'amountDesc':
      return {key: 'amount' as const, direction: 'desc' as const};
    default:
      return assertNever(sort);
  }
}

function getAccountMissingState(
  accounts: PaymentAccount[],
  items: ChargeItem[],
  category: CategoryFilter,
): CategoryFilter | null {
  if (category !== 'ALL' && !accounts.some((account) => account.accountType === category)) {
    return category;
  }

  if (accounts.length === 0) {
    return category;
  }

  const unpaidWithoutAccount = items.find((item) => item.status === 'UNPAID' && !item.account);

  return unpaidWithoutAccount?.paymentCategory ?? null;
}

function getPaymentCategoryLabel(category: PaymentCategory) {
  switch (category) {
    case 'PENALTY':
      return '벌금';
    case 'COFFEE':
      return '커피';
    default:
      return assertNever(category);
  }
}

function getPaymentCategoryFilterLabel(category: CategoryFilter) {
  return category === 'ALL' ? '전체' : getPaymentCategoryLabel(category);
}

function getChargeStatusLabel(status: ChargeStatus) {
  switch (status) {
    case 'UNPAID':
      return '미납';
    case 'PAID':
      return '납부 완료';
    case 'WAIVED':
      return '면제';
    case 'CANCELED':
      return '취소';
    default:
      return assertNever(status);
  }
}

function getChargeStatusTone(status: ChargeStatus) {
  switch (status) {
    case 'UNPAID':
      return 'warning';
    case 'PAID':
      return 'success';
    case 'WAIVED':
      return 'info';
    case 'CANCELED':
      return 'default';
    default:
      return assertNever(status);
  }
}

function getYearMonth(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

function formatWon(amount: number) {
  return `${Math.max(0, amount).toLocaleString('ko-KR')}원`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled payment state: ${String(value)}`);
}

const paymentColors = {
  card: '#FFFDF8',
  chip: '#ECE8D9',
  text: '#494949',
  muted: 'rgba(73, 73, 73, 0.72)',
  border: '#ECE5D4',
  dark: '#494949',
};

const styles = StyleSheet.create({
  accountPanel: {
    backgroundColor: paymentColors.card,
    borderRadius: 18,
    gap: 12,
    padding: 20,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    marginTop: spacing.gap,
  },
  amountText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  categorySummary: {
    gap: 10,
  },
  categorySummaryBody: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  categorySummaryItem: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.item,
    gap: 3,
    padding: spacing.gap,
  },
  categorySummaryTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  chargeHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  chargeItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.item,
    borderWidth: 1,
    gap: spacing.gap,
    padding: spacing.gap,
  },
  chargeList: {
    gap: spacing.gap,
  },
  chargeReason: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  chargeTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  chargeTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.pill,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterChipActive: {
    backgroundColor: colors.primarySoft,
  },
  filterChipText: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '800',
  },
  filterChipTextActive: {
    color: colors.primary,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  figmaCampusChip: {
    alignItems: 'center',
    backgroundColor: paymentColors.chip,
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    minWidth: 86,
    paddingHorizontal: 12,
  },
  figmaCampusText: {
    color: paymentColors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
  },
  figmaChargeAmount: {
    color: paymentColors.text,
    fontSize: 15,
    fontWeight: '800',
    minWidth: 64,
    textAlign: 'right',
  },
  figmaChargeButton: {
    alignItems: 'center',
    backgroundColor: paymentColors.dark,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 58,
  },
  figmaChargeButtonDone: {
    backgroundColor: paymentColors.chip,
  },
  figmaChargeButtonText: {
    color: paymentColors.card,
    fontSize: 12,
    fontWeight: '700',
  },
  figmaChargeIcon: {
    alignItems: 'center',
    backgroundColor: paymentColors.chip,
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  figmaChargeIconText: {
    color: paymentColors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  figmaChargeRow: {
    alignItems: 'center',
    backgroundColor: paymentColors.card,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    paddingHorizontal: 20,
  },
  figmaChargeText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  figmaHeader: {
    alignItems: 'flex-start',
    gap: 10,
  },
  figmaScreen: {
    gap: 20,
    paddingTop: 2,
  },
  figmaSectionTitle: {
    color: paymentColors.text,
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 23,
  },
  figmaTitle: {
    color: paymentColors.text,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
  },
  filterPanel: {
    gap: 12,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.72,
  },
  paymentHeroAmount: {
    color: paymentColors.text,
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 50,
  },
  paymentHeroButton: {
    alignItems: 'center',
    backgroundColor: paymentColors.dark,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 96,
  },
  paymentHeroButtonText: {
    color: paymentColors.card,
    fontSize: 12,
    fontWeight: '700',
  },
  paymentHeroCard: {
    alignItems: 'center',
    backgroundColor: paymentColors.card,
    borderRadius: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 130,
    paddingHorizontal: 24,
  },
  paymentHeroLabel: {
    color: paymentColors.text,
    fontSize: 14,
    lineHeight: 17,
  },
  paymentHeroText: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  paymentStatusBody: {
    color: paymentColors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  paymentStatusNotice: {
    backgroundColor: paymentColors.card,
    borderRadius: 18,
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  paymentStatusTitle: {
    color: paymentColors.text,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
  },
  summaryGrid: {
    gap: 8,
  },
});
