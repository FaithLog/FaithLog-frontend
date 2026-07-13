import {useCallback, useEffect, useState} from 'react';
import {Text, View} from 'react-native';

import type {ApiError} from '../api/types';
import {Button, Card, Chip, Eyebrow, Title} from '../components/ui';
import {formatWon} from '../utils/money';
import {mealApi} from './mealApi';
import type {MealCharged, MealPollDetail} from './mealTypes';
import {
  MealErrorState,
  MealLoading,
  type MealLoadState,
  mealStyles,
  toMealApiError,
} from './mealScreenShared';

type MealPollDetailScreenProps = {
  accessToken: string;
  campusId: number;
  onBack: () => void;
  onOpenCharge: (pollId: number) => void;
  onSessionExpired: (message: string) => void;
  pollId: number;
};

export function MealPollDetailScreen({
  accessToken,
  campusId,
  onBack,
  onOpenCharge,
  onSessionExpired,
  pollId,
}: MealPollDetailScreenProps) {
  const [state, setState] = useState<MealLoadState<MealPollDetail>>({status: 'loading'});
  const [closing, setClosing] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setState({status: 'loading'});
    try {
      setState({status: 'success', data: await mealApi.getPollDetail(accessToken, campusId, pollId)});
    } catch (error) {
      setState({status: 'error', error: toMealApiError(error, '밥 투표 상세를 불러오지 못했습니다.', onSessionExpired)});
    }
  }, [accessToken, campusId, onSessionExpired, pollId]);

  useEffect(() => {
    void load();
  }, [load]);

  const closePoll = async () => {
    if (closing) return;
    setClosing(true);
    setActionError(null);
    try {
      await mealApi.closePoll(accessToken, campusId, pollId);
      const refetched = await mealApi.getPollDetail(accessToken, campusId, pollId);
      setState({status: 'success', data: refetched});
      onOpenCharge(refetched.id);
    } catch (error) {
      const apiError = toMealApiError(error, '밥 투표를 종료하지 못했습니다.', onSessionExpired);
      setActionError(apiError);
      if (apiError.status === 409) {
        try {
          setState({status: 'success', data: await mealApi.getPollDetail(accessToken, campusId, pollId)});
        } catch {
          // The explicit conflict remains visible if the recovery refetch also fails.
        }
      }
    } finally {
      setClosing(false);
    }
  };

  if (state.status === 'loading') return <MealLoading label="밥 투표 상세를 불러오는 중" />;
  if (state.status === 'error') return <MealErrorState error={state.error} onRetry={load} />;
  if (state.status !== 'success') return null;

  const detail = state.data;
  const hasChargeableGroup = detail.options.some(
    (option) => option.responseCount > 0 && option.charge.chargeStatus === 'NOT_CHARGED',
  );

  return (
    <View style={mealStyles.page}>
      <Card>
        <View style={mealStyles.rowBetween}>
          <View style={{flex: 1}}>
            <Eyebrow>밥 투표 상세</Eyebrow>
            <Title>{detail.title}</Title>
          </View>
          <Chip label={detail.status === 'CLOSED' ? '종료' : '진행 중'} tone={detail.status === 'CLOSED' ? 'default' : 'info'} />
        </View>
        <Text style={mealStyles.body}>{detail.description || '설명 없음'}</Text>
        <Text style={mealStyles.meta}>SINGLE · 응답 {detail.totalResponseCount}명 · 사용자 선택지 추가 {detail.allowUserOptionAdd ? '허용' : '불가'}</Text>
      </Card>

      {detail.options.map((option) => (
        <Card key={option.optionId}>
          <View style={mealStyles.rowBetween}>
            <View style={{flex: 1}}>
              <Title>{option.content}</Title>
              <Text style={mealStyles.meta}>응답자 {option.responseCount}명{option.userAdded ? ' · 사용자 추가' : ''}</Text>
            </View>
            <Chip label={option.charge.chargeStatus === 'CHARGED' ? '청구 완료' : '미청구'} tone={option.charge.chargeStatus === 'CHARGED' ? 'success' : 'warning'} />
          </View>
          {option.responseCount === 0 ? <Text style={mealStyles.meta}>응답자가 없어 batch 청구에서 제외됩니다.</Text> : null}
          {option.charge.chargeStatus === 'CHARGED' ? <ChargedSummary charge={option.charge} /> : null}
        </Card>
      ))}

      {actionError ? <MealErrorState error={actionError} onRetry={load} /> : null}
      <View style={mealStyles.actionRow}>
        <Button accessibilityLabel="밥 투표 목록으로 돌아가기" onPress={onBack} variant="secondary">목록</Button>
        {detail.status === 'OPEN' ? (
          <Button accessibilityLabel="밥 투표 수동 종료" disabled={closing} onPress={() => void closePoll()} variant="danger">
            {closing ? '종료 중...' : '투표 종료'}
          </Button>
        ) : null}
        {detail.status === 'CLOSED' && hasChargeableGroup ? (
          <Button accessibilityLabel="밥 투표 일괄 청구 화면 열기" onPress={() => onOpenCharge(detail.id)}>청구하기</Button>
        ) : null}
      </View>
      {detail.status === 'CLOSED' && detail.settlementStatus === 'NOT_CHARGED' ? (
        <Text style={mealStyles.meta}>투표 종료는 청구를 생성하지 않습니다. 옵션별 금액을 확인한 뒤 별도로 청구해 주세요.</Text>
      ) : null}
    </View>
  );
}

function ChargedSummary({charge}: {charge: MealCharged}) {
  return (
    <View style={mealStyles.softBox}>
      <Text style={mealStyles.body}>1인당 {formatWon(charge.amountPerMember)} · {charge.chargedMemberCount}명</Text>
      <Text style={mealStyles.body}>요청 {formatWon(charge.requestedTotalAmount)} · 실제 {formatWon(charge.actualTotalAmount)}</Text>
      {charge.roundingAdjustment > 0 ? <Text style={mealStyles.meta}>올림 차액 {formatWon(charge.roundingAdjustment)}</Text> : null}
      {!charge.chargedByMe ? (
        <Text style={mealStyles.meta}>다른 밥 담당자가 청구했습니다. 계좌 정보는 공개되지 않습니다.</Text>
      ) : (
        <Text style={mealStyles.successText}>내 계좌로 청구한 그룹입니다.</Text>
      )}
    </View>
  );
}
