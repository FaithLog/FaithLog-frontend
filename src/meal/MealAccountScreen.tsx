import {useCallback, useEffect, useState} from 'react';
import {Text, View} from 'react-native';

import type {ApiError} from '../api/types';
import {Button, Card, Chip, Empty, Eyebrow, TextField, Title} from '../components/ui';
import {mealApi} from './mealApi';
import type {MealPaymentAccount} from './mealTypes';
import {
  MealErrorState,
  MealLoading,
  type MealLoadState,
  mealStyles,
  toMealApiError,
} from './mealScreenShared';

type MealAccountScreenProps = {
  accessToken: string;
  campusId: number;
  onBack: () => void;
  onSessionExpired: (message: string) => void;
};

export function MealAccountScreen({accessToken, campusId, onBack, onSessionExpired}: MealAccountScreenProps) {
  const [state, setState] = useState<MealLoadState<MealPaymentAccount[]>>({status: 'loading'});
  const [nickname, setNickname] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setState({status: 'loading'});
    try {
      const accounts = await mealApi.getMyPaymentAccounts(accessToken, campusId, true);
      setState(accounts.length === 0 ? {status: 'empty'} : {status: 'success', data: accounts});
    } catch (error) {
      setState({status: 'error', error: toMealApiError(error, '내 밥 계좌를 불러오지 못했습니다.', onSessionExpired)});
    }
  }, [accessToken, campusId, onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (saving) return;
    setSaving(true);
    setActionError(null);
    try {
      await mealApi.createPaymentAccount(accessToken, campusId, {
        nickname,
        bankName,
        accountNumber,
        accountHolder,
      });
      setNickname('');
      setBankName('');
      setAccountNumber('');
      setAccountHolder('');
      await load();
    } catch (error) {
      setActionError(toMealApiError(error, '내 밥 계좌를 등록하지 못했습니다.', onSessionExpired));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (accountId: number) => {
    if (saving) return;
    setSaving(true);
    setActionError(null);
    try {
      await mealApi.deactivatePaymentAccount(accessToken, campusId, accountId);
      await load();
    } catch (error) {
      setActionError(toMealApiError(error, '내 밥 계좌를 비활성화하지 못했습니다.', onSessionExpired));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={mealStyles.page}>
      <Card>
        <Eyebrow>내 계좌</Eyebrow>
        <Title>본인 MEAL 계좌만 관리</Title>
        <Text style={mealStyles.body}>서버가 로그인한 사용자 소유 계좌만 반환합니다. 다른 담당자의 계좌를 받아 화면에서 거르지 않습니다.</Text>
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
            <Button accessibilityLabel={`${account.nickname} 밥 계좌 비활성화`} disabled={saving} onPress={() => void deactivate(account.id)} variant="danger">비활성화</Button>
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
      <Button accessibilityLabel="밥 정산 관리 홈으로 돌아가기" onPress={onBack} variant="secondary">돌아가기</Button>
    </View>
  );
}
