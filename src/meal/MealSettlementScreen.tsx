import {useCallback, useEffect, useState} from 'react';
import {Text, View} from 'react-native';

import {Button, Card, Chip, Empty, Eyebrow, Title} from '../components/ui';
import {formatWon} from '../utils/money';
import {mealApi, type MealApi} from './mealApi';
import {resolveMealRequestAccess} from './mealRequestLifecycle';
import type {MealSettlement} from './mealTypes';
import {
  MealErrorState,
  getCurrentMealRequestError,
  MealLoading,
  type MealLoadState,
  mealStyles,
} from './mealScreenShared';
import {useMealRequestTracker} from './useMealRequestTracker';

const ACCOUNT_PAGE_SIZE = 10;
const CHARGE_PAGE_SIZE = 25;

type MealSettlementScreenProps = {
  api?: MealApi;
  campusId: number;
  currentUserId: number;
  onBack: () => void;
  onSessionExpired: (message: string) => void;
  showBackButton?: boolean;
};

export function MealSettlementScreen({
  api = mealApi,
  campusId,
  currentUserId,
  onBack,
  onSessionExpired,
  showBackButton = true,
}: MealSettlementScreenProps) {
  const {scopeIsCommitted, tracker} = useMealRequestTracker(`campus:${campusId}/user:${currentUserId}/meal-settlement`);
  const [state, setState] = useState<MealLoadState<MealSettlement>>({status: 'loading'});
  const [accountPage, setAccountPage] = useState(0);
  const [chargePage, setChargePage] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setState({status: 'loading'});
    const access = await resolveMealRequestAccess(tracker, 'settlement-load', onSessionExpired);
    if (access.status === 'cancelled') return;
    if (access.status === 'error') {
      const apiError = getCurrentMealRequestError({error: access.error, fallback: '내 밥 정산을 불러오지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
      if (apiError) setState({status: 'error', error: apiError});
      return;
    }
    try {
      const settlement = await api.getMySettlement(access.request.accessToken, campusId, currentUserId);
      if (!tracker.isSuccessCurrent(access.request.identity)) return;
      setAccountPage(0);
      setChargePage(0);
      setSelectedAccountId(null);
      setState(settlement.accounts.length === 0 ? {status: 'empty'} : {status: 'success', data: settlement});
    } catch (error) {
      const apiError = getCurrentMealRequestError({error, fallback: '내 밥 정산을 불러오지 못했습니다.', identity: access.request.identity, onSessionExpired, tracker});
      if (apiError) setState({status: 'error', error: apiError});
    }
  }, [api, campusId, currentUserId, onSessionExpired, tracker]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!scopeIsCommitted) return <MealLoading label="내 밥 정산 화면을 전환하는 중" />;

  const settlement = state.status === 'success' ? state.data : null;
  const selectedAccount = settlement?.accounts.find((item) => item.account.id === selectedAccountId) ?? null;
  const accountPageCount = settlement ? Math.ceil(settlement.accounts.length / ACCOUNT_PAGE_SIZE) : 0;
  const visibleAccounts = settlement?.accounts.slice(
    accountPage * ACCOUNT_PAGE_SIZE,
    (accountPage + 1) * ACCOUNT_PAGE_SIZE,
  ) ?? [];
  const chargePageCount = selectedAccount
    ? Math.ceil(selectedAccount.charges.length / CHARGE_PAGE_SIZE)
    : 0;
  const visibleCharges = selectedAccount?.charges.slice(
    chargePage * CHARGE_PAGE_SIZE,
    (chargePage + 1) * CHARGE_PAGE_SIZE,
  ) ?? [];

  return (
    <View style={mealStyles.page}>
      <Card>
        <Eyebrow>내 정산</Eyebrow>
        <Title>내 계좌 정산 내역</Title>
        <Text style={mealStyles.body}>내 계좌로 받은 밥 정산 내역과 합계를 확인할 수 있어요.</Text>
      </Card>
      {state.status === 'loading' ? <MealLoading label="내 밥 정산을 불러오는 중" /> : null}
      {state.status === 'error' ? <MealErrorState error={state.error} onRetry={load} /> : null}
      {state.status === 'empty' ? <Empty title="내 계좌 정산 내역이 없습니다" message="내 계좌로 청구한 내역이 이곳에 표시됩니다." actionLabel="다시 불러오기" onActionPress={load} /> : null}
      {state.status === 'success' ? (
        <>
          <Card>
            <Eyebrow>전체 합계</Eyebrow>
            <Title>{formatWon(state.data.summary.actualTotalAmount)}</Title>
            <Text style={mealStyles.meta}>응답자 {state.data.summary.chargedMemberCount}명 · 올림 차액 {formatWon(state.data.summary.roundingAdjustment)}</Text>
          </Card>
          {selectedAccount === null ? visibleAccounts.map((accountSettlement) => (
            <Card key={accountSettlement.account.id}>
              <View style={mealStyles.rowBetween}>
                <View style={{flex: 1}}>
                  <Title>{accountSettlement.account.nickname}</Title>
                  <Text style={mealStyles.meta}>{accountSettlement.account.bankName} · {accountSettlement.account.accountHolder}</Text>
                </View>
                <Chip label={formatWon(accountSettlement.summary.actualTotalAmount)} tone="info" />
              </View>
              <Text style={mealStyles.meta}>청구 내역 {accountSettlement.charges.length}건</Text>
              <Button
                accessibilityLabel={`${accountSettlement.account.nickname} 정산 상세 보기`}
                onPress={() => {
                  setChargePage(0);
                  setSelectedAccountId(accountSettlement.account.id);
                }}
                variant="secondary">
                상세 보기
              </Button>
            </Card>
          )) : (
            <Card>
              <View style={mealStyles.rowBetween}>
                <View style={{flex: 1}}>
                  <Eyebrow>계좌별 정산</Eyebrow>
                  <Title>{selectedAccount.account.nickname}</Title>
                  <Text style={mealStyles.meta}>{selectedAccount.account.bankName} · {selectedAccount.account.accountHolder}</Text>
                </View>
                <Chip label={formatWon(selectedAccount.summary.actualTotalAmount)} tone="info" />
              </View>
              {visibleCharges.map((charge) => (
                <View key={charge.chargeId} style={mealStyles.softBox}>
                  <Text style={mealStyles.body}>{charge.pollTitle} · {charge.optionContent}</Text>
                  <Text style={mealStyles.meta}>{charge.memberName} · {formatWon(charge.amount)} · {getChargeStatusLabel(charge.status)}</Text>
                </View>
              ))}
              {chargePageCount > 1 ? (
                <View style={mealStyles.actionRow}>
                  <Button accessibilityLabel="이전 정산 내역 페이지" disabled={chargePage === 0} onPress={() => setChargePage((current) => Math.max(0, current - 1))} variant="secondary">이전</Button>
                  <Text style={mealStyles.meta}>{chargePage + 1} / {chargePageCount} 페이지</Text>
                  <Button accessibilityLabel="다음 정산 내역 페이지" disabled={chargePage + 1 >= chargePageCount} onPress={() => setChargePage((current) => current + 1)} variant="secondary">다음</Button>
                </View>
              ) : null}
              <Button accessibilityLabel="정산 계좌 요약으로 돌아가기" onPress={() => setSelectedAccountId(null)} variant="secondary">계좌 목록</Button>
            </Card>
          )}
          {selectedAccount === null && accountPageCount > 1 ? (
            <View style={mealStyles.actionRow}>
              <Button accessibilityLabel="이전 정산 계좌 페이지" disabled={accountPage === 0} onPress={() => setAccountPage((current) => Math.max(0, current - 1))} variant="secondary">이전</Button>
              <Text style={mealStyles.meta}>{accountPage + 1} / {accountPageCount} 페이지</Text>
              <Button accessibilityLabel="다음 정산 계좌 페이지" disabled={accountPage + 1 >= accountPageCount} onPress={() => setAccountPage((current) => current + 1)} variant="secondary">다음</Button>
            </View>
          ) : null}
        </>
      ) : null}
      {showBackButton ? (
        <Button accessibilityLabel="밥 정산 관리 홈으로 돌아가기" onPress={onBack} variant="secondary">돌아가기</Button>
      ) : null}
    </View>
  );
}

function getChargeStatusLabel(status: MealSettlement['accounts'][number]['charges'][number]['status']) {
  switch (status) {
    case 'UNPAID':
      return '입금 전';
    case 'PAID':
      return '입금 완료';
    case 'WAIVED':
      return '면제';
    case 'CANCELED':
      return '취소';
  }
}
