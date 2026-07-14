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
      setState(settlement.members.length === 0 ? {status: 'empty'} : {status: 'success', data: settlement});
    } catch (error) {
      const apiError = getCurrentMealRequestError({error, fallback: '내 밥 정산을 불러오지 못했습니다.', identity: access.request.identity, onSessionExpired, tracker});
      if (apiError) setState({status: 'error', error: apiError});
    }
  }, [api, campusId, currentUserId, onSessionExpired, tracker]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!scopeIsCommitted) return <MealLoading label="내 밥 정산 화면을 전환하는 중" />;

  return (
    <View style={mealStyles.page}>
      <Card>
        <Eyebrow>내 정산</Eyebrow>
        <Title>밥 정산 현황</Title>
        <Text style={mealStyles.body}>내 밥 계좌에 연결된 청구의 요약과 멤버별 상태를 확인할 수 있어요.</Text>
      </Card>
      {state.status === 'loading' ? <MealLoading label="내 밥 정산을 불러오는 중" /> : null}
      {state.status === 'error' ? <MealErrorState error={state.error} onRetry={load} /> : null}
      {state.status === 'empty' ? <Empty title="밥 정산 내역이 없습니다" message="내 계좌로 청구한 내역이 이곳에 표시됩니다." actionLabel="다시 불러오기" onActionPress={load} /> : null}
      {state.status === 'success' ? (
        <>
          <Card>
            <Eyebrow>전체 합계</Eyebrow>
            <Title>{formatWon(state.data.summary.totalAmount)}</Title>
            <Text style={mealStyles.meta}>미납 {formatWon(state.data.summary.unpaidAmount)} · 납부 {formatWon(state.data.summary.paidAmount)}</Text>
            <Text style={mealStyles.meta}>면제 {formatWon(state.data.summary.waivedAmount)} · 취소 {formatWon(state.data.summary.canceledAmount)}</Text>
          </Card>
          {state.data.members.map((member) => (
            <Card key={member.userId}>
              <View style={mealStyles.rowBetween}>
                <View style={{flex: 1}}>
                  <Title>{member.name}</Title>
                  <Text style={mealStyles.meta}>{member.email}</Text>
                </View>
                <Chip label={formatWon(member.totalAmount)} tone="info" />
              </View>
              <Text style={mealStyles.meta}>미납 {formatWon(member.unpaidAmount)} · 납부 {formatWon(member.paidAmount)} · 면제 {formatWon(member.waivedAmount)} · 취소 {formatWon(member.canceledAmount)}</Text>
            </Card>
          ))}
        </>
      ) : null}
      {showBackButton ? (
        <Button accessibilityLabel="밥 정산 관리 홈으로 돌아가기" onPress={onBack} variant="secondary">돌아가기</Button>
      ) : null}
    </View>
  );
}
