import {useRef, useState} from 'react';
import {Text, View} from 'react-native';

import {Button, Card, Eyebrow, TextField, Title} from '../components/ui';
import {mealApi, type MealApi} from './mealApi';
import {buildMealPollCreateRequest, formatMealLocalDeadline, parseMealLocalDeadline} from './mealModel';
import {beginMealMutation, createMealMutationGate, finishMealMutation} from './mealMutationFlow';
import {resolveMealRequestAccess, type MealRequestIdentity} from './mealRequestLifecycle';
import type {MealPollDetail} from './mealTypes';
import {getCurrentMealRequestError, MealErrorState, mealStyles, toMealApiError} from './mealScreenShared';
import type {ApiError} from '../api/types';
import {getAuthSessionGeneration} from '../api/tokenStorage';
import {useMealRequestTracker} from './useMealRequestTracker';

type MealPollCreateScreenProps = {
  api?: MealApi;
  campusId: number;
  onCancel: () => void;
  onCreated: (poll: MealPollDetail) => void;
  onSessionExpired: (message: string) => void;
};

export function MealPollCreateScreen({
  api = mealApi,
  campusId,
  onCancel,
  onCreated,
  onSessionExpired,
}: MealPollCreateScreenProps) {
  const tracker = useMealRequestTracker(`campus:${campusId}/meal-create`);
  const mutationGate = useRef(createMealMutationGate()).current;
  const initialDeadline = useRef(formatMealLocalDeadline(new Date(Date.now() + 86_400_000))).current;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [endsDate, setEndsDate] = useState(initialDeadline.date);
  const [endsTime, setEndsTime] = useState(initialDeadline.time);
  const [options, setOptions] = useState(['', '']);
  const [allowUserOptionAdd, setAllowUserOptionAdd] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const save = async () => {
    const operationId = beginMealMutation(
      mutationGate,
      `${campusId}:${getAuthSessionGeneration()}:create`,
    );
    if (operationId === null) return;
    setSaving(true);
    setError(null);
    let identity: MealRequestIdentity | null = null;
    try {
      const endsAt = parseMealLocalDeadline({date: endsDate, time: endsTime});
      const request = buildMealPollCreateRequest({title, description, endsAt, options, allowUserOptionAdd});
      const access = await resolveMealRequestAccess(tracker, 'create', onSessionExpired);
      identity = access.status === 'ready' ? access.request.identity : access.identity;
      if (access.status === 'cancelled') return;
      if (access.status === 'error') {
        const apiError = getCurrentMealRequestError({error: access.error, fallback: '밥 투표를 만들지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
        if (apiError) setError(apiError);
        return;
      }
      const created = await api.createPoll(access.request.accessToken, campusId, request);
      if (!tracker.isSuccessCurrent(identity)) return;
      onCreated(created);
    } catch (caught) {
      if (identity) {
        const apiError = getCurrentMealRequestError({error: caught, fallback: '밥 투표를 만들지 못했습니다.', identity, onSessionExpired, tracker});
        if (apiError) setError(apiError);
      } else {
        setError(toMealApiError(caught, '입력한 내용을 확인해 주세요.'));
      }
    } finally {
      finishMealMutation(mutationGate, operationId);
      if (identity === null || tracker.isSuccessCurrent(identity)) setSaving(false);
    }
  };

  const updateOption = (index: number, value: string) => {
    setOptions((current) => current.map((option, optionIndex) => optionIndex === index ? value : option));
  };

  return (
    <View style={mealStyles.page}>
      <Card>
        <Eyebrow>밥 투표 생성</Eyebrow>
        <Title>새 밥 투표</Title>
        <Text style={mealStyles.body}>투표를 만들면 바로 시작돼요. 마감 후 정산할 수 있습니다.</Text>
      </Card>
      <Card>
        <TextField accessibilityLabel="밥 투표 제목" label="제목" onChangeText={setTitle} value={title} />
        <TextField accessibilityLabel="밥 투표 설명" label="설명" onChangeText={setDescription} value={description} />
        <TextField accessibilityLabel="밥 투표 마감 날짜" autoCapitalize="none" label="마감 날짜 (예: 2026년 7월 14일)" onChangeText={setEndsDate} value={endsDate} />
        <TextField accessibilityLabel="밥 투표 마감 시간" autoCapitalize="none" label="마감 시간 (24시간, 예: 18:00)" onChangeText={setEndsTime} value={endsTime} />
        <View style={mealStyles.fieldGroup}>
          {options.map((option, index) => (
            <TextField
              accessibilityLabel={`밥 투표 선택지 ${index + 1}`}
              key={index}
              label={`선택지 ${index + 1}`}
              onChangeText={(value) => updateOption(index, value)}
              value={option}
            />
          ))}
        </View>
        <Button accessibilityLabel="밥 투표 선택지 추가" onPress={() => setOptions((current) => [...current, ''])} variant="secondary">선택지 추가</Button>
        <Button accessibilityLabel="사용자 선택지 추가 허용 전환" onPress={() => setAllowUserOptionAdd((current) => !current)} variant="secondary">
          사용자 선택지 추가 {allowUserOptionAdd ? '허용' : '허용 안 함'}
        </Button>
      </Card>
      {error ? <MealErrorState error={error} /> : null}
      <View style={mealStyles.actionRow}>
        <Button accessibilityLabel="밥 투표 생성 취소" disabled={saving} onPress={onCancel} variant="secondary">취소</Button>
        <Button accessibilityLabel="밥 투표 생성 실행" disabled={saving} onPress={() => void save()}>{saving ? '생성 중...' : '투표 만들기'}</Button>
      </View>
    </View>
  );
}
