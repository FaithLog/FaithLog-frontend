import {useCallback, useEffect, useRef, useState} from 'react';
import {Modal, Text, View} from 'react-native';

import type {ApiError} from '../api/types';
import {getAuthSessionGeneration} from '../api/tokenStorage';
import {Button, Card, Chip, Empty, Eyebrow, TextField, Title} from '../components/ui';
import {mealApi, type MealApi} from './mealApi';
import {beginMealMutation, createMealMutationGate, finishMealMutation} from './mealMutationFlow';
import {resolveMealRequestAccess, type MealRequestIdentity} from './mealRequestLifecycle';
import type {MealPaymentAccount} from './mealTypes';
import {
  MealErrorState,
  getCurrentMealRequestError,
  MealLoading,
  MealRefreshWarning,
  type MealLoadState,
  mealStyles,
} from './mealScreenShared';
import {useMealRequestTracker} from './useMealRequestTracker';

type MealAccountScreenProps = {
  api?: MealApi;
  campusId: number;
  currentUserId: number;
  onBack: () => void;
  onSessionExpired: (message: string) => void;
};

export function MealAccountScreen({api = mealApi, campusId, currentUserId, onBack, onSessionExpired}: MealAccountScreenProps) {
  const {scopeIsCommitted, tracker} = useMealRequestTracker(`campus:${campusId}/user:${currentUserId}/meal-accounts`);
  const mutationGate = useRef(createMealMutationGate()).current;
  const [state, setState] = useState<MealLoadState<MealPaymentAccount[]>>({status: 'loading'});
  const [nickname, setNickname] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [refreshWarning, setRefreshWarning] = useState(false);
  const [deactivationTarget, setDeactivationTarget] = useState<MealPaymentAccount | null>(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setState({status: 'loading'});
    const access = await resolveMealRequestAccess(tracker, 'accounts-load', onSessionExpired);
    if (access.status === 'cancelled') return false;
    if (access.status === 'error') {
      const apiError = getCurrentMealRequestError({error: access.error, fallback: '내 밥 계좌를 불러오지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
      if (apiError && showLoading) setState({status: 'error', error: apiError});
      return false;
    }
    try {
      const accounts = await api.getMyPaymentAccounts(access.request.accessToken, campusId, currentUserId, true);
      if (!tracker.isSuccessCurrent(access.request.identity)) return false;
      setState(accounts.length === 0 ? {status: 'empty'} : {status: 'success', data: accounts});
      setRefreshWarning(false);
      return true;
    } catch (error) {
      const apiError = getCurrentMealRequestError({error, fallback: '내 밥 계좌를 불러오지 못했습니다.', identity: access.request.identity, onSessionExpired, tracker});
      if (apiError && showLoading) setState({status: 'error', error: apiError});
      return false;
    }
  }, [api, campusId, currentUserId, onSessionExpired, tracker]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!scopeIsCommitted) return <MealLoading label="내 밥 계좌 화면을 전환하는 중" />;

  const create = async () => {
    const operationId = beginMealMutation(
      mutationGate,
      `${campusId}:${getAuthSessionGeneration()}:accounts`,
    );
    if (operationId === null) return;
    setSaving(true);
    setActionError(null);
    setRefreshWarning(false);
    let identity: MealRequestIdentity | null = null;
    try {
      const access = await resolveMealRequestAccess(tracker, 'account-create', onSessionExpired);
      identity = access.status === 'ready' ? access.request.identity : access.identity;
      if (access.status === 'cancelled') return;
      if (access.status === 'error') {
        const apiError = getCurrentMealRequestError({error: access.error, fallback: '내 밥 계좌를 등록하지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
        if (apiError) setActionError(apiError);
        return;
      }
      const created = await api.createPaymentAccount(access.request.accessToken, campusId, currentUserId, {
        nickname,
        bankName,
        accountNumber,
        accountHolder,
      });
      if (!tracker.isSuccessCurrent(identity)) return;
      setState((current) => current.status === 'success'
        ? {status: 'success', data: [created, ...current.data]}
        : {status: 'success', data: [created]});
      setNickname('');
      setBankName('');
      setAccountNumber('');
      setAccountHolder('');
      if (!await load(false) && tracker.isSuccessCurrent(identity)) setRefreshWarning(true);
    } catch (error) {
      if (identity === null) return;
      const apiError = getCurrentMealRequestError({error, fallback: '내 밥 계좌를 등록하지 못했습니다.', identity, onSessionExpired, tracker});
      if (apiError) setActionError(apiError);
    } finally {
      finishMealMutation(mutationGate, operationId);
      if (identity === null || tracker.isSuccessCurrent(identity)) setSaving(false);
    }
  };

  const deactivate = async (accountId: number) => {
    const operationId = beginMealMutation(
      mutationGate,
      `${campusId}:${getAuthSessionGeneration()}:accounts`,
    );
    if (operationId === null) return;
    setSaving(true);
    setActionError(null);
    setRefreshWarning(false);
    let identity: MealRequestIdentity | null = null;
    try {
      const access = await resolveMealRequestAccess(tracker, 'account-deactivate', onSessionExpired);
      identity = access.status === 'ready' ? access.request.identity : access.identity;
      if (access.status === 'cancelled') return;
      if (access.status === 'error') {
        const apiError = getCurrentMealRequestError({error: access.error, fallback: '내 밥 계좌를 비활성화하지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
        if (apiError) setActionError(apiError);
        return;
      }
      const deactivated = await api.deactivatePaymentAccount(access.request.accessToken, campusId, currentUserId, accountId);
      if (!tracker.isSuccessCurrent(identity)) return;
      setState((current) => current.status === 'success'
        ? {status: 'success', data: current.data.map((account) => account.id === accountId ? deactivated : account)}
        : current);
      if (!await load(false) && tracker.isSuccessCurrent(identity)) setRefreshWarning(true);
    } catch (error) {
      if (identity === null) return;
      const apiError = getCurrentMealRequestError({error, fallback: '내 밥 계좌를 비활성화하지 못했습니다.', identity, onSessionExpired, tracker});
      if (apiError) setActionError(apiError);
    } finally {
      finishMealMutation(mutationGate, operationId);
      if (identity === null || tracker.isSuccessCurrent(identity)) setSaving(false);
    }
  };

  const confirmDeactivate = () => {
    const target = deactivationTarget;
    if (!target) return;
    setDeactivationTarget(null);
    void deactivate(target.id);
  };

  return (
    <View style={mealStyles.page}>
      <Card>
        <Eyebrow>내 계좌</Eyebrow>
        <Title>정산 계좌 관리</Title>
        <Text style={mealStyles.body}>밥 정산금을 받을 내 계좌를 관리할 수 있어요.</Text>
      </Card>

      {state.status === 'loading' ? <MealLoading label="내 밥 계좌를 불러오는 중" /> : null}
      {state.status === 'error' ? <MealErrorState error={state.error} onRetry={load} /> : null}
      {state.status === 'empty' ? <Empty title="등록한 밥 계좌가 없습니다" message="아래에서 청구에 사용할 본인 계좌를 등록해 주세요." /> : null}
      {state.status === 'success' ? state.data.map((account) => (
        <Card key={account.id}>
          <View style={mealStyles.rowBetween}>
            <View style={{flex: 1}}>
              <Title>{account.nickname}</Title>
              <Text selectable style={mealStyles.body}>{account.bankName} {account.accountNumber}</Text>
              <Text style={mealStyles.meta}>{account.accountHolder}</Text>
            </View>
            <Chip label={account.isActive ? '활성' : '비활성'} tone={account.isActive ? 'success' : 'default'} />
          </View>
          {account.isActive ? (
            <Button accessibilityLabel={`${account.nickname} 밥 계좌 비활성화`} disabled={saving} onPress={() => setDeactivationTarget(account)} variant="danger">비활성화</Button>
          ) : null}
        </Card>
      )) : null}

      <Card>
        <Eyebrow>새 본인 계좌</Eyebrow>
        <TextField accessibilityLabel="밥 계좌 별칭" label="계좌 이름" onChangeText={setNickname} value={nickname} />
        <TextField accessibilityLabel="밥 계좌 은행명" label="은행" onChangeText={setBankName} value={bankName} />
        <TextField accessibilityLabel="밥 계좌번호" keyboardType="number-pad" label="계좌번호" onChangeText={setAccountNumber} value={accountNumber} />
        <TextField accessibilityLabel="밥 계좌 예금주" label="예금주" onChangeText={setAccountHolder} value={accountHolder} />
        <Button accessibilityLabel="본인 밥 계좌 등록" disabled={saving} onPress={() => void create()}>{saving ? '저장 중...' : '계좌 등록'}</Button>
      </Card>
      {actionError ? <MealErrorState error={actionError} onRetry={load} /> : null}
      {refreshWarning ? <MealRefreshWarning onRetry={() => void load(false)} /> : null}
      <Button accessibilityLabel="밥 정산 관리 홈으로 돌아가기" onPress={onBack} variant="secondary">돌아가기</Button>

      <Modal
        animationType="slide"
        onRequestClose={() => setDeactivationTarget(null)}
        transparent
        visible={deactivationTarget !== null}>
        <View style={mealStyles.sheetBackdrop}>
          <View style={mealStyles.sheet}>
            <View accessible accessibilityLabel={`${deactivationTarget?.nickname ?? '선택한 계좌'} 비활성화 안내`}>
              <Eyebrow>계좌 비활성화</Eyebrow>
              <Title>이 계좌를 비활성화할까요?</Title>
              <Text style={mealStyles.body}>비활성화하면 앞으로 이 계좌로 새 청구를 만들 수 없으며 되돌릴 수 없습니다.</Text>
            </View>
            <View style={mealStyles.actionRow}>
              <Button accessibilityLabel="계좌 비활성화 취소" disabled={saving} onPress={() => setDeactivationTarget(null)} variant="secondary">취소</Button>
              <Button accessibilityLabel={`${deactivationTarget?.nickname ?? '선택한 계좌'} 비활성화 확인`} disabled={saving} onPress={confirmDeactivate} variant="danger">비활성화</Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
