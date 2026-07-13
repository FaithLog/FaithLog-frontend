import {useState} from 'react';
import {Text, View} from 'react-native';

import {Button, Card, Eyebrow, TextField, Title} from '../components/ui';
import {mealApi} from './mealApi';
import {buildMealPollCreateRequest} from './mealModel';
import type {MealPollDetail} from './mealTypes';
import {MealErrorState, mealStyles, toMealApiError} from './mealScreenShared';
import type {ApiError} from '../api/types';

type MealPollCreateScreenProps = {
  accessToken: string;
  campusId: number;
  onCancel: () => void;
  onCreated: (poll: MealPollDetail) => void;
  onSessionExpired: (message: string) => void;
};

export function MealPollCreateScreen({
  accessToken,
  campusId,
  onCancel,
  onCreated,
  onSessionExpired,
}: MealPollCreateScreenProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [endsAt, setEndsAt] = useState(() => new Date(Date.now() + 86_400_000).toISOString());
  const [options, setOptions] = useState(['', '']);
  const [allowUserOptionAdd, setAllowUserOptionAdd] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const request = buildMealPollCreateRequest({title, description, endsAt, options, allowUserOptionAdd});
      const created = await mealApi.createPoll(accessToken, campusId, request);
      onCreated(created);
    } catch (caught) {
      setError(toMealApiError(caught, '밥 투표를 만들지 못했습니다.', onSessionExpired));
    } finally {
      setSaving(false);
    }
  };

  const updateOption = (index: number, value: string) => {
    setOptions((current) => current.map((option, optionIndex) => optionIndex === index ? value : option));
  };

  return (
    <View style={mealStyles.page}>
      <Card>
        <Eyebrow>밥 투표 생성</Eyebrow>
        <Title>생성 즉시 시작되는 SINGLE 투표</Title>
        <Text style={mealStyles.body}>시작 시각은 서버가 만들며, 계좌와 금액은 투표 종료 후 청구 단계에서만 선택합니다.</Text>
      </Card>
      <Card>
        <TextField accessibilityLabel="밥 투표 제목" label="제목" onChangeText={setTitle} value={title} />
        <TextField accessibilityLabel="밥 투표 설명" label="설명" onChangeText={setDescription} value={description} />
        <TextField accessibilityLabel="밥 투표 마감 시각" autoCapitalize="none" label="마감 시각 (ISO)" onChangeText={setEndsAt} value={endsAt} />
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
