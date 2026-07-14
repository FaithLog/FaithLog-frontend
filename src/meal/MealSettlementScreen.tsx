import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {Text} from 'react-native';

import {getProgressiveItems, useProgressiveRendering} from '../components/progressiveRendering';
import {
  DutyActionButton,
  DutyActionRow,
  DutyAsyncState,
  DutyConfirmSheet,
  DutyEntityCard,
  DutyMetricSurface,
  DutyPageSection,
  DutySectionHeader,
} from '../duty/DutyPresentation';
import {
  dutyChargeReminderApi,
  type DutyChargeReminderApi,
} from '../duty/dutyChargeReminderApi';
import {
  beginDutyChargeReminder,
  createDutyChargeReminderGate,
  finishDutyChargeReminder,
  isDutyChargeReminderCurrent,
  syncDutyChargeReminderScope,
} from '../duty/dutyChargeReminderFlow';
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
  reminderApi?: DutyChargeReminderApi;
  showBackButton?: boolean;
};

type MealReminderState =
  | {status: 'idle'}
  | {status: 'sending'}
  | {status: 'sent'; queuedCount: number; skippedCount: number}
  | {status: 'error'; message: string};

export function MealSettlementScreen({
  api = mealApi,
  campusId,
  currentUserId,
  onBack,
  onSessionExpired,
  reminderApi = dutyChargeReminderApi,
  showBackButton = true,
}: MealSettlementScreenProps) {
  const reminderScope = `campus:${campusId}/user:${currentUserId}/meal-reminder`;
  const {scopeIsCommitted, tracker} = useMealRequestTracker(`campus:${campusId}/user:${currentUserId}/meal-settlement`);
  const [state, setState] = useState<MealLoadState<MealSettlement>>({status: 'loading'});
  const [reminderConfirmVisible, setReminderConfirmVisible] = useState(false);
  const [reminderState, setReminderState] = useState<MealReminderState>({status: 'idle'});
  const reminderGate = useRef(createDutyChargeReminderGate(reminderScope)).current;
  const memberCount = state.status === 'success' ? state.data.members.length : 0;
  const memberProgress = useProgressiveRendering(
    memberCount,
    `${campusId}:${currentUserId}`,
  );

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

  useEffect(() => {
    if (!syncDutyChargeReminderScope(reminderGate, reminderScope)) return;
    setReminderConfirmVisible(false);
    setReminderState({status: 'idle'});
  }, [reminderGate, reminderScope]);

  const sendReminder = useCallback(async () => {
    const operationId = beginDutyChargeReminder(reminderGate, reminderScope);
    if (operationId === null) return;
    setReminderConfirmVisible(false);
    setReminderState({status: 'sending'});
    const access = await resolveMealRequestAccess(
      tracker,
      'settlement-reminder',
      onSessionExpired,
    );
    if (access.status === 'cancelled') {
      if (isDutyChargeReminderCurrent(reminderGate, operationId, reminderScope)) {
        setReminderState({status: 'idle'});
      }
      finishDutyChargeReminder(reminderGate, operationId, reminderScope);
      return;
    }
    if (access.status === 'error') {
      const apiError = getCurrentMealRequestError({
        error: access.error,
        fallback: '밥 미납 알림을 보내지 못했습니다.',
        identity: access.identity,
        onSessionExpired,
        tracker,
      });
      if (
        apiError &&
        isDutyChargeReminderCurrent(reminderGate, operationId, reminderScope)
      ) {
        setReminderState({status: 'error', message: getReminderErrorMessage(apiError)});
      }
      finishDutyChargeReminder(reminderGate, operationId, reminderScope);
      return;
    }

    try {
      const result = await reminderApi.send(
        access.request.accessToken,
        campusId,
        'MEAL',
      );
      if (
        !tracker.isSuccessCurrent(access.request.identity) ||
        !isDutyChargeReminderCurrent(reminderGate, operationId, reminderScope)
      ) return;
      setReminderState({
        status: 'sent',
        queuedCount: result.queuedCount,
        skippedCount: result.skippedCount,
      });
    } catch (error) {
      const apiError = getCurrentMealRequestError({
        error,
        fallback: '밥 미납 알림을 보내지 못했습니다.',
        identity: access.request.identity,
        onSessionExpired,
        tracker,
      });
      if (
        apiError &&
        isDutyChargeReminderCurrent(reminderGate, operationId, reminderScope)
      ) {
        setReminderState({status: 'error', message: getReminderErrorMessage(apiError)});
      }
    } finally {
      finishDutyChargeReminder(reminderGate, operationId, reminderScope);
    }
  }, [campusId, onSessionExpired, reminderApi, reminderGate, reminderScope, tracker]);

  if (!scopeIsCommitted) return <MealLoading label="내 밥 정산 화면을 전환하는 중" />;

  return (
    <DutyPageSection>
      <DutySectionHeader
        action={(
          <DutyActionRow>
            <DutyActionButton accessibilityLabel="밥 정산 새로고침" compact label="새로고침" onPress={() => void load()} />
            <DutyActionButton
              accessibilityLabel="밥 전체 미납 알림 보내기 확인 열기"
              busy={reminderState.status === 'sending'}
              disabled={state.status !== 'success' || state.data.summary.unpaidAmount <= 0}
              label={reminderState.status === 'sending' ? '알림 요청 중...' : '전체 미납 알림'}
              onPress={() => setReminderConfirmVisible(true)}
              variant="primary"
            />
          </DutyActionRow>
        )}
        description="내 밥 계좌에 연결된 청구의 요약과 멤버별 상태를 확인할 수 있어요."
        eyebrow="내 정산"
        title="밥 정산 현황"
      />
      {state.status === 'loading' ? <MealLoading label="내 밥 정산을 불러오는 중" /> : null}
      {state.status === 'error' ? <MealErrorState error={state.error} onRetry={load} /> : null}
      {state.status === 'empty' ? <DutyAsyncState actionLabel="다시 불러오기" message="내 계좌로 청구한 내역이 이곳에 표시됩니다." onAction={load} status="empty" title="밥 정산 내역이 없습니다" /> : null}
      {state.status === 'success' ? (
        <>
          <DutyMetricSurface label="전체 합계" value={formatWon(state.data.summary.totalAmount)}>
            <Text style={mealStyles.meta}>미납 {formatWon(state.data.summary.unpaidAmount)} · 납부 {formatWon(state.data.summary.paidAmount)}</Text>
            <Text style={mealStyles.meta}>면제 {formatWon(state.data.summary.waivedAmount)} · 취소 {formatWon(state.data.summary.canceledAmount)}</Text>
          </DutyMetricSurface>
          {getProgressiveItems(state.data.members, memberProgress.limit).map((member) => (
            <MemoizedMealSettlementMemberRow key={member.userId} member={member} />
          ))}
          {memberProgress.hasMore ? (
            <DutyActionButton accessibilityLabel="밥 정산 멤버 더 보기" label="멤버 더 보기" onPress={memberProgress.showMore} />
          ) : null}
        </>
      ) : null}
      {reminderState.status === 'sent' ? (
        <DutyEntityCard
          statusLabel="접수 완료"
          statusTone="success"
          title="미납 알림 요청을 접수했습니다"
        >
          <Text style={mealStyles.meta}>
            {`${reminderState.queuedCount}명 전송 대기 · ${reminderState.skippedCount}명 제외`}
          </Text>
        </DutyEntityCard>
      ) : null}
      {reminderState.status === 'error' ? (
        <DutyAsyncState
          actionAccessibilityLabel="밥 미납 알림 다시 확인"
          actionLabel="다시 시도"
          message={reminderState.message}
          onAction={() => setReminderConfirmVisible(true)}
          status="error"
          title="미납 알림을 보내지 못했습니다"
        />
      ) : null}
      {showBackButton ? (
        <DutyActionButton accessibilityLabel="밥 정산 관리 홈으로 돌아가기" label="돌아가기" onPress={onBack} />
      ) : null}
      <DutyConfirmSheet
        busy={reminderState.status === 'sending'}
        cancelAccessibilityLabel="밥 전체 미납 알림 취소"
        confirmAccessibilityLabel="밥 전체 미납 알림 보내기 확인"
        confirmLabel="알림 보내기"
        message="내가 담당하는 모든 미납 청구 대상자에게 알림을 보냅니다. 오늘 이미 알림을 받은 대상자는 제외될 수 있습니다."
        onCancel={() => setReminderConfirmVisible(false)}
        onConfirm={() => void sendReminder()}
        title="밥 미납 알림을 보낼까요?"
        visible={reminderConfirmVisible}
      />
    </DutyPageSection>
  );
}

