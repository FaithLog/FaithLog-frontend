import {useRef, useState} from 'react';
import {Pressable, Text, View} from 'react-native';

import {Body, Eyebrow, TextField} from '../components/ui';
import {trackPollCreateComplete} from '../analytics/appAnalytics';
import {runWithCompletionEvent} from '../analytics/trackedApiSuccess';
import {DutyDateTimePickerModal, formatDutyDateTimeLabel} from '../duty/DutyDateTimePicker';
import {
  DutyDateTimeField,
  DutyPollCreateHeader,
  DutyPollCreateShell,
  DutyPollTypeCard,
  DutyToggleField,
} from '../duty/DutyPollCreate';
import {DutyActionButton, DutyActionRow, DutyFormSection} from '../duty/DutyPresentation';
import {pollCreateDesign as createStyles} from '../polls/pollCreateDesign';
import {mealApi, type MealApi} from './mealApi';
import {buildMealPollCreateRequest} from './mealModel';
import {beginMealMutation, createMealMutationGate, finishMealMutation} from './mealMutationFlow';
import {resolveMealRequestAccess, type MealRequestIdentity} from './mealRequestLifecycle';
import type {MealPollMutationResponse} from './mealTypes';
import {getCurrentMealRequestError, MealErrorState, MealLoading, toMealApiError} from './mealScreenShared';
import type {ApiError} from '../api/types';
import {getAuthSessionGeneration} from '../api/tokenStorage';
import {useMealRequestTracker} from './useMealRequestTracker';

type MealPollCreateScreenProps = {
  api?: MealApi;
  campusId: number;
  onCancel: () => void;
  onCreated: (poll: MealPollMutationResponse) => void;
  onSessionExpired: (message: string) => void;
};

type MealPollOptionDraft = {
  id: number;
  value: string;
};

