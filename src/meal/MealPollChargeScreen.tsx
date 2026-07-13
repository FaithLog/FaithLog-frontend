import {useCallback, useEffect, useRef, useState} from 'react';
import {Modal, Text, View} from 'react-native';

import type {ApiError} from '../api/types';
import {Button, Card, Chip, Empty, Eyebrow, TextField, Title} from '../components/ui';
import {formatWon} from '../utils/money';
import {mealApi} from './mealApi';
import {
  beginMealChargeSubmit,
  buildMealChargeRequest,
  calculateMealChargeGroup,
  createMealChargeSubmitGate,
  finishMealChargeSubmit,
} from './mealModel';
import type {
  MealCalculationType,
  MealChargeGroupRequest,
  MealPaymentAccount,
  MealPollDetail,
} from './mealTypes';
import {MealErrorState, MealLoading, mealStyles, toMealApiError} from './mealScreenShared';

type MealPollChargeScreenProps = {
  accessToken: string;
  campusId: number;
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

export function MealPollChargeScreen({
  accessToken,
  campusId,
  onBack,
  onComplete,
  onSessionExpired,
  pollId,
}: MealPollChargeScreenProps) {
  const [state, setState] = useState<ChargeLoadState>({status: 'loading'});
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<ChargeDraft[]>([]);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const submitGate = useRef(createMealChargeSubmitGate()).current;

  const load = useCallback(async () => {
    setState({status: 'loading'});
    try {
      const [detail, accounts] = await Promise.all([
        mealApi.getPollDetail(accessToken, campusId, pollId),
        mealApi.getMyPaymentAccounts(accessToken, campusId, true),
      ]);
      const activeAccounts = accounts.filter((account) => account.isActive);
      setSelectedAccountId(activeAccounts.length === 1 ? activeAccounts[0]?.id ?? null : null);
      setDrafts(
        detail.options
          .filter((option) => option.responseCount > 0 && option.charge.chargeStatus === 'NOT_CHARGED')
          .map((option) => ({optionId: option.optionId, calculationType: 'PER_MEMBER', enteredAmount: ''})),
      );
      setState({status: 'success', accounts: activeAccounts, detail});
    } catch (error) {
      setState({status: 'error', error: toMealApiError(error, '밥 청구 정보를 불러오지 못했습니다.', onSessionExpired)});
    }
  }, [accessToken, campusId, onSessionExpired, pollId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateDraft = (optionId: number, patch: Partial<ChargeDraft>) => {
    setDrafts((current) => current.map((draft) => draft.optionId === optionId ? {...draft, ...patch} : draft));
  };

  const getRequest = () => {
    if (state.status !== 'success' || selectedAccountId === null) {
      throw new Error('투표 전체 공통 계좌를 선택해 주세요.');
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
    try {
      getRequest();
      setActionError(null);
      setConfirmationVisible(true);
    } catch (error) {
      setActionError(toMealApiError(error, '청구 입력값을 확인해 주세요.', onSessionExpired));
    }
  };

  const submit = async () => {
    const operationId = beginMealChargeSubmit(submitGate);
    if (operationId === null) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const request = getRequest();
      await mealApi.createCharges(accessToken, campusId, pollId, request);
      await Promise.all([
        mealApi.getPollDetail(accessToken, campusId, pollId),
        mealApi.listPolls(accessToken, campusId, {page: 0, size: 20, sort: 'endsAt,desc'}),
        mealApi.getMySettlement(accessToken, campusId),
      ]);
      setConfirmationVisible(false);
      onComplete();
    } catch (error) {
      const apiError = toMealApiError(error, '밥 청구를 완료하지 못했습니다.', onSessionExpired);
      setConfirmationVisible(false);
      setActionError(apiError);
      if (apiError.status === 409) {
        try {
          const detail = await mealApi.getPollDetail(accessToken, campusId, pollId);
          setState((current) =>
            current.status === 'success' ? {...current, detail} : current,
          );
        } catch {
          // Keep the explicit 409 state when recovery fails.
        }
      }
    } finally {
      finishMealChargeSubmit(submitGate, operationId);
      setSubmitting(false);
    }
  };

  if (state.status === 'loading') return <MealLoading label="밥 청구 정보를 불러오는 중" />;
  if (state.status === 'error') return <MealErrorState error={state.error} onRetry={load} />;

  const chargeableOptions = state.detail.options.filter(
    (option) => option.responseCount > 0 && option.charge.chargeStatus === 'NOT_CHARGED',
  );

  return (
    <View style={mealStyles.page}>
      <Card>
        <Eyebrow>투표 단위 일괄 후청구</Eyebrow>
        <Title>{state.detail.title}</Title>
        <Text style={mealStyles.body}>투표 전체 공통 계좌를 정확히 하나 선택하고, 응답자가 있는 모든 옵션 그룹의 금액을 입력합니다.</Text>
      </Card>

      <Card>
        <Eyebrow>투표 전체 공통 계좌</Eyebrow>
        {state.accounts.length === 0 ? (
          <Empty title="활성 밥 계좌가 없습니다" message="내 계좌 화면에서 본인 MEAL 계좌를 먼저 등록해 주세요." />
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
                  accessibilityLabel={`${option.content} ${type} 계산 선택`}
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
      <View style={mealStyles.actionRow}>
        <Button accessibilityLabel="밥 투표 상세로 돌아가기" onPress={onBack} variant="secondary">뒤로</Button>
        <Button accessibilityLabel="밥 청구 최종 확인 열기" disabled={state.accounts.length === 0 || chargeableOptions.length === 0} onPress={openConfirmation}>최종 확인</Button>
      </View>

      <Modal animationType="slide" onRequestClose={() => setConfirmationVisible(false)} transparent visible={confirmationVisible}>
        <View style={mealStyles.sheetBackdrop}>
          <View accessibilityLabel="최종 청구 확인 bottom sheet" style={mealStyles.sheet}>
            <Eyebrow>최종 청구 확인</Eyebrow>
            <Title>이 내용으로 한 번에 청구할까요?</Title>
            <Text style={mealStyles.body}>선택한 한 계좌가 모든 옵션 그룹과 응답자 청구에 공통으로 저장되며, 완료 후 수정하거나 재청구할 수 없습니다.</Text>
            <View style={mealStyles.actionRow}>
              <Button accessibilityLabel="최종 청구 취소" disabled={submitting} onPress={() => setConfirmationVisible(false)} variant="secondary">취소</Button>
              <Button accessibilityLabel="최종 일괄 청구 실행" disabled={submitting} onPress={() => void submit()}>{submitting ? '청구 중...' : '일괄 청구'}</Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
