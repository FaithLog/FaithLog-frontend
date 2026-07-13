import {useCallback, useEffect, useState} from 'react';
import {Text, View} from 'react-native';

import {Button, Card, Chip, Empty, Eyebrow, Title} from '../components/ui';
import {formatWon} from '../utils/money';
import {mealApi} from './mealApi';
import type {MealSettlement} from './mealTypes';
import {
  MealErrorState,
  MealLoading,
  type MealLoadState,
  mealStyles,
  toMealApiError,
} from './mealScreenShared';

type MealSettlementScreenProps = {
  accessToken: string;
  campusId: number;
  onBack: () => void;
  onSessionExpired: (message: string) => void;
};

export function MealSettlementScreen({
  accessToken,
  campusId,
  onBack,
  onSessionExpired,
}: MealSettlementScreenProps) {
  const [state, setState] = useState<MealLoadState<MealSettlement>>({status: 'loading'});

  const load = useCallback(async () => {
    setState({status: 'loading'});
    try {
      const settlement = await mealApi.getMySettlement(accessToken, campusId);
      setState(settlement.accounts.length === 0 ? {status: 'empty'} : {status: 'success', data: settlement});
    } catch (error) {
      setState({status: 'error', error: toMealApiError(error, '내 밥 정산을 불러오지 못했습니다.', onSessionExpired)});
    }
  }, [accessToken, campusId, onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={mealStyles.page}>
      <Card>
        <Eyebrow>내 정산</Eyebrow>
        <Title>내 MEAL 계좌 청구만</Title>
        <Text style={mealStyles.body}>백엔드가 본인 계좌에 연결된 MEAL 청구만 반환하는 전용 조회입니다.</Text>
      </Card>
      {state.status === 'loading' ? <MealLoading label="내 밥 정산을 불러오는 중" /> : null}
      {state.status === 'error' ? <MealErrorState error={state.error} onRetry={load} /> : null}
      {state.status === 'empty' ? <Empty title="내 계좌 정산 내역이 없습니다" message="본인 계좌로 일괄 청구하면 이곳에 표시됩니다." actionLabel="다시 불러오기" onActionPress={load} /> : null}
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
                  <Text style={mealStyles.meta}>{charge.memberName} · {formatWon(charge.amount)} · {charge.status}</Text>
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
