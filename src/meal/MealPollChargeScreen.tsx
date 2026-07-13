import {useCallback, useEffect, useRef, useState} from 'react';
import {Modal, ScrollView, Text, View} from 'react-native';

import type {ApiError} from '../api/types';
import {getAuthSessionGeneration} from '../api/tokenStorage';
import {Button, Card, Chip, Empty, Eyebrow, TextField, Title} from '../components/ui';
import {formatWon} from '../utils/money';
import {mealApi} from './mealApi';
import type {MealApi} from './mealApi';
import {
  beginMealChargeSubmit,
  buildMealChargeConfirmation,
  buildMealChargeRequest,
  calculateMealChargeGroup,
  createMealChargeSubmitGate,
  finishMealChargeSubmit,
  MealLocalValidationError,
} from './mealModel';
import {resolveMealRequestAccess, type MealRequestIdentity} from './mealRequestLifecycle';
import type {
  MealCalculationType,
  MealChargeResult,
  MealChargeGroupRequest,
  MealPaymentAccount,
  MealPollDetail,
} from './mealTypes';
import {getCurrentMealRequestError, MealErrorState, MealLoading, MealRefreshWarning, mealStyles, toMealApiError} from './mealScreenShared';
import {useMealRequestTracker} from './useMealRequestTracker';

type MealPollChargeScreenProps = {
  api?: MealApi;
  campusId: number;
  currentUserId: number;
  onBack: () => void;
  onComplete: () => void;
  onSessionExpired: (message: string) => void;
  pollId: number;
};

type ChargeDraft = {
  calculationType: MealCalculationType;
  enteredAmount: string;
  optionId: number;
};

type ChargeLoadState =
  | {status: 'loading'}
  | {status: 'success'; accounts: MealPaymentAccount[]; detail: MealPollDetail}
  | {status: 'error'; error: ApiError};

type ChargeTerminalReceipt =
  | {source: 'mutation'; result: MealChargeResult}
  | {source: 'reconciled'};

