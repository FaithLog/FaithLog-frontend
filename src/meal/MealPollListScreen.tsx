import {useCallback, useEffect, useMemo, useState} from 'react';
import {Text, View} from 'react-native';
import {DEFAULT_PAGE_SIZE, hasNextPage} from '../api/pagination';

import {
  DutyActionButton,
  DutyActionRow,
  DutyAsyncState,
  DutyEntityCard,
  DutyPageSection,
  DutySectionHeader,
} from '../duty/DutyPresentation';
import {mealApi, type MealApi} from './mealApi';
import {resolveMealRequestAccess} from './mealRequestLifecycle';
import type {MealPollList, MealPollStatus, MealPollSummary} from './mealTypes';
import {
  MealErrorState,
  getCurrentMealRequestError,
  MealLoading,
  type MealLoadState,
  mealStyles,
} from './mealScreenShared';
import {useMealRequestTracker} from './useMealRequestTracker';

type MealPollListScreenProps = {
  api?: MealApi;
  campusId: number;
  onCreate: () => void;
  onOpenDetail: (pollId: number) => void;
  onSessionExpired: (message: string) => void;
};

type MealPollChargeFilter = 'ALL' | 'NOT_CHARGED' | 'CHARGED';

export function MealPollListScreen({
  api = mealApi,
  campusId,
  onOpenDetail,
  onSessionExpired,
}: MealPollListScreenProps) {
  const {scopeIsCommitted, tracker} = useMealRequestTracker(`campus:${campusId}/meal-polls`);
  const [state, setState] = useState<MealLoadState<MealPollList>>({status: 'loading'});
  const [chargeFilter, setChargeFilter] = useState<MealPollChargeFilter>('ALL');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(0);
  const visiblePolls = useMemo(() => {
    if (state.status !== 'success') return [];
    if (chargeFilter === 'ALL') return state.data.content;
    return state.data.content.filter((poll) => poll.settlementStatus === chargeFilter);
  }, [chargeFilter, state]);

  const load = useCallback(async () => {
    setState({status: 'loading'});
    const access = await resolveMealRequestAccess(tracker, 'list', onSessionExpired);
    if (access.status === 'cancelled') return;
    if (access.status === 'error') {
      const apiError = getCurrentMealRequestError({error: access.error, fallback: '밥 투표 목록을 불러오지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
      if (apiError) setState({status: 'error', error: apiError});
      return;
    }
    const {accessToken, identity} = access.request;
    try {
      const result = await api.listPolls(accessToken, campusId, {
        includeArchived,
        page,
        size: DEFAULT_PAGE_SIZE,
        sort: 'createdAt,desc',
      });
      if (!tracker.isSuccessCurrent(identity)) return;
      setState(result.content.length === 0 ? {status: 'empty'} : {status: 'success', data: result});
    } catch (error) {
      const apiError = getCurrentMealRequestError({error, fallback: '밥 투표 목록을 불러오지 못했습니다.', identity, onSessionExpired, tracker});
      if (apiError) setState({status: 'error', error: apiError});
    }
  }, [api, campusId, includeArchived, onSessionExpired, page, tracker]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!scopeIsCommitted) return <MealLoading label="밥 투표 목록을 전환하는 중" />;

  return (
    <DutyPageSection>
      <DutySectionHeader
        description="진행 중인 투표와 지난 투표를 한곳에서 확인할 수 있어요."
        eyebrow="밥 투표 관리"
        title="투표 목록"
      />
      <DutyActionButton accessibilityLabel="밥 투표 목록 새로고침" compact label="새로고침" onPress={() => void load()} />
      <DutyActionButton
        accessibilityLabel={includeArchived ? '밥 투표 최근 기록 보기' : '밥 투표 이전 기록 보기'}
        compact
        label={includeArchived ? '최근 기록 보기' : '이전 기록 보기'}
        onPress={() => {
          setPage(0);
          setIncludeArchived((current) => !current);
        }}
        variant="secondary"
      />
      {state.status === 'loading' ? <MealLoading label="밥 투표를 불러오는 중" /> : null}
      {state.status === 'error' ? <MealErrorState error={state.error} onRetry={load} /> : null}
      {state.status === 'empty' ? (
        <DutyAsyncState
          message="새 투표를 만들면 이곳에서 진행 상태를 확인할 수 있어요."
          status="empty"
          title="표시할 밥 투표가 없습니다"
        />
      ) : null}
      {state.status === 'success' ? (
        <>
          <View style={mealStyles.list}>
            <View style={mealStyles.actionRow}>
              {mealPollChargeFilters.map((filter) => (
                <DutyActionButton
                  accessibilityLabel={`밥 투표 ${filter.label} 보기`}
                  key={filter.value}
                  label={filter.label}
                  onPress={() => setChargeFilter(filter.value)}
                  variant={chargeFilter === filter.value ? 'primary' : 'secondary'}
                />
              ))}
            </View>
            {visiblePolls.map((poll) => (
              <MealPollCard key={poll.id} onOpen={() => onOpenDetail(poll.id)} poll={poll} />
            ))}
          </View>
          {visiblePolls.length === 0 ? (
            <DutyAsyncState
              message={`${getMealPollChargeFilterLabel(chargeFilter)} 투표가 없습니다.`}
              status="empty"
            />
          ) : null}
          <DutyActionRow>
            <DutyActionButton
              accessibilityLabel="이전 밥 투표 페이지"
              disabled={state.data.page === 0}
              label="이전"
              onPress={() => setPage(Math.max(0, state.data.page - 1))}
              variant="secondary"
            />
            <DutyActionButton
              accessibilityLabel="다음 밥 투표 페이지"
              disabled={!hasNextPage(state.data)}
              label="다음"
              onPress={() => setPage(state.data.page + 1)}
              variant="secondary"
            />
          </DutyActionRow>
        </>
      ) : null}
    </DutyPageSection>
  );
}

const mealPollChargeFilters: Array<{label: string; value: MealPollChargeFilter}> = [
  {label: '전체', value: 'ALL'},
  {label: '미청구', value: 'NOT_CHARGED'},
  {label: '청구 완료', value: 'CHARGED'},
];

function getMealPollChargeFilterLabel(filter: MealPollChargeFilter) {
  switch (filter) {
    case 'ALL':
      return '전체';
    case 'NOT_CHARGED':
      return '미청구';
    case 'CHARGED':
      return '청구 완료';
  }
}

function MealPollCard({onOpen, poll}: {onOpen: () => void; poll: MealPollSummary}) {
  return (
    <DutyEntityCard
      statusLabel={poll.settlementStatus === 'CHARGED' ? '청구 완료' : '미청구'}
      statusTone={poll.settlementStatus === 'CHARGED' ? 'success' : 'warning'}
      subtitle={getPollStatusCopy(poll.status).eyebrow}
      title={poll.title}>
      <Text style={mealStyles.meta}>마감 {new Date(poll.endsAt).toLocaleString()}</Text>
      <DutyActionButton accessibilityLabel={`${poll.title} 밥 투표 상세 보기`} label="상세 보기" onPress={onOpen} />
    </DutyEntityCard>
  );
}

function getPollStatusCopy(status: MealPollStatus) {
  switch (status) {
    case 'SCHEDULED':
      return {eyebrow: '예정된 투표', label: '예정'};
    case 'OPEN':
      return {eyebrow: '진행 중인 투표', label: '진행 중'};
    case 'CLOSED':
      return {eyebrow: '종료된 투표', label: '종료'};
  }
}
