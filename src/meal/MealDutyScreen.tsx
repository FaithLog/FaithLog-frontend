import {useCallback, useEffect, useState} from 'react';
import {Text, View} from 'react-native';

import type {ApiError} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {Button, Card, Eyebrow, FaithLogHeaderPillButton, FaithLogHeaderTopRow, Title} from '../components/ui';
import {mealApi, type MealApi} from './mealApi';
import {MealAccountScreen} from './MealAccountScreen';
import {MealPollChargeScreen} from './MealPollChargeScreen';
import {MealPollCreateScreen} from './MealPollCreateScreen';
import {MealPollDetailScreen} from './MealPollDetailScreen';
import {MealPollListScreen} from './MealPollListScreen';
import {MealSettlementScreen} from './MealSettlementScreen';
import {resolveMealRequestAccess} from './mealRequestLifecycle';
import {getCurrentMealRequestError, MealErrorState, MealLoading, mealStyles} from './mealScreenShared';
import {useMealRequestTracker} from './useMealRequestTracker';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;
type MealRoute =
  | {name: 'home'}
  | {name: 'polls'}
  | {name: 'create'}
  | {name: 'detail'; pollId: number}
  | {name: 'charge'; pollId: number}
  | {name: 'account'}
  | {name: 'settlement'};

type MealDutyScreenProps = {
  api?: MealApi;
  onBack: () => void;
  setAuthState: (state: AuthGateState) => void;
  state: AuthenticatedState;
};

type EntryState =
  | {status: 'loading'}
  | {status: 'success'; campusId: number; userId: number}
  | {status: 'error'; error: ApiError};

