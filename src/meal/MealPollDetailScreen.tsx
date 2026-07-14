import {useCallback, useEffect, useRef, useState} from 'react';
import {Text, View} from 'react-native';

import type {ApiError} from '../api/types';
import {getAuthSessionGeneration} from '../api/tokenStorage';
import {Card, Chip, Eyebrow, Title} from '../components/ui';
import {DutyActionButton} from '../duty/DutyPresentation';
import {formatWon} from '../utils/money';
import {mealApi, type MealApi} from './mealApi';
import {beginMealMutation, createMealMutationGate, finishMealMutation} from './mealMutationFlow';
import {resolveMealRequestAccess} from './mealRequestLifecycle';
import type {MealRequestIdentity} from './mealRequestLifecycle';
import type {MealCharged, MealPollDetail} from './mealTypes';
import {
  MealErrorState,
  getCurrentMealRequestError,
  MealLoading,
  MealRefreshWarning,
  type MealLoadState,
  mealStyles,
} from './mealScreenShared';
import {useMealRequestTracker} from './useMealRequestTracker';

type MealPollDetailScreenProps = {
  api?: MealApi;
  campusId: number;
  onBack: () => void;
  onOpenCharge: (pollId: number) => void;
  onSessionExpired: (message: string) => void;
  pollId: number;
};