export function MealPollChargeScreen({
  api = mealApi,
  campusId,
  currentUserId,
  onBack,
  onComplete,
  onSessionExpired,
  pollId,
}: MealPollChargeScreenProps) {
  const {scopeIsCommitted, tracker} = useMealRequestTracker(`campus:${campusId}/user:${currentUserId}/meal-charge:${pollId}`);
  const [state, setState] = useState<ChargeLoadState>({status: 'loading'});
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<ChargeDraft[]>([]);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [refreshWarning, setRefreshWarning] = useState(false);
  const [terminalReceipt, setTerminalReceipt] = useState<ChargeTerminalReceipt | null>(null);
  const submitGate = useRef(createMealChargeSubmitGate()).current;

  const load = useCallback(async () => {
    setState({status: 'loading'});
    const access = await resolveMealRequestAccess(tracker, 'charge-load', onSessionExpired);
    if (access.status === 'cancelled') return;
    if (access.status === 'error') {
      const apiError = getCurrentMealRequestError({error: access.error, fallback: '밥 청구 정보를 불러오지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
      if (apiError) setState({status: 'error', error: apiError});
      return;
    }
    const {accessToken, identity} = access.request;
    try {
      const [detail, accounts] = await Promise.all([
        api.getPollDetail(accessToken, campusId, pollId),
        api.getMyPaymentAccounts(accessToken, campusId, currentUserId, true),
      ]);
      if (!tracker.isSuccessCurrent(identity)) return;
      const activeAccounts = accounts.filter((account) => account.isActive);
      setSelectedAccountId(activeAccounts.length === 1 ? activeAccounts[0]?.id ?? null : null);
      setDrafts(
        detail.options
          .filter((option) => option.responseCount > 0 && option.charge.chargeStatus === 'NOT_CHARGED')
          .map((option) => ({optionId: option.optionId, calculationType: 'PER_MEMBER', enteredAmount: ''})),
      );
      setState({status: 'success', accounts: activeAccounts, detail});
      setTerminalReceipt(detail.settlementStatus === 'CHARGED' ? {source: 'reconciled'} : null);
      setRefreshWarning(false);
    } catch (error) {
      const apiError = getCurrentMealRequestError({error, fallback: '밥 청구 정보를 불러오지 못했습니다.', identity, onSessionExpired, tracker});
      if (apiError) setState({status: 'error', error: apiError});
    }
  }, [api, campusId, currentUserId, onSessionExpired, pollId, tracker]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!scopeIsCommitted) return <MealLoading label="밥 청구 화면을 전환하는 중" />;

  const updateDraft = (optionId: number, patch: Partial<ChargeDraft>) => {
    setDrafts((current) => current.map((draft) => draft.optionId === optionId ? {...draft, ...patch} : draft));
  };

  const getRequest = () => {
    if (state.status !== 'success' || selectedAccountId === null) {
      throw new MealLocalValidationError('입금받을 계좌를 선택해 주세요.');
    }
    const groups: MealChargeGroupRequest[] = drafts.map((draft) => ({
      optionId: draft.optionId,
      calculationType: draft.calculationType,
      enteredAmount: Number(draft.enteredAmount.replaceAll(',', '')),
    }));
    return buildMealChargeRequest(
      selectedAccountId,
      state.detail.options
        .filter((option) => option.charge.chargeStatus === 'NOT_CHARGED')
        .map((option) => ({optionId: option.optionId, responseCount: option.responseCount})),
      groups,
    );
  };

  const openConfirmation = () => {
    if (terminalReceipt) return;
    try {
      getRequest();
      setActionError(null);
      setConfirmationVisible(true);
    } catch (error) {
      setActionError(toMealApiError(error, '청구 입력값을 확인해 주세요.'));
    }
  };

  const submit = async () => {
    if (terminalReceipt) return;
    const operationId = beginMealChargeSubmit(
      submitGate,
      `${campusId}:${pollId}:${getAuthSessionGeneration()}:charge`,
    );
    if (operationId === null) return;
    setSubmitting(true);
    setActionError(null);
    setRefreshWarning(false);
    let identity: MealRequestIdentity | null = null;
    let mutationSucceeded = false;
    try {
      const request = getRequest();
      const access = await resolveMealRequestAccess(tracker, 'charge-submit', onSessionExpired);
      identity = access.status === 'ready' ? access.request.identity : access.identity;
      if (access.status === 'cancelled') return;
      if (access.status === 'error') {
        const apiError = getCurrentMealRequestError({error: access.error, fallback: '밥 청구를 완료하지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
        if (apiError) setActionError(apiError);
        return;
      }
      const result = await api.createCharges(access.request.accessToken, campusId, pollId, request);
      if (!tracker.isSuccessCurrent(identity)) return;
      mutationSucceeded = true;
      setTerminalReceipt({source: 'mutation', result});
      setConfirmationVisible(false);
      await refreshAfterCharge();
    } catch (error) {
      if (mutationSucceeded) {
        setConfirmationVisible(false);
        setRefreshWarning(true);
        return;
      }
      if (identity === null) {
        setActionError(toMealApiError(error, '청구 입력값을 확인해 주세요.'));
        return;
      }
      const apiError = getCurrentMealRequestError({error, fallback: '밥 청구를 완료하지 못했습니다.', identity, onSessionExpired, tracker});
      if (!apiError) return;
      setConfirmationVisible(false);
      if (apiError.status === 409) {
        const reconciled = await reconcileChargedPoll();
        if (reconciled) return;
        setRefreshWarning(true);
      }
      setActionError(apiError);
    } finally {
      finishMealChargeSubmit(submitGate, operationId);
      if (identity === null || tracker.isSuccessCurrent(identity)) setSubmitting(false);
    }
  };

  const reconcileChargedPoll = async () => {
    const access = await resolveMealRequestAccess(tracker, 'charge-reconcile', onSessionExpired);
    if (access.status !== 'ready') return false;
    try {
      const detail = await api.getPollDetail(access.request.accessToken, campusId, pollId);
      if (
        !tracker.isSuccessCurrent(access.request.identity) ||
        detail.settlementStatus !== 'CHARGED'
      ) {
        return false;
      }
      setState((current) => current.status === 'success'
        ? {status: 'success', accounts: current.accounts, detail}
        : current);
      setTerminalReceipt({source: 'reconciled'});
      setActionError(null);
      setRefreshWarning(false);
      return true;
    } catch (error) {
      getCurrentMealRequestError({error, fallback: '최신 정산 상태를 불러오지 못했습니다.', identity: access.request.identity, onSessionExpired, tracker});
      return false;
    }
  };

  const refreshAfterCharge = async () => {
    const access = await resolveMealRequestAccess(tracker, 'charge-refresh', onSessionExpired);
    if (access.status !== 'ready') {
      if (access.status === 'error') {
        const apiError = getCurrentMealRequestError({error: access.error, fallback: '최신 정산 상태를 불러오지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
        if (apiError) setRefreshWarning(true);
      }
      return;
    }
    try {
      const [detail] = await Promise.all([
        api.getPollDetail(access.request.accessToken, campusId, pollId),
        api.listPolls(access.request.accessToken, campusId, {page: 0, size: 20, sort: 'endsAt,desc'}),
        api.getMySettlement(access.request.accessToken, campusId, currentUserId),
      ]);
      if (!tracker.isSuccessCurrent(access.request.identity)) return;
      setState((current) => current.status === 'success'
        ? {status: 'success', accounts: current.accounts, detail}
        : current);
      if (detail.settlementStatus === 'CHARGED') setTerminalReceipt({source: 'reconciled'});
      setRefreshWarning(false);
      onComplete();
    } catch (error) {
      const apiError = getCurrentMealRequestError({error, fallback: '최신 정산 상태를 불러오지 못했습니다.', identity: access.request.identity, onSessionExpired, tracker});
      if (apiError) setRefreshWarning(true);
    }
  };

  if (state.status === 'loading') return <MealLoading label="밥 청구 정보를 불러오는 중" />;
  if (state.status === 'error') return <MealErrorState error={state.error} onRetry={load} />;

  const chargeableOptions = terminalReceipt ? [] : state.detail.options.filter(
    (option) => option.responseCount > 0 && option.charge.chargeStatus === 'NOT_CHARGED',
  );

  return (
    <View style={mealStyles.page}>
      <Card>
        <Eyebrow>정산하기</Eyebrow>
        <Title>{state.detail.title}</Title>
        <Text style={mealStyles.body}>입금받을 계좌를 고르고 메뉴별 금액을 입력해 주세요.</Text>
      </Card>

      {terminalReceipt ? (
        <Card>
          <Eyebrow>정산 완료</Eyebrow>
          <Title>청구가 완료된 투표입니다</Title>
          <Text style={mealStyles.body}>최신 정산 상태만 다시 확인할 수 있으며 같은 청구를 다시 보낼 수 없습니다.</Text>
        </Card>
      ) : null}

      <Card>
        <Eyebrow>입금 계좌</Eyebrow>
        {state.accounts.length === 0 ? (
          <Empty title="활성 밥 계좌가 없습니다" message="내 계좌 화면에서 밥 정산 계좌를 먼저 등록해 주세요." />
        ) : (
          state.accounts.map((account) => (
            <Button
              accessibilityLabel={`${account.nickname} 밥 청구 공통 계좌 선택`}
              key={account.id}
              onPress={() => setSelectedAccountId(account.id)}
              variant={selectedAccountId === account.id ? 'primary' : 'secondary'}>
              {account.nickname} · {account.bankName}
            </Button>
          ))
        )}
      </Card>

      {chargeableOptions.map((option) => {
        const draft = drafts.find((item) => item.optionId === option.optionId);
        const amount = Number(draft?.enteredAmount.replaceAll(',', '') ?? '');
        let preview: ReturnType<typeof calculateMealChargeGroup> | null = null;
        try {
          if (draft && amount > 0) preview = calculateMealChargeGroup(draft.calculationType, amount, option.responseCount);
        } catch {
          preview = null;
        }

        return (
          <Card key={option.optionId}>
            <View style={mealStyles.rowBetween}>
              <Title>{option.content}</Title>
              <Chip label={`${option.responseCount}명`} tone="info" />
            </View>
            <View style={mealStyles.actionRow}>
              {(['PER_MEMBER', 'GROUP_TOTAL'] as const).map((type) => (
                <Button
                  accessibilityLabel={`${option.content} ${type === 'PER_MEMBER' ? '1인당' : '전체 금액'} 계산 선택`}
                  key={type}
                  onPress={() => updateDraft(option.optionId, {calculationType: type})}
                  variant={draft?.calculationType === type ? 'primary' : 'secondary'}>
                  {type === 'PER_MEMBER' ? '1인당' : '그룹 총액'}
                </Button>
              ))}
            </View>
            <TextField
              accessibilityLabel={`${option.content} 청구 금액`}
              keyboardType="number-pad"
              label={draft?.calculationType === 'GROUP_TOTAL' ? '그룹 목표 총액' : '1인당 금액'}
              onChangeText={(enteredAmount) => updateDraft(option.optionId, {enteredAmount})}
              value={draft?.enteredAmount ?? ''}
            />
            {preview ? (
              <View style={mealStyles.softBox}>
                <Text style={mealStyles.body}>1인당 {formatWon(preview.amountPerMember)}</Text>
                <Text style={mealStyles.body}>요청 {formatWon(preview.requestedTotalAmount)} · 실제 {formatWon(preview.actualTotalAmount)}</Text>
                <Text style={mealStyles.meta}>올림 차액 {formatWon(preview.roundingAdjustment)}</Text>
              </View>
            ) : null}
          </Card>
        );
      })}

      {actionError ? (
        <MealErrorState
          error={actionError}
          {...(actionError.status === 409 ? {onRetry: load} : {})}
        />
      ) : null}
      {refreshWarning ? <MealRefreshWarning onRetry={() => void refreshAfterCharge()} /> : null}
      <View style={mealStyles.actionRow}>
        <Button accessibilityLabel="밥 투표 상세로 돌아가기" onPress={onBack} variant="secondary">뒤로</Button>
        {!terminalReceipt ? (
          <Button accessibilityLabel="밥 청구 최종 확인 열기" disabled={state.accounts.length === 0 || chargeableOptions.length === 0} onPress={openConfirmation}>최종 확인</Button>
        ) : null}
      </View>

      <Modal animationType="slide" onRequestClose={() => setConfirmationVisible(false)} transparent visible={confirmationVisible}>
        <View style={mealStyles.sheetBackdrop}>
          <View style={mealStyles.sheet}>
            <View
              accessible
              accessibilityLabel={getConfirmationAccessibilityLabel(state, selectedAccountId, drafts)}>
              <Eyebrow>최종 청구 확인</Eyebrow>
              <Title>이 내용으로 청구할까요?</Title>
            </View>
            <ScrollView
              accessibilityLabel="최종 청구 접근성 요약"
              accessible
              contentContainerStyle={mealStyles.list}
              style={mealStyles.sheetSummaryScroll}>
              <MealConfirmationSummary accounts={state.accounts} detail={state.detail} drafts={drafts} selectedAccountId={selectedAccountId} />
              <Text style={mealStyles.body}>완료 후에는 계좌나 금액을 바꾸거나 다시 청구할 수 없습니다.</Text>
            </ScrollView>
            <View style={mealStyles.actionRow}>
              <Button accessibilityLabel="최종 청구 취소" disabled={submitting} onPress={() => setConfirmationVisible(false)} variant="secondary">취소</Button>
              <Button accessibilityLabel="최종 청구 실행" disabled={submitting} onPress={() => void submit()}>{submitting ? '청구 중...' : '청구하기'}</Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MealConfirmationSummary({
  accounts,
  detail,
  drafts,
  selectedAccountId,
}: {
  accounts: MealPaymentAccount[];
  detail: MealPollDetail;
  drafts: ChargeDraft[];
  selectedAccountId: number | null;
}) {
  const data = getConfirmationData(detail, selectedAccountId, drafts);
  if (!data) return null;
  const account = accounts.find((item) => item.id === selectedAccountId);

  return (
    <View style={mealStyles.list}>
      <View style={mealStyles.softBox}>
        <Text style={mealStyles.body}>입금 계좌</Text>
        <Text style={mealStyles.meta}>{account ? `${account.nickname} · ${account.bankName}` : '선택한 계좌'}</Text>
      </View>
      {data.groups.map((group) => (
        <View key={group.optionId} style={mealStyles.softBox}>
          <Text style={mealStyles.body}>{group.content} · {group.responseCount}명</Text>
          <Text style={mealStyles.meta}>
            {group.calculationType === 'PER_MEMBER' ? '1인당 입력' : '그룹 총액 입력'} {formatWon(group.enteredAmount)}
          </Text>
          <Text style={mealStyles.meta}>
            1인당 {formatWon(group.amountPerMember)} · 요청 {formatWon(group.requestedTotalAmount)} · 실제 {formatWon(group.actualTotalAmount)} · 올림 차액 {formatWon(group.roundingAdjustment)}
          </Text>
        </View>
      ))}
      <View style={mealStyles.softBox}>
        <Text style={mealStyles.body}>전체 {data.totals.chargedMemberCount}명 · 실제 {formatWon(data.totals.actualTotalAmount)}</Text>
        <Text style={mealStyles.meta}>요청 {formatWon(data.totals.requestedTotalAmount)} · 올림 차액 {formatWon(data.totals.roundingAdjustment)}</Text>
      </View>
    </View>
  );
}

function getConfirmationData(
  detail: MealPollDetail,
  selectedAccountId: number | null,
  drafts: ChargeDraft[],
) {
  if (selectedAccountId === null) return null;
  try {
    const request = buildMealChargeRequest(
      selectedAccountId,
      detail.options
        .filter((option) => option.charge.chargeStatus === 'NOT_CHARGED')
        .map((option) => ({optionId: option.optionId, responseCount: option.responseCount})),
      drafts.map((draft) => ({
        optionId: draft.optionId,
        calculationType: draft.calculationType,
        enteredAmount: Number(draft.enteredAmount.replaceAll(',', '')),
      })),
    );
    return buildMealChargeConfirmation(detail, request);
  } catch {
    return null;
  }
}

function getConfirmationAccessibilityLabel(
  state: ChargeLoadState,
  selectedAccountId: number | null,
  drafts: ChargeDraft[],
) {
  if (state.status !== 'success') return '최종 청구 확인';
  const data = getConfirmationData(state.detail, selectedAccountId, drafts);
  const account = state.accounts.find((item) => item.id === selectedAccountId);
  if (!data) return '최종 청구 확인';
  const groups = data.groups.map((group) =>
    `${group.content}, 계산 방식 ${group.calculationType === 'PER_MEMBER' ? '1인당' : '전체 금액'}, 입력 ${group.enteredAmount}원, 대상 ${group.responseCount}명, 1인당 ${group.amountPerMember}원, 요청 총액 ${group.requestedTotalAmount}원, 실제 총액 ${group.actualTotalAmount}원, 올림 차액 ${group.roundingAdjustment}원`,
  ).join(', ');
  return `최종 청구 확인. 계좌 ${account?.nickname ?? '선택 계좌'}. ${groups}. 전체 대상 ${data.totals.chargedMemberCount}명, 요청 총액 ${data.totals.requestedTotalAmount}원, 실제 총액 ${data.totals.actualTotalAmount}원, 전체 올림 차액 ${data.totals.roundingAdjustment}원`;
}
