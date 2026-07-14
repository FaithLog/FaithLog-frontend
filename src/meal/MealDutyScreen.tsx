import {useCallback, useEffect, useState} from 'react';
import {KeyboardAvoidingView, Platform, Pressable, Text, View} from 'react-native';

import type {ApiError} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {FaithLogHeaderPillButton, FaithLogHeaderTopRow} from '../components/ui';
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

type MealDutyPage = Extract<MealRoute['name'], 'account' | 'create' | 'polls' | 'settlement'>;

export const mealDutyPages: ReadonlyArray<{id: MealDutyPage; label: string}> = [
  {id: 'polls', label: '투표'},
  {id: 'create', label: '투표 생성'},
  {id: 'account', label: '내 계좌'},
  {id: 'settlement', label: '정산'},
];

export function MealDutyScreen({api = mealApi, onBack, setAuthState, state}: MealDutyScreenProps) {
  const campusId = state.selectedCampus.campusId;
  const {scopeIsCommitted, tracker} = useMealRequestTracker(`campus:${campusId}/user:${state.user.id}/meal-entry`);
  const [route, setRoute] = useState<MealRoute>({name: 'polls'});
  const [entryState, setEntryState] = useState<EntryState>({status: 'loading'});
  const onSessionExpired = useCallback(
    (message: string) => setAuthState({status: 'sessionExpired', message}),
    [setAuthState],
  );

  useEffect(() => {
    let mounted = true;
    setRoute({name: 'polls'});
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

  const topLevelPage = getTopLevelMealPage(route);
  const handleBack = () => {
    if (route.name === 'detail') {
      setRoute({name: 'polls'});
      return;
    }
    if (route.name === 'charge') {
      setRoute({name: 'detail', pollId: route.pollId});
      return;
    }
    onBack();
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      enabled={Platform.OS === 'ios'}
      keyboardVerticalOffset={16}
      style={mealStyles.frame}>
      <View style={mealStyles.header}>
        <FaithLogHeaderTopRow
          campusLabel={state.selectedCampus.campusName}
          contextLabel={`${state.user.name}님`}>
          <FaithLogHeaderPillButton
            accessibilityLabel={topLevelPage ? '내정보로 돌아가기' : '이전 밥 관리 화면으로 돌아가기'}
            label="뒤로"
            onPress={handleBack}
          />
        </FaithLogHeaderTopRow>
        <View style={mealStyles.headerText}>
          <Text style={mealStyles.kicker}>밥 담당자</Text>
          <Text style={mealStyles.screenTitle}>밥 정산 관리</Text>
        </View>
      </View>

      <View style={mealStyles.content}>
        {entryState.status === 'loading' ? <MealLoading label="밥 담당 권한을 확인하고 있어요." /> : null}
        {entryState.status === 'error' ? <MealErrorState error={entryState.error} /> : null}
        {entryIsCurrent && topLevelPage ? (
          <MealDutyPageNav
            page={topLevelPage}
            onSelectPage={(page) => setRoute(toMealRoute(page))}
          />
        ) : null}
        {entryIsCurrent
          ? renderRoute(route, state, setRoute, onSessionExpired, api)
          : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function toMealRoute(page: MealDutyPage): MealRoute {
  switch (page) {
    case 'polls':
      return {name: 'polls'};
    case 'create':
      return {name: 'create'};
    case 'account':
      return {name: 'account'};
    case 'settlement':
      return {name: 'settlement'};
    default:
      return assertNever(page);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected meal duty page: ${String(value)}`);
}

function getTopLevelMealPage(route: MealRoute): MealDutyPage | null {
  switch (route.name) {
    case 'polls':
    case 'create':
    case 'account':
    case 'settlement':
      return route.name;
    case 'detail':
    case 'charge':
      return null;
    default:
      return null;
  }
}

function MealDutyPageNav({
  onSelectPage,
  page,
}: {
  onSelectPage: (page: MealDutyPage) => void;
  page: MealDutyPage;
}) {
  return (
    <View style={mealStyles.pageNav}>
      {mealDutyPages.map((item) => {
        const active = item.id === page;
        return (
          <Pressable
            accessibilityLabel={`밥 ${item.label} 페이지 열기`}
            accessibilityRole="button"
            accessibilityState={{selected: active}}
            key={item.id}
            onPress={() => onSelectPage(item.id)}
            style={({pressed}) => [
              mealStyles.pageNavButton,
              active ? mealStyles.pageNavButtonActive : null,
              pressed ? mealStyles.pressed : null,
            ]}>
            <Text style={[mealStyles.pageNavText, active ? mealStyles.pageNavTextActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
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
    case 'polls':
      return <MealPollListScreen api={api} campusId={campusId} onCreate={() => setRoute({name: 'create'})} onOpenDetail={(pollId) => setRoute({name: 'detail', pollId})} onSessionExpired={onSessionExpired} />;
    case 'create':
      return <MealPollCreateScreen api={api} campusId={campusId} onCancel={() => setRoute({name: 'polls'})} onCreated={(poll) => setRoute({name: 'detail', pollId: poll.id})} onSessionExpired={onSessionExpired} />;
    case 'detail':
      return <MealPollDetailScreen api={api} campusId={campusId} onBack={() => setRoute({name: 'polls'})} onOpenCharge={(pollId) => setRoute({name: 'charge', pollId})} onSessionExpired={onSessionExpired} pollId={route.pollId} />;
    case 'charge':
      return <MealPollChargeScreen api={api} campusId={campusId} currentUserId={state.user.id} onBack={() => setRoute({name: 'detail', pollId: route.pollId})} onComplete={() => setRoute({name: 'detail', pollId: route.pollId})} onSessionExpired={onSessionExpired} pollId={route.pollId} />;
    case 'account':
      return <MealAccountScreen api={api} campusId={campusId} currentUserId={state.user.id} onBack={() => setRoute({name: 'polls'})} onSessionExpired={onSessionExpired} showBackButton={false} />;
    case 'settlement':
      return <MealSettlementScreen api={api} campusId={campusId} currentUserId={state.user.id} onBack={() => setRoute({name: 'polls'})} onSessionExpired={onSessionExpired} showBackButton={false} />;
    default:
      return null;
  }
}