export function MealPollCreateScreen({
  api = mealApi,
  campusId,
  onCancel,
  onCreated,
  onSessionExpired,
}: MealPollCreateScreenProps) {
  const {scopeIsCommitted, tracker} = useMealRequestTracker(`campus:${campusId}/meal-create`);
  const mutationGate = useRef(createMealMutationGate()).current;
  const nextOptionId = useRef(3);
  const initialDeadline = useRef(new Date(Date.now() + 86_400_000)).current;
  const [title, setTitle] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [deadline, setDeadline] = useState(initialDeadline);
  const [deadlinePickerVisible, setDeadlinePickerVisible] = useState(false);
  const [options, setOptions] = useState<MealPollOptionDraft[]>([
    {id: 1, value: ''},
    {id: 2, value: ''},
  ]);
  const [allowUserOptionAdd, setAllowUserOptionAdd] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (!scopeIsCommitted) return <MealLoading label="밥 투표 화면을 전환하는 중" />;

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
      const request = buildMealPollCreateRequest({
        title,
        isAnonymous,
        endsAt: deadline.toISOString(),
        options: options.map((option) => option.value),
        allowUserOptionAdd,
      });
      const access = await resolveMealRequestAccess(tracker, 'create', onSessionExpired);
      identity = access.status === 'ready' ? access.request.identity : access.identity;
      if (access.status === 'cancelled') return;
      if (access.status === 'error') {
        const apiError = getCurrentMealRequestError({error: access.error, fallback: '밥 투표를 만들지 못했습니다.', identity: access.identity, onSessionExpired, tracker});
        if (apiError) setError(apiError);
        return;
      }
      const created = await runWithCompletionEvent(
        () => api.createPoll(access.request.accessToken, campusId, request),
        () => trackPollCreateComplete('meal'),
      );
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
    setOptions((current) => current.map((option, optionIndex) =>
      optionIndex === index ? {...option, value} : option));
  };

  const removeOption = (index: number) => {
    setOptions((current) => current.length <= 2
      ? current
      : current.filter((_option, optionIndex) => optionIndex !== index));
  };

  const addOption = () => {
    const id = nextOptionId.current;
    nextOptionId.current += 1;
    setOptions((current) => [...current, {id, value: ''}]);
  };

  return (
    <DutyPollCreateShell>
      <DutyPollCreateHeader
        description="메뉴 후보와 마감 시간을 정해 밥 투표를 시작하세요."
        title="밥 투표 생성"
      />
      <DutyPollTypeCard
        description="투표를 만들면 바로 시작되고, 마감 후 선택지별 응답자를 정산할 수 있습니다."
        iconLabel="밥"
        title="밥 주문"
      />

      <DutyFormSection>
        <Eyebrow>투표 제목</Eyebrow>
        <TextField
          accessibilityLabel="밥 투표 제목"
          editable={!saving}
          label="제목"
          onChangeText={setTitle}
          placeholder="예: 이번 주 점심 메뉴"
          value={title}
        />
      </DutyFormSection>

      <DutyDateTimeField
        accessibilityLabel="밥 투표 마감 일시 선택"
        disabled={saving}
        label="마감 일시"
        onPress={() => setDeadlinePickerVisible(true)}
        value={formatDutyDateTimeLabel(deadline)}
      />
      <DutyDateTimePickerModal
        minimumDate={new Date()}
        onApply={(value) => {
          setDeadline(value);
          setDeadlinePickerVisible(false);
        }}
        onClose={() => setDeadlinePickerVisible(false)}
        value={deadline}
        visible={deadlinePickerVisible}
      />

      <DutyFormSection>
        <View style={createStyles.sectionHeader}>
          <View style={createStyles.headerText}>
            <Eyebrow>선택지</Eyebrow>
            <Body>응답자가 한 가지를 고를 메뉴 후보를 입력합니다.</Body>
          </View>
          <Pressable
            accessibilityLabel="밥 투표 선택지 추가"
            accessibilityRole="button"
            accessibilityState={{disabled: saving}}
            disabled={saving}
            hitSlop={4}
            onPress={addOption}
            style={({pressed}) => [
              createStyles.addOption,
              saving ? createStyles.disabled : null,
              pressed ? createStyles.pressed : null,
            ]}>
            <Text style={createStyles.addOptionText}>추가</Text>
          </Pressable>
        </View>
        <View style={createStyles.optionList}>
          {options.map((option, index) => (
            <View key={option.id} style={createStyles.optionRow}>
              <View style={createStyles.optionNumber}>
                <Text style={createStyles.optionNumberText}>{index + 1}</Text>
              </View>
              <View style={createStyles.optionField}>
                <TextField
                  accessibilityLabel={`밥 투표 선택지 ${index + 1}`}
                  editable={!saving}
                  label={`선택지 ${index + 1}`}
                  onChangeText={(value) => updateOption(index, value)}
                  value={option.value}
                />
              </View>
              <Pressable
                accessibilityLabel={`${index + 1}번 밥 투표 선택지 삭제`}
                accessibilityRole="button"
                accessibilityState={{disabled: saving || options.length <= 2}}
                disabled={saving || options.length <= 2}
                hitSlop={4}
                onPress={() => removeOption(index)}
                style={({pressed}) => [
                  createStyles.removeOption,
                  options.length <= 2 || saving ? createStyles.disabled : null,
                  pressed ? createStyles.pressed : null,
                ]}>
                <Text style={createStyles.removeOptionText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </DutyFormSection>

      <DutyFormSection>
        <Eyebrow>선택 방식</Eyebrow>
        <View
          accessibilityLabel="밥 투표 선택 방식 단일 선택 고정"
          accessibilityRole="text"
          style={createStyles.fixedSelection}>
          <Text style={createStyles.fixedSelectionTitle}>단일 선택</Text>
          <Text style={createStyles.fixedSelectionDescription}>
            밥 투표는 한 사람당 한 가지 메뉴만 선택할 수 있습니다.
          </Text>
          <View style={createStyles.fixedSelectionPill}>
            <Text style={createStyles.fixedSelectionPillText}>고정</Text>
          </View>
        </View>
      </DutyFormSection>

      <DutyToggleField
        accessibilityLabel="밥 투표 익명 여부 전환"
        checked={isAnonymous}
        description="응답자 이름을 결과 화면에서 숨깁니다."
        disabled={saving}
        onPress={() => setIsAnonymous((current) => !current)}
        title="익명 투표"
      />

      <DutyToggleField
        accessibilityLabel="사용자 선택지 추가 허용 전환"
        checked={allowUserOptionAdd}
        description="일반 사용자가 응답 중 필요한 메뉴 선택지를 직접 추가할 수 있습니다."
        disabled={saving}
        onPress={() => setAllowUserOptionAdd((current) => !current)}
        title="사용자 항목추가 가능"
      />

      {error ? <MealErrorState error={error} /> : null}

      <DutyActionRow>
        <DutyActionButton
          accessibilityLabel="밥 투표 생성 취소"
          disabled={saving}
          label="취소"
          onPress={onCancel}
          variant="secondary"
        />
        <DutyActionButton
          accessibilityLabel="밥 투표 생성 실행"
          busy={saving}
          label={saving ? '생성 중...' : '생성하기'}
          onPress={() => void save()}
          variant="primary"
        />
      </DutyActionRow>
    </DutyPollCreateShell>
  );
}