const MemoizedMealSettlementMemberRow = memo(function MemoizedMealSettlementMemberRow({
  member,
}: {
  member: MealSettlement['members'][number];
}) {
  return (
    <DutyEntityCard statusLabel={formatWon(member.totalAmount)} statusTone="info" subtitle={member.email} title={member.name}>
      <Text style={mealStyles.meta}>미납 {formatWon(member.unpaidAmount)} · 납부 {formatWon(member.paidAmount)} · 면제 {formatWon(member.waivedAmount)} · 취소 {formatWon(member.canceledAmount)}</Text>
    </DutyEntityCard>
  );
});

function getReminderErrorMessage(error: {code?: string; kind: string; status?: number}) {
  if (error.kind === 'permissionDenied' || error.status === 403) {
    return '활성 밥 담당자만 미납 알림을 보낼 수 있습니다.';
  }
  if (error.kind === 'conflict' || error.status === 409) {
    return '알림 요청 상태가 변경되었습니다. 정산 내역을 새로고침한 뒤 다시 시도해 주세요.';
  }
  if (error.status === 404) {
    return '현재 캠퍼스의 밥 담당 범위를 찾을 수 없습니다.';
  }
  if (error.code === 'API_CONTRACT_PENDING') {
    return '현재 미납 알림 기능을 사용할 수 없습니다.';
  }
  return '네트워크 상태를 확인한 뒤 다시 시도해 주세요.';
}
