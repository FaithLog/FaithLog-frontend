import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {Text} from 'react-native';

import type {ApiError} from '../api/types';
import {getAuthSessionGeneration} from '../api/tokenStorage';
import {TextField} from '../components/ui';
import {getProgressiveItems, useProgressiveRendering} from '../components/progressiveRendering';
import {
  DutyActionButton,
  DutyAsyncState,
  DutyConfirmSheet,
  DutyEntityCard,
  DutyFormSection,
  DutyPageSection,
  DutySectionHeader,
} from '../duty/DutyPresentation';
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
  showBackButton?: boolean;
};

export function MealAccountScreen({api = mealApi, campusId, currentUserId, onBack, onSessionExpired, showBackButton = true}: MealAccountScreenProps) {
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
  const accountCount = state.status === 'success' ? state.data.length : 0;
  const accountProgress = useProgressiveRendering(
    accountCount,
    `${campusId}:${currentUserId}`,
  );

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
        ? {
            status: 'success',
            data: [
              created,
              ...current.data
                .filter((account) => account.id !== created.id)
                .map((account) => account.isActive
                  ? {...account, isActive: false, deactivatedAt: created.createdAt}
                  : account),
            ],
          }
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
    <DutyPageSection>
      <DutySectionHeader
        description="밥 정산금을 받을 내 계좌를 관리할 수 있어요."
        eyebrow="내 계좌"
        title="정산 계좌 관리"
      />

      {state.status === 'loading' ? <MealLoading label="내 밥 계좌를 불러오는 중" /> : null}
      {state.status === 'error' ? <MealErrorState error={state.error} onRetry={load} /> : null}
      {state.status === 'empty' ? <DutyAsyncState title="등록한 밥 계좌가 없습니다" message="아래에서 청구에 사용할 본인 계좌를 등록해 주세요." status="empty" /> : null}
      {state.status === 'success' ? getProgressiveItems(state.data, accountProgress.limit).map((account) => (
        <MemoizedMealAccountRow
          account={account}
          busy={saving}
          key={account.id}
          onDeactivate={setDeactivationTarget}
        />
      )) : null}
      {state.status === 'success' && accountProgress.hasMore ? (
        <DutyActionButton accessibilityLabel="이전 밥 계좌 더 보기" label="계좌 더 보기" onPress={accountProgress.showMore} />
      ) : null}

      <DutyFormSection>
        <DutySectionHeader eyebrow="새 본인 계좌" title="정산 계좌 등록" />
        <TextField accessibilityLabel="밥 계좌 별칭" label="계좌 이름" onChangeText={setNickname} value={nickname} />
        <TextField accessibilityLabel="밥 계좌 은행명" label="은행" onChangeText={setBankName} value={bankName} />
        <TextField accessibilityLabel="밥 계좌번호" keyboardType="number-pad" label="계좌번호" onChangeText={setAccountNumber} value={accountNumber} />
        <TextField accessibilityLabel="밥 계좌 예금주" label="예금주" onChangeText={setAccountHolder} value={accountHolder} />
        <DutyActionButton accessibilityLabel="본인 밥 계좌 등록" busy={saving} label={saving ? '저장 중...' : '계좌 등록'} onPress={() => void create()} variant="primary" />
      </DutyFormSection>
      {actionError ? <MealErrorState error={actionError} onRetry={load} /> : null}
      {refreshWarning ? <MealRefreshWarning onRetry={() => void load(false)} /> : null}
      {showBackButton ? (
        <DutyActionButton accessibilityLabel="밥 정산 관리 홈으로 돌아가기" label="돌아가기" onPress={onBack} />
      ) : null}

      <DutyConfirmSheet
        busy={saving}
        cancelAccessibilityLabel="계좌 비활성화 취소"
        confirmAccessibilityLabel={`${deactivationTarget?.nickname ?? '선택한 계좌'} 비활성화 확인`}
        confirmLabel="비활성화"
        message="비활성화하면 앞으로 이 계좌로 새 청구를 만들 수 없으며 되돌릴 수 없습니다."
        onCancel={() => setDeactivationTarget(null)}
        onConfirm={confirmDeactivate}
        title="이 계좌를 비활성화할까요?"
        visible={deactivationTarget !== null}
      />
    </DutyPageSection>
  );
}

const MemoizedMealAccountRow = memo(function MemoizedMealAccountRow({
  account,
  busy,
  onDeactivate,
}: {
  account: MealPaymentAccount;
  busy: boolean;
  onDeactivate: (account: MealPaymentAccount) => void;
}) {
  return (
    <DutyEntityCard
      statusLabel={account.isActive ? '활성' : '비활성'}
      statusTone={account.isActive ? 'success' : 'default'}
      subtitle={`${account.bankName} ${account.accountNumber}`}
      title={account.nickname}>
      <Text style={mealStyles.meta}>{account.accountHolder}</Text>
      {account.isActive ? (
        <DutyActionButton accessibilityLabel={`${account.nickname} 밥 계좌 비활성화`} disabled={busy} label="비활성화" onPress={() => onDeactivate(account)} variant="danger" />
      ) : null}
    </DutyEntityCard>
  );
});
