import {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {
  FaithLogApiError,
  fetchChargeSummary,
  fetchMyCharges,
  fetchPaymentAccounts,
  markMyChargePaid,
} from '../api/client';
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
    <>
      <Card>
        <Eyebrow>User 09 Payment</Eyebrow>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Chip label={`${state.selectedCampus.region} ${state.selectedCampus.campusName}`} tone="info" />
            <Title>내 납부</Title>
            <Body>이번 달 요약과 청구 목록을 확인하고, 미납 항목은 바로 납부 완료 처리합니다.</Body>
          </View>
          <Button
            accessibilityLabel="납부 정보 다시 불러오기"
            onPress={() => loadPayments(page)}
            variant="ghost">
            새로고침
          </Button>
        </View>
        <View style={styles.summaryGrid}>
          <ListRow
            label="이번 달 미납"
            supportingText="createdAt 기준"
            value={formatWon(summary.monthlyUnpaidAmount)}
          />
          <ListRow
            label="이번 달 납부"
            supportingText="paidAt 기준"
            value={formatWon(summary.monthlyPaidAmount)}
          />
          <ListRow
            label="전체 납부"
            supportingText={summary.name}
            value={formatWon(summary.totalPaidAmount)}
          />
        </View>
        {summary.monthlyByCategory.length > 0 ? (
          <View style={styles.categorySummary}>
            {summary.monthlyByCategory.map((item) => (
              <View key={item.paymentCategory} style={styles.categorySummaryItem}>
                <Text style={styles.categorySummaryTitle}>
                  {getPaymentCategoryLabel(item.paymentCategory)}
                </Text>
                <Text style={styles.categorySummaryBody}>
                  미납 {formatWon(item.unpaidAmount)} · 납부 {formatWon(item.paidAmount)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

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
        <Card>
          <Eyebrow>Status 06 Payment Mark Loading</Eyebrow>
          <Title>납부 완료 처리 중</Title>
          <Body>선택한 청구를 PAID로 반영하고 있어요. 중복 처리를 막기 위해 잠시만 기다려 주세요.</Body>
        </Card>
      ) : null}

      {actionState.status === 'complete' ? (
        <Card>
          <Eyebrow>Status 07 Payment Mark Complete</Eyebrow>
          <Title>납부 완료</Title>
          <Body>{actionState.charge.title} 항목이 즉시 납부 완료로 바뀌었습니다.</Body>
        </Card>
      ) : null}

      {actionState.status === 'error' ? (
        <PaymentErrorState
          error={actionState.error}
          onRetry={() => loadPayments(page)}
        />
      ) : null}

      <Card>
        <Eyebrow>필터</Eyebrow>
        <Title>청구 목록</Title>
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
      </Card>

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
        <Card>
          <Eyebrow>{charges.campusName}</Eyebrow>
          <Title>{page + 1}페이지</Title>
          <Body>
            총 {formatWon(charges.summary.totalAmount)} · 미납 {formatWon(charges.summary.unpaidAmount)}
          </Body>
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
        </Card>
      )}

      <Card>
        <Eyebrow>납부 계좌</Eyebrow>
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
      </Card>
    </>
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
    <View style={styles.chargeItem}>
      <View style={styles.chargeHeader}>
        <View style={styles.chargeTitleBlock}>
          <Text style={styles.chargeTitle}>{charge.title}</Text>
          <Text style={styles.chargeReason}>{charge.reason}</Text>
        </View>
        <Chip label={getChargeStatusLabel(charge.status)} tone={getChargeStatusTone(charge.status)} />
      </View>
      <View style={styles.metaRow}>
        <Chip label={getPaymentCategoryLabel(charge.paymentCategory)} tone="info" />
        <Text style={styles.amountText}>{formatWon(charge.amount)}</Text>
      </View>
      <ListRow
        label="납부 기한"
        supportingText={charge.paidAt ? `납부 완료 ${formatDateTime(charge.paidAt)}` : '미납 상태'}
        value={charge.dueDate ?? '기한 없음'}
      />
      {charge.account ? (
        <ListRow
          label={`${charge.account.bankName} ${charge.account.accountHolder}`}
          supportingText="청구 생성 시점 계좌 snapshot"
          value={charge.account.accountNumber}
        />
      ) : (
        <PermissionDenied
          title="연결된 계좌가 없습니다"
          message="이 청구 항목에는 납부 계좌 snapshot이 없어 납부 완료 처리를 막았습니다."
        />
      )}
      <Button
        accessibilityLabel={`${charge.title} 납부 완료 처리`}
        disabled={disabled || !canMarkPaid}
        onPress={onMarkPaid}
        variant={canMarkPaid ? 'primary' : 'secondary'}>
        {markingPaid ? '처리 중...' : charge.status === 'UNPAID' ? '납부했어요' : '처리 완료'}
      </Button>
    </View>
  );
}

function PaymentErrorState({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  switch (error.kind) {
    case 'sessionExpired':
      return (
        <ErrorState
          title="다시 로그인이 필요합니다"
          message={error.message}
          actionLabel="다시 시도"
          actionAccessibilityLabel="세션 만료 후 납부 정보 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'permissionDenied':
      return (
        <PermissionDenied
          title="납부 정보를 볼 권한이 없습니다"
          message={error.message}
          actionLabel="다시 확인"
          actionAccessibilityLabel="권한 오류 후 납부 정보 다시 확인"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title="청구 상태가 바뀌었습니다"
          message={error.message}
          actionLabel="최신 정보 불러오기"
          actionAccessibilityLabel="청구 충돌 후 최신 정보 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title="네트워크 연결이 필요합니다"
          message={error.message}
          actionLabel="다시 시도"
          actionAccessibilityLabel="오프라인 후 납부 정보 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return (
        <ErrorState
          title="납부 처리 중 문제가 발생했습니다"
          message={error.message}
          actionLabel="다시 시도"
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

const styles = StyleSheet.create({
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
  summaryGrid: {
    gap: 8,
  },
});
