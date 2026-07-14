import {memo, useCallback, useEffect, useState} from 'react';
import {Text} from 'react-native';

import {getProgressiveItems, useProgressiveRendering} from '../components/progressiveRendering';
import {
  DutyActionButton,
  DutyAsyncState,
  DutyEntityCard,
  DutyMetricSurface,
  DutyPageSection,
  DutySectionHeader,
} from '../duty/DutyPresentation';
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

  if (!scopeIsCommitted) return <MealLoading label="내 밥 정산 화면을 전환하는 중" />;

  return (
    <DutyPageSection>
      <DutySectionHeader
        action={<DutyActionButton accessibilityLabel="밥 정산 새로고침" label="새로고침" onPress={() => void load()} />}
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
      {showBackButton ? (
        <DutyActionButton accessibilityLabel="밥 정산 관리 홈으로 돌아가기" label="돌아가기" onPress={onBack} />
      ) : null}
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
