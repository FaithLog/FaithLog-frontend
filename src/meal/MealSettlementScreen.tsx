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

type MealSettlementScreenProps = {
  api?: MealApi;
  campusId: number;
  onBack: () => void;
  onSessionExpired: (message: string) => void;
};

export function MealSettlementScreen({
  api = mealApi,
  campusId,
  onBack,
  onSessionExpired,
}: MealSettlementScreenProps) {
  const tracker = useMealRequestTracker(`campus:${campusId}/meal-settlement`);
  const [state, setState] = useState<MealLoadState<MealSettlement>>({status: 'loading'});

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
      const settlement = await api.getMySettlement(access.request.accessToken, campusId);
      if (!tracker.isSuccessCurrent(access.request.identity)) return;
      setState(settlement.accounts.length === 0 ? {status: 'empty'} : {status: 'success', data: settlement});
    } catch (error) {
      const apiError = getCurrentMealRequestError({error, fallback: '내 밥 정산을 불러오지 못했습니다.', identity: access.request.identity, onSessionExpired, tracker});
      if (apiError) setState({status: 'error', error: apiError});
    }
  }, [api, campusId, onSessionExpired, tracker]);

  useEffect(() => {
    void load();
  }, [load]);

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
          {state.data.accounts.map((accountSettlement) => (
            <Card key={accountSettlement.account.id}>
              <View style={mealStyles.rowBetween}>
                <View style={{flex: 1}}>
                  <Title>{accountSettlement.account.nickname}</Title>
                  <Text style={mealStyles.meta}>{accountSettlement.account.bankName} · {accountSettlement.account.accountHolder}</Text>
                </View>
                <Chip label={formatWon(accountSettlement.summary.actualTotalAmount)} tone="info" />
              </View>
              {accountSettlement.charges.map((charge) => (
                <View key={charge.chargeId} style={mealStyles.softBox}>
                  <Text style={mealStyles.body}>{charge.pollTitle} · {charge.optionContent}</Text>
                  <Text style={mealStyles.meta}>{charge.memberName} · {formatWon(charge.amount)} · {getChargeStatusLabel(charge.status)}</Text>
                </View>
              ))}
            </Card>
          ))}
        </>
      ) : null}
      <Button accessibilityLabel="밥 정산 관리 홈으로 돌아가기" onPress={onBack} variant="secondary">돌아가기</Button>
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
