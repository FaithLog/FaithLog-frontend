import {useCallback, useEffect, useState} from 'react';
import {Text, View} from 'react-native';

import type {ApiError} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {Button, Card, Eyebrow, FaithLogHeaderPillButton, FaithLogHeaderTopRow, Title} from '../components/ui';
import {mealApi} from './mealApi';
import {MealAccountScreen} from './MealAccountScreen';
import {MealPollChargeScreen} from './MealPollChargeScreen';
import {MealPollCreateScreen} from './MealPollCreateScreen';
import {MealPollDetailScreen} from './MealPollDetailScreen';
import {MealPollListScreen} from './MealPollListScreen';
import {MealSettlementScreen} from './MealSettlementScreen';
import {MealErrorState, MealLoading, mealStyles, toMealApiError} from './mealScreenShared';

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
  onBack: () => void;
  setAuthState: (state: AuthGateState) => void;
  state: AuthenticatedState;
};

type EntryState =
  | {status: 'loading'}
  | {status: 'success'; accessToken: string}
  | {status: 'error'; error: ApiError};

export function MealDutyScreen({onBack, setAuthState, state}: MealDutyScreenProps) {
  const [route, setRoute] = useState<MealRoute>({name: 'home'});
  const [entryState, setEntryState] = useState<EntryState>({status: 'loading'});
  const onSessionExpired = useCallback(
    (message: string) => setAuthState({status: 'sessionExpired', message}),
    [setAuthState],
  );

  useEffect(() => {
    let mounted = true;
    const loadDuty = async () => {
      try {
        const accessToken = await resolveCurrentAccessToken(() => {
          setAuthState({status: 'sessionExpired', message: '로그인이 만료되었습니다. 다시 로그인해 주세요.'});
        });
        if (!accessToken || !mounted) return;
        const duty = await mealApi.getMyDuty(accessToken, state.selectedCampus.campusId);
        if (!duty.isActive || duty.userId !== state.user.id) {
          throw new Error('활성 밥 담당자만 밥 정산 관리를 사용할 수 있습니다.');
        }
        if (mounted) setEntryState({status: 'success', accessToken});
      } catch (error) {
        const apiError = toMealApiError(
          error,
          '밥 담당 권한을 확인하지 못했습니다.',
          onSessionExpired,
        );
        if (mounted) setEntryState({status: 'error', error: apiError});
      }
    };
    void loadDuty();
    return () => {
      mounted = false;
    };
  }, [onSessionExpired, setAuthState, state.selectedCampus.campusId, state.user.id]);

  return (
    <View style={mealStyles.page}>
      <FaithLogHeaderTopRow campusLabel={state.selectedCampus.campusName} contextLabel="밥 정산 관리">
        <FaithLogHeaderPillButton accessibilityLabel="내정보 화면으로 돌아가기" label="뒤로" onPress={route.name === 'home' ? onBack : () => setRoute({name: 'home'})} />
      </FaithLogHeaderTopRow>

      {entryState.status === 'loading' ? <MealLoading label="밥 담당 권한을 확인하는 중" /> : null}
      {entryState.status === 'error' ? <MealErrorState error={entryState.error} /> : null}
      {entryState.status === 'success'
        ? renderRoute(route, entryState.accessToken, state, setRoute, onSessionExpired)
        : null}
    </View>
  );
}

function renderRoute(
  route: MealRoute,
  accessToken: string,
  state: AuthenticatedState,
  setRoute: (route: MealRoute) => void,
  onSessionExpired: (message: string) => void,
) {
  const campusId = state.selectedCampus.campusId;
  switch (route.name) {
    case 'home':
      return <MealDutyHome onOpenAccount={() => setRoute({name: 'account'})} onOpenCreate={() => setRoute({name: 'create'})} onOpenPolls={() => setRoute({name: 'polls'})} onOpenSettlement={() => setRoute({name: 'settlement'})} />;
    case 'polls':
      return <MealPollListScreen accessToken={accessToken} campusId={campusId} onCreate={() => setRoute({name: 'create'})} onOpenDetail={(pollId) => setRoute({name: 'detail', pollId})} onSessionExpired={onSessionExpired} />;
    case 'create':
      return <MealPollCreateScreen accessToken={accessToken} campusId={campusId} onCancel={() => setRoute({name: 'home'})} onCreated={(poll) => setRoute({name: 'detail', pollId: poll.id})} onSessionExpired={onSessionExpired} />;
    case 'detail':
      return <MealPollDetailScreen accessToken={accessToken} campusId={campusId} onBack={() => setRoute({name: 'polls'})} onOpenCharge={(pollId) => setRoute({name: 'charge', pollId})} onSessionExpired={onSessionExpired} pollId={route.pollId} />;
    case 'charge':
      return <MealPollChargeScreen accessToken={accessToken} campusId={campusId} onBack={() => setRoute({name: 'detail', pollId: route.pollId})} onComplete={() => setRoute({name: 'detail', pollId: route.pollId})} onSessionExpired={onSessionExpired} pollId={route.pollId} />;
    case 'account':
      return <MealAccountScreen accessToken={accessToken} campusId={campusId} onBack={() => setRoute({name: 'home'})} onSessionExpired={onSessionExpired} />;
    case 'settlement':
      return <MealSettlementScreen accessToken={accessToken} campusId={campusId} onBack={() => setRoute({name: 'home'})} onSessionExpired={onSessionExpired} />;
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
        <Eyebrow>ACTIVE MEAL DUTY</Eyebrow>
        <Title>밥 정산 관리</Title>
        <Text style={mealStyles.body}>관리자 역할과 분리된 밥 담당자 전용 운영 공간입니다.</Text>
      </Card>
      <Card>
        <Title>투표</Title>
        <Text style={mealStyles.body}>MEAL 관리 목록, 생성, 수동 종료와 일괄 청구를 진행합니다.</Text>
        <View style={mealStyles.actionRow}>
          <Button accessibilityLabel="밥 투표 관리 목록 열기" onPress={onOpenPolls}>투표 목록</Button>
          <Button accessibilityLabel="새 밥 투표 만들기" onPress={onOpenCreate} variant="secondary">투표 생성</Button>
        </View>
      </Card>
      <Card>
        <Title>계좌와 정산</Title>
        <Text style={mealStyles.body}>본인 소유 MEAL 계좌와 그 계좌에 연결된 청구만 확인합니다.</Text>
        <View style={mealStyles.actionRow}>
          <Button accessibilityLabel="내 밥 계좌 관리 열기" onPress={onOpenAccount}>내 계좌</Button>
          <Button accessibilityLabel="내 밥 정산 내역 열기" onPress={onOpenSettlement} variant="secondary">내 정산</Button>
        </View>
      </Card>
    </View>
  );
}