export function MealPollDetailScreen({
  api = mealApi,
  campusId,
  onBack,
  onOpenCharge,
  onSessionExpired,
  pollId,
}: MealPollDetailScreenProps) {
  const requestScope = `campus:${campusId}/meal-detail:${pollId}`;
  const {scopeIsCommitted, tracker} = useMealRequestTracker(requestScope);
  const closeGate = useRef(createMealMutationGate()).current;
  const closedTerminalScopeRef = useRef<string | null>(null);
  const [state, setState] = useState<MealLoadState<MealPollDetail>>({status: 'loading'});
  const [closing, setClosing] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [refreshWarning, setRefreshWarning] = useState(false);

  const load = useCallback(async () => {
    const preserveClosedTerminal = closedTerminalScopeRef.current === requestScope;
    if (!preserveClosedTerminal) setState({status: 'loading'});
    const access = await resolveMealRequestAccess(tracker, 'detail', onSessionExpired);
    if (access.status === 'cancelled') return null;
    if (access.status === 'error') {
      const apiError = getCurrentMealRequestError({error: access.error, fallback: '밥 투표 상세를 불러오지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
      if (apiError) {
        if (preserveClosedTerminal) setRefreshWarning(true);
        else setState({status: 'error', error: apiError});
      }
      return null;
    }
    const {accessToken, identity} = access.request;
    try {
      const detail = await api.getPollDetail(accessToken, campusId, pollId);
      if (!tracker.isSuccessCurrent(identity)) return null;
      if (preserveClosedTerminal && detail.status !== 'CLOSED') {
        setRefreshWarning(true);
        return null;
      }
      if (detail.status === 'CLOSED') closedTerminalScopeRef.current = requestScope;
      setState({status: 'success', data: detail});
      setRefreshWarning(false);
      return detail;
    } catch (error) {
      const apiError = getCurrentMealRequestError({error, fallback: '밥 투표 상세를 불러오지 못했습니다.', identity, onSessionExpired, tracker});
      if (apiError) {
        if (preserveClosedTerminal) setRefreshWarning(true);
        else setState({status: 'error', error: apiError});
      }
      return null;
    }
  }, [api, campusId, onSessionExpired, pollId, requestScope, tracker]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!scopeIsCommitted) return <MealLoading label="밥 투표 상세를 전환하는 중" />;

  const closePoll = async () => {
    const operationId = beginMealMutation(
      closeGate,
      `${campusId}:${pollId}:${getAuthSessionGeneration()}:close`,
    );
    if (operationId === null) return;
    setClosing(true);
    setActionError(null);
    setRefreshWarning(false);
    let mutationSucceeded = false;
    let mutationIdentity: MealRequestIdentity | null = null;
    try {
      const access = await resolveMealRequestAccess(tracker, 'close', onSessionExpired);
      mutationIdentity = access.status === 'ready' ? access.request.identity : access.identity;
      if (access.status === 'cancelled') return;
      if (access.status === 'error') {
        const apiError = getCurrentMealRequestError({error: access.error, fallback: '밥 투표를 종료하지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
        if (apiError) setActionError(apiError);
        return;
      }
      await api.closePoll(access.request.accessToken, campusId, pollId);
      if (!tracker.isSuccessCurrent(access.request.identity)) return;
      mutationSucceeded = true;
      closedTerminalScopeRef.current = requestScope;
      setState((current) => current.status === 'success'
        ? {status: 'success', data: {...current.data, status: 'CLOSED'}}
        : current);

      const refreshAccess = await resolveMealRequestAccess(tracker, 'close-refresh', onSessionExpired);
      if (refreshAccess.status !== 'ready') {
        if (tracker.isSuccessCurrent(access.request.identity)) setRefreshWarning(true);
        return;
      }
      try {
        const refetched = await api.getPollDetail(refreshAccess.request.accessToken, campusId, pollId);
        if (!tracker.isSuccessCurrent(refreshAccess.request.identity)) return;
        if (refetched.status !== 'CLOSED') {
          setRefreshWarning(true);
          return;
        }
        closedTerminalScopeRef.current = requestScope;
        setState({status: 'success', data: refetched});
        setRefreshWarning(false);
        onOpenCharge(refetched.id);
      } catch (refreshError) {
        const currentError = getCurrentMealRequestError({error: refreshError, fallback: '최신 투표 상태를 불러오지 못했습니다.', identity: refreshAccess.request.identity, onSessionExpired, tracker});
        if (currentError) setRefreshWarning(true);
      }
    } catch (error) {
      if (mutationSucceeded) {
        setRefreshWarning(true);
        return;
      }
      if (mutationIdentity === null) return;
      const apiError = getCurrentMealRequestError({error, fallback: '밥 투표를 종료하지 못했습니다.', identity: mutationIdentity, onSessionExpired, tracker});
      if (!apiError) return;
      if (apiError.status === 409) {
        const reconciled = await reconcileClosedPoll();
        if (reconciled) return;
        setRefreshWarning(true);
      }
      setActionError(apiError);
    } finally {
      finishMealMutation(closeGate, operationId);
      if (mutationIdentity === null || tracker.isSuccessCurrent(mutationIdentity)) {
        setClosing(false);
      }
    }
  };

  const reconcileClosedPoll = async () => {
    const access = await resolveMealRequestAccess(tracker, 'close-reconcile', onSessionExpired);
    if (access.status !== 'ready') return false;
    try {
      const detail = await api.getPollDetail(access.request.accessToken, campusId, pollId);
      if (!tracker.isSuccessCurrent(access.request.identity) || detail.status !== 'CLOSED') return false;
      closedTerminalScopeRef.current = requestScope;
      setState({status: 'success', data: detail});
      setActionError(null);
      setRefreshWarning(false);
      return true;
    } catch (error) {
      getCurrentMealRequestError({error, fallback: '최신 투표 상태를 불러오지 못했습니다.', identity: access.request.identity, onSessionExpired, tracker});
      return false;
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
          <Chip label={getPollStatusLabel(detail.status)} tone={detail.status === 'CLOSED' ? 'default' : 'info'} />
        </View>
        <Text style={mealStyles.meta}>한 항목 선택 · {detail.isAnonymous ? '익명' : '실명'} · 새 선택지 추가 {detail.allowUserOptionAdd ? '가능' : '불가'}</Text>
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
          {option.responseCount === 0 ? <Text style={mealStyles.meta}>선택한 사람이 없어 정산에서 제외됩니다.</Text> : null}
          {option.charge.chargeStatus === 'CHARGED' ? <ChargedSummary charge={option.charge} responseCount={option.responseCount} /> : null}
        </Card>
      ))}

      {actionError ? <MealErrorState error={actionError} onRetry={load} /> : null}
      {refreshWarning ? <MealRefreshWarning onRetry={() => void load()} /> : null}
      <View style={mealStyles.actionRow}>
        <DutyActionButton accessibilityLabel="밥 투표 목록으로 돌아가기" label="목록" onPress={onBack} />
        {detail.status === 'OPEN' ? (
          <DutyActionButton accessibilityLabel="밥 투표 수동 종료" busy={closing} label={closing ? '종료 중...' : '투표 종료'} onPress={() => void closePoll()} variant="danger" />
        ) : null}
        {detail.status === 'CLOSED' && hasChargeableGroup ? (
          <DutyActionButton accessibilityLabel="밥 투표 청구 화면 열기" label="청구하기" onPress={() => onOpenCharge(detail.id)} variant="primary" />
        ) : null}
      </View>
      {detail.status === 'CLOSED' && hasChargeableGroup ? (
        <Text style={mealStyles.meta}>투표를 종료해도 바로 청구되지 않습니다. 항목별 금액을 확인한 뒤 청구해 주세요.</Text>
      ) : null}
    </View>
  );
}

function ChargedSummary({charge, responseCount}: {charge: MealCharged; responseCount: number}) {
  return (
    <View style={mealStyles.softBox}>
      <Text style={mealStyles.body}>1인당 {formatWon(charge.amountPerMember)} · {responseCount}명</Text>
      <Text style={mealStyles.body}>요청 {formatWon(charge.requestedTotalAmount)} · 실제 {formatWon(charge.actualTotalAmount)}</Text>
      {charge.roundingAdjustment > 0 ? <Text style={mealStyles.meta}>올림 차액 {formatWon(charge.roundingAdjustment)}</Text> : null}
      <Text style={mealStyles.meta}>청구 시각 {new Date(charge.chargedAt).toLocaleString()}</Text>
      {!charge.chargedByMe ? (
        <Text style={mealStyles.meta}>다른 밥 담당자가 청구했습니다. 계좌 정보는 공개되지 않습니다.</Text>
      ) : (
        <Text style={mealStyles.successText}>내 계좌로 청구한 항목입니다.</Text>
      )}
    </View>
  );
}

function getPollStatusLabel(status: MealPollDetail['status']) {
  switch (status) {
    case 'SCHEDULED':
      return '예정';
    case 'OPEN':
      return '진행 중';
    case 'CLOSED':
      return '종료';
  }
}
