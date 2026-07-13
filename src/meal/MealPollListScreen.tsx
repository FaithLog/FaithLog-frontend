import {useCallback, useEffect, useState} from 'react';
import {Text, View} from 'react-native';

import {Button, Card, Chip, Empty, Eyebrow, Title} from '../components/ui';
import {mealApi, type MealApi, type MealPollListQuery} from './mealApi';
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

const filters: Array<{label: string; value: MealPollStatus | undefined}> = [
  {label: '전체', value: undefined},
  {label: '예정', value: 'SCHEDULED'},
  {label: '진행 중', value: 'OPEN'},
  {label: '종료', value: 'CLOSED'},
];

export function MealPollListScreen({
  api = mealApi,
  campusId,
  onCreate,
  onOpenDetail,
  onSessionExpired,
}: MealPollListScreenProps) {
  const {scopeIsCommitted, tracker} = useMealRequestTracker(`campus:${campusId}/meal-polls`);
  const [status, setStatus] = useState<MealPollStatus | undefined>();
  const [page, setPage] = useState(0);
  const [state, setState] = useState<MealLoadState<MealPollList>>({status: 'loading'});

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
      const query: MealPollListQuery = {page, size: 20, sort: 'endsAt,desc', ...(status ? {status} : {})};
      const result = await api.listPolls(accessToken, campusId, query);
      if (!tracker.isSuccessCurrent(identity)) return;
      setState(result.content.length === 0 ? {status: 'empty'} : {status: 'success', data: result});
    } catch (error) {
      const apiError = getCurrentMealRequestError({error, fallback: '밥 투표 목록을 불러오지 못했습니다.', identity, onSessionExpired, tracker});
      if (apiError) setState({status: 'error', error: apiError});
    }
  }, [api, campusId, onSessionExpired, page, status, tracker]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!scopeIsCommitted) return <MealLoading label="밥 투표 목록을 전환하는 중" />;

  const selectStatus = (nextStatus: MealPollStatus | undefined) => {
    if (status === nextStatus && page === 0) return;
    setPage(0);
    setStatus(nextStatus);
  };

  return (
    <View style={mealStyles.page}>
      <Card>
        <View style={mealStyles.rowBetween}>
          <View>
            <Eyebrow>밥 투표 관리</Eyebrow>
            <Title>투표 목록</Title>
          </View>
          <Button accessibilityLabel="새 밥 투표 만들기" onPress={onCreate}>새 투표</Button>
        </View>
        <Text style={mealStyles.body}>진행 중인 투표와 지난 투표를 한곳에서 확인할 수 있어요.</Text>
        <View style={mealStyles.actionRow}>
          {filters.map((filter) => (
            <Button
              accessibilityLabel={`${filter.label} 밥 투표 보기`}
              key={filter.label}
              onPress={() => selectStatus(filter.value)}
              variant={status === filter.value ? 'primary' : 'secondary'}>
              {filter.label}
            </Button>
          ))}
        </View>
      </Card>
      {state.status === 'loading' ? <MealLoading label="밥 투표를 불러오는 중" /> : null}
      {state.status === 'error' ? <MealErrorState error={state.error} onRetry={load} /> : null}
      {state.status === 'empty' ? (
        <Empty title="표시할 밥 투표가 없습니다" message="필터를 바꾸거나 새 투표를 만들어 주세요." actionLabel="새 투표" onActionPress={onCreate} />
      ) : null}
      {state.status === 'success' ? (
        <View style={mealStyles.list}>
          {state.data.content.map((poll) => (
            <MealPollCard key={poll.id} onOpen={() => onOpenDetail(poll.id)} poll={poll} />
          ))}
          {state.data.totalPages > 1 ? (
            <View style={mealStyles.actionRow}>
              <Button
                accessibilityLabel="이전 밥 투표 페이지"
                disabled={page === 0}
                onPress={() => setPage((current) => Math.max(0, current - 1))}
                variant="secondary">
                이전
              </Button>
              <Text style={mealStyles.meta}>{page + 1} / {state.data.totalPages} 페이지</Text>
              <Button
                accessibilityLabel="다음 밥 투표 페이지"
                disabled={page + 1 >= state.data.totalPages}
                onPress={() => setPage((current) => current + 1)}
                variant="secondary">
                다음
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function MealPollCard({onOpen, poll}: {onOpen: () => void; poll: MealPollSummary}) {
  return (
    <Card>
      <View style={mealStyles.rowBetween}>
        <View style={{flex: 1}}>
          <Eyebrow>{getPollStatusCopy(poll.status).eyebrow}</Eyebrow>
          <Title>{poll.title}</Title>
        </View>
        <Chip label={poll.settlementStatus === 'CHARGED' ? '청구 완료' : '미청구'} tone={poll.settlementStatus === 'CHARGED' ? 'success' : 'warning'} />
      </View>
      <Text style={mealStyles.meta}>응답 {poll.totalResponseCount}명 · 마감 {new Date(poll.endsAt).toLocaleString()}</Text>
      <Button accessibilityLabel={`${poll.title} 밥 투표 상세 보기`} onPress={onOpen} variant="secondary">상세 보기</Button>
    </Card>
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