export function MealDutyScreen({api = mealApi, onBack, setAuthState, state}: MealDutyScreenProps) {
  const campusId = state.selectedCampus.campusId;
  const {scopeIsCommitted, tracker} = useMealRequestTracker(`campus:${campusId}/user:${state.user.id}/meal-entry`);
  const [route, setRoute] = useState<MealRoute>({name: 'home'});
  const [entryState, setEntryState] = useState<EntryState>({status: 'loading'});
  const onSessionExpired = useCallback(
    (message: string) => setAuthState({status: 'sessionExpired', message}),
    [setAuthState],
  );

  useEffect(() => {
    let mounted = true;
    setRoute({name: 'home'});
    setEntryState({status: 'loading'});
    const loadDuty = async () => {
      const access = await resolveMealRequestAccess(tracker, 'entry', onSessionExpired);
      if (access.status === 'cancelled') return;
      if (access.status === 'error') {
        const apiError = getCurrentMealRequestError({error: access.error, fallback: '밥 담당 권한을 확인하지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
        if (apiError && mounted) setEntryState({status: 'error', error: apiError});
        return;
      }
      const {accessToken, identity} = access.request;
      try {
        const duty = await api.getMyDuty(accessToken, campusId, state.user.id);
        if (!tracker.isSuccessCurrent(identity) || !mounted) return;
        if (!duty.isActive || duty.userId !== state.user.id) {
          throw new Error('활성 밥 담당자만 밥 정산 관리를 사용할 수 있습니다.');
        }
        setEntryState({status: 'success', campusId, userId: state.user.id});
      } catch (error) {
        const apiError = getCurrentMealRequestError({error, fallback: '밥 담당 권한을 확인하지 못했습니다.', identity, onSessionExpired, tracker});
        if (apiError && mounted) setEntryState({status: 'error', error: apiError});
      }
    };
    void loadDuty();
    return () => {
      mounted = false;
    };
  }, [api, campusId, onSessionExpired, state.user.id, tracker]);

  if (!scopeIsCommitted) return <MealLoading label="밥 정산 관리 화면을 전환하는 중" />;

  const entryIsCurrent =
    entryState.status === 'success' &&
    entryState.campusId === campusId &&
    entryState.userId === state.user.id;

  return (
    <View style={mealStyles.page}>
      <FaithLogHeaderTopRow campusLabel={state.selectedCampus.campusName} contextLabel="밥 정산 관리">
        <FaithLogHeaderPillButton accessibilityLabel="내정보 화면으로 돌아가기" label="뒤로" onPress={route.name === 'home' ? onBack : () => setRoute({name: 'home'})} />
      </FaithLogHeaderTopRow>

      {entryState.status === 'loading' ? <MealLoading label="밥 담당 권한을 확인하는 중" /> : null}
      {entryState.status === 'error' ? <MealErrorState error={entryState.error} /> : null}
      {entryIsCurrent
        ? renderRoute(route, state, setRoute, onSessionExpired, api)
        : null}
    </View>
  );
}

function renderRoute(
  route: MealRoute,
  state: AuthenticatedState,
  setRoute: (route: MealRoute) => void,
  onSessionExpired: (message: string) => void,
  api: MealApi,
) {
  const campusId = state.selectedCampus.campusId;
  switch (route.name) {
    case 'home':
      return <MealDutyHome onOpenAccount={() => setRoute({name: 'account'})} onOpenCreate={() => setRoute({name: 'create'})} onOpenPolls={() => setRoute({name: 'polls'})} onOpenSettlement={() => setRoute({name: 'settlement'})} />;
    case 'polls':
      return <MealPollListScreen api={api} campusId={campusId} onCreate={() => setRoute({name: 'create'})} onOpenDetail={(pollId) => setRoute({name: 'detail', pollId})} onSessionExpired={onSessionExpired} />;
    case 'create':
      return <MealPollCreateScreen api={api} campusId={campusId} onCancel={() => setRoute({name: 'home'})} onCreated={(poll) => setRoute({name: 'detail', pollId: poll.id})} onSessionExpired={onSessionExpired} />;
    case 'detail':
      return <MealPollDetailScreen api={api} campusId={campusId} onBack={() => setRoute({name: 'polls'})} onOpenCharge={(pollId) => setRoute({name: 'charge', pollId})} onSessionExpired={onSessionExpired} pollId={route.pollId} />;
    case 'charge':
      return <MealPollChargeScreen api={api} campusId={campusId} currentUserId={state.user.id} onBack={() => setRoute({name: 'detail', pollId: route.pollId})} onComplete={() => setRoute({name: 'detail', pollId: route.pollId})} onSessionExpired={onSessionExpired} pollId={route.pollId} />;
    case 'account':
      return <MealAccountScreen api={api} campusId={campusId} currentUserId={state.user.id} onBack={() => setRoute({name: 'home'})} onSessionExpired={onSessionExpired} />;
    case 'settlement':
      return <MealSettlementScreen api={api} campusId={campusId} currentUserId={state.user.id} onBack={() => setRoute({name: 'home'})} onSessionExpired={onSessionExpired} />;
    default:
      return null;
  }
}

function MealDutyHome({
  onOpenAccount,
  onOpenCreate,
  onOpenPolls,
  onOpenSettlement,
}: {
  onOpenAccount: () => void;
  onOpenCreate: () => void;
  onOpenPolls: () => void;
  onOpenSettlement: () => void;
}) {
  return (
    <View style={mealStyles.page}>
      <Card>
        <Eyebrow>밥 정산</Eyebrow>
        <Title>밥 정산 관리</Title>
        <Text style={mealStyles.body}>밥 투표를 만들고 마감된 투표의 정산을 진행할 수 있어요.</Text>
      </Card>
      <Card>
        <Title>투표</Title>
        <Text style={mealStyles.body}>투표를 만들고 진행 상황과 정산 상태를 확인합니다.</Text>
        <View style={mealStyles.actionRow}>
          <Button accessibilityLabel="밥 투표 관리 목록 열기" onPress={onOpenPolls}>투표 목록</Button>
          <Button accessibilityLabel="새 밥 투표 만들기" onPress={onOpenCreate} variant="secondary">투표 생성</Button>
        </View>
      </Card>
      <Card>
        <Title>계좌와 정산</Title>
        <Text style={mealStyles.body}>정산받을 계좌와 입금 내역을 확인합니다.</Text>
        <View style={mealStyles.actionRow}>
          <Button accessibilityLabel="내 밥 계좌 관리 열기" onPress={onOpenAccount}>내 계좌</Button>
          <Button accessibilityLabel="내 밥 정산 내역 열기" onPress={onOpenSettlement} variant="secondary">내 정산</Button>
        </View>
      </Card>
    </View>
  );
}
