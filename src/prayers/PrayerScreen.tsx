import {useEffect, useMemo, useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  FaithLogApiError,
} from '../api/client';
import {getApiErrorPresentation} from '../api/errorPolicy';
import {trackPrayerSubmitComplete} from '../analytics/appAnalytics';
import {runWithCompletionEvent} from '../analytics/trackedApiSuccess';
import {prayerApi} from '../api/prayerApi';
import type {
  ApiError,
  PrayerGroupSummary,
  PrayerWeekSummary,
} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {
  Body,
  Button,
  Card,
  Chip,
  Empty,
  ErrorState,
  FaithLogHeaderIconButton,
  FaithLogHeaderPillButton,
  FaithLogHeaderTopRow,
  Loading,
  Offline,
  PermissionDenied,
  Title,
} from '../components/ui';
import {colors, radius, spacing} from '../theme';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type Notice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

export type PrayerEntryMode = 'groups' | 'input';

type PrayerScreenProps = {
  canOpenAdminMode: boolean;
  entryMode: PrayerEntryMode;
  onOpenAdminMode: () => void;
  onOpenNotifications: () => void;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
  state: AuthenticatedState;
};

type BoardState =
  | {status: 'loading'}
  | {status: 'success'; board: PrayerWeekSummary}
  | {status: 'error'; error: ApiError};

type PrayerDraft = {
  baseContent: string;
  content: string;
  editable: boolean;
  groupId: number;
  groupName: string;
  name: string;
  submittedAt: string | null;
  userId: number;
  version: number;
};

type SaveState = 'idle' | 'saving' | 'refreshing';
type GroupPanelMode = 'view' | 'edit';

const PRAYER_CONTENT_MAX_LENGTH = 1000;

export function PrayerScreen({
  canOpenAdminMode,
  entryMode,
  onOpenAdminMode,
  onOpenNotifications,
  setAuthState,
  setNotice,
  state,
}: PrayerScreenProps) {
  const campusId = state.selectedCampus.campusId;
  const [weekStartDate, setWeekStartDate] = useState(() => getInitialPrayerWeekStartDate(new Date()));
  const [boardState, setBoardState] = useState<BoardState>({status: 'loading'});
  const [drafts, setDrafts] = useState<Record<number, PrayerDraft>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupDetailOpen, setGroupDetailOpen] = useState(false);
  const [groupPanelMode, setGroupPanelMode] = useState<GroupPanelMode>('view');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const activeBoard = boardState.status === 'success' ? boardState.board : null;
  const selectedGroup = useMemo(
    () => findSelectedGroup(activeBoard, selectedGroupId, state.user.id),
    [activeBoard, selectedGroupId, state.user.id],
  );
  const selectedDrafts = useMemo(
    () =>
      selectedGroup
        ? selectedGroup.members
            .map((member) => drafts[member.userId])
            .filter((draft): draft is PrayerDraft => Boolean(draft))
        : [],
    [drafts, selectedGroup],
  );
  const dirtyDrafts = selectedDrafts.filter((draft) => draft.editable && isDraftDirty(draft));
  const saving = saveState === 'saving';

  const loadBoard = async ({
    preserveDrafts = false,
    preserveSelection = false,
  }: {preserveDrafts?: boolean; preserveSelection?: boolean} = {}) => {
    setBoardState({status: 'loading'});
    setSaveState(preserveDrafts ? 'refreshing' : 'idle');

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const board = await prayerApi.getPrayerWeekBoard(accessToken, campusId, weekStartDate);
      const myGroup = findMyGroup(board, state.user.id);
      const nextGroupId = preserveSelection
        ? resolveGroupId(board, selectedGroupId, state.user.id)
        : resolveGroupIdForEntryMode(board, selectedGroupId, state.user.id, entryMode);
      const shouldOpenMyGroup = entryMode === 'input' && Boolean(myGroup);
      setBoardState({status: 'success', board});
      setDrafts((currentDrafts) =>
        buildDrafts(board, preserveDrafts ? currentDrafts : {}, state.user.id),
      );
      setSelectedGroupId(nextGroupId);
      setGroupDetailOpen((currentOpen) =>
        preserveDrafts || preserveSelection ? currentOpen : shouldOpenMyGroup,
      );
      setGroupPanelMode((currentMode) => (preserveDrafts ? currentMode : 'view'));
      setActionError(null);
    } catch (error) {
      const apiError = toApiError(error, '기도제목을 불러오지 못했습니다.');
      setBoardState({status: 'error', error: apiError});
      handleAuthError(apiError, setAuthState);
    } finally {
      setSaveState('idle');
    }
  };

  useEffect(() => {
    void loadBoard();
  }, [campusId, entryMode, weekStartDate]);

  const moveWeek = (direction: -1 | 1) => {
    if (saving) {
      return;
    }

    setActionError(null);
    setWeekStartDate((currentWeek) => addDays(currentWeek, direction * 7));
  };

  const updateDraft = (userId: number, content: string) => {
    setActionError(null);
    setDrafts((currentDrafts) => {
      const draft = currentDrafts[userId];

      if (!draft || !draft.editable) {
        return currentDrafts;
      }

      return {
        ...currentDrafts,
        [userId]: {
          ...draft,
          content: content.slice(0, PRAYER_CONTENT_MAX_LENGTH),
        },
      };
    });
  };

  const saveSelectedGroup = async () => {
    if (!activeBoard || !selectedGroup || saving) {
      return;
    }

    const dirtyEditableDrafts = dirtyDrafts.filter((draft) => draft.editable);

    if (dirtyEditableDrafts.length === 0) {
      setActionError({kind: 'error', message: '저장할 변경 사항이 없습니다.'});
      return;
    }

    setSaveState('saving');
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const savedBoard = await runWithCompletionEvent(
        () => prayerApi.saveSubmissions(accessToken, campusId, weekStartDate, {
          submissions: dirtyEditableDrafts.map((draft) => ({
            content: normalizePrayerContent(draft.content),
            userId: draft.userId,
            version: draft.version,
          })),
        }),
        trackPrayerSubmitComplete,
      );

      setBoardState({status: 'success', board: savedBoard});
      setDrafts(buildDrafts(savedBoard, {}, state.user.id));
      setSelectedGroupId(resolveGroupIdForEntryMode(savedBoard, selectedGroup.groupId, state.user.id, entryMode));
      setGroupPanelMode('view');
      setNotice({
        tone: 'success',
        title: '기도제목 저장 완료',
        message: `${dirtyEditableDrafts.length}명의 기도제목을 저장했습니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '기도제목을 저장하지 못했습니다.');
      setActionError(apiError);
      handleAuthError(apiError, setAuthState);
    } finally {
      setSaveState('idle');
    }
  };

  const cancelGroupEdit = () => {
    if (!selectedGroup) {
      setGroupPanelMode('view');
      return;
    }

    setActionError(null);
    setDrafts((currentDrafts) => {
      const nextDrafts = {...currentDrafts};

      selectedGroup.members.forEach((member) => {
        const draft = nextDrafts[member.userId];

        if (draft) {
          nextDrafts[member.userId] = {
            ...draft,
            content: draft.baseContent,
          };
        }
      });

      return nextDrafts;
    });
    setGroupPanelMode('view');
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      enabled={Platform.OS === 'ios'}
      keyboardVerticalOffset={16}
      style={styles.keyboardRoot}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <FaithLogHeaderTopRow
            campusLabel={state.selectedCampus.campusName}
            contextLabel={`${state.user.name}님`}>
            <FaithLogHeaderIconButton
              accessibilityLabel="알림 설정 화면으로 이동"
              badge
              iconName="bell"
              onPress={onOpenNotifications}
            />
            {canOpenAdminMode ? (
              <FaithLogHeaderPillButton
                accessibilityLabel="관리자 영역 선택"
                label="관리자"
                onPress={onOpenAdminMode}
                showChevron
              />
            ) : null}
          </FaithLogHeaderTopRow>
          <Text style={styles.heroTitle}>
            {entryMode === 'input' ? '기도제목 입력' : '조별 기도제목'}
          </Text>
        </View>
        {boardState.status === 'error' ? (
          <PrayerErrorState error={boardState.error} onRetry={() => loadBoard()} />
        ) : boardState.status !== 'success' ? (
          <Loading message="이번 주 기도제목을 불러오고 있어요." />
        ) : (
          <PrayerBoardContent
            actionError={actionError}
            board={boardState.board}
            currentUserId={state.user.id}
            dirtyCount={dirtyDrafts.length}
            drafts={selectedDrafts}
            entryMode={entryMode}
            groupDetailOpen={groupDetailOpen}
            groupPanelMode={groupPanelMode}
            onChangeDraft={updateDraft}
            onCancelGroupEdit={cancelGroupEdit}
            onCloseGroupDetail={() => {
              setActionError(null);
              setGroupDetailOpen(false);
              setGroupPanelMode('view');
            }}
            onKeepLocalAndReload={() => loadBoard({preserveDrafts: true})}
            onMoveWeek={moveWeek}
            onOpenGroupEdit={() => {
              setActionError(null);
              setGroupPanelMode('edit');
            }}
            onReloadLatest={() => loadBoard({preserveSelection: true})}
            onRetrySave={saveSelectedGroup}
            onSave={saveSelectedGroup}
            onSelectGroup={(groupId) => {
              setActionError(null);
              setSelectedGroupId(groupId);
              setGroupDetailOpen(true);
              setGroupPanelMode('view');
            }}
            saveState={saveState}
            selectedGroup={selectedGroup}
            weekWasAutoAdvanced={isSaturday(new Date()) && weekStartDate === getNextWeekStartDate(new Date())}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PrayerBoardContent({
  actionError,
  board,
  currentUserId,
  dirtyCount,
  drafts,
  entryMode,
  groupDetailOpen,
  groupPanelMode,
  onChangeDraft,
  onCancelGroupEdit,
  onCloseGroupDetail,
  onKeepLocalAndReload,
  onMoveWeek,
  onOpenGroupEdit,
  onReloadLatest,
  onRetrySave,
  onSave,
  onSelectGroup,
  saveState,
  selectedGroup,
  weekWasAutoAdvanced,
}: {
  actionError: ApiError | null;
  board: PrayerWeekSummary;
  currentUserId: number;
  dirtyCount: number;
  drafts: PrayerDraft[];
  entryMode: PrayerEntryMode;
  groupDetailOpen: boolean;
  groupPanelMode: GroupPanelMode;
  onChangeDraft: (userId: number, content: string) => void;
  onCancelGroupEdit: () => void;
  onCloseGroupDetail: () => void;
  onKeepLocalAndReload: () => void;
  onMoveWeek: (direction: -1 | 1) => void;
  onOpenGroupEdit: () => void;
  onReloadLatest: () => void;
  onRetrySave: () => void;
  onSave: () => void;
  onSelectGroup: (groupId: number) => void;
  saveState: SaveState;
  selectedGroup: PrayerGroupSummary | null;
  weekWasAutoAdvanced: boolean;
}) {
  const saving = saveState === 'saving';

  return (
    <>
      <PrayerBoardHero
        board={board}
        currentUserId={currentUserId}
        onMoveWeek={onMoveWeek}
        saving={saving}
        weekWasAutoAdvanced={weekWasAutoAdvanced}
      />

      {!getPrayerWeekCurrentSeason(board) ? (
        <Empty
          title="현재 운영 중인 기도제목 기간이 없어요"
          message="기도 운영 기간이 시작되면 조별 기도제목을 확인하고 작성할 수 있어요."
          actionLabel="다시 불러오기"
          actionAccessibilityLabel="기도제목 운영 기간 없음 후 다시 불러오기"
          onActionPress={onReloadLatest}
        />
      ) : board.targetMemberCount === 0 || board.groups.length === 0 ? (
        <Empty
          title="이번 주 활성 기도조가 없습니다"
          message={
            entryMode === 'input'
              ? '내 조가 만들어지고 배정되면 기도제목을 작성할 수 있어요.'
              : '기도 운영 기간이나 조 배정이 열리면 이 화면에서 조회할 수 있어요.'
          }
          actionLabel="다시 불러오기"
          actionAccessibilityLabel="빈 기도제목 게시판 다시 불러오기"
          onActionPress={onReloadLatest}
        />
      ) : (
        <>
          {groupDetailOpen && selectedGroup ? (
            <PrayerEntryPanel
              actionError={actionError}
              boardStatus={board.status}
              dirtyCount={dirtyCount}
              drafts={drafts}
              entryMode={entryMode}
              groupPanelMode={groupPanelMode}
              onBackToGroups={onCloseGroupDetail}
              onChangeDraft={onChangeDraft}
              onCancelEdit={onCancelGroupEdit}
              onKeepLocalAndReload={onKeepLocalAndReload}
              onOpenEdit={onOpenGroupEdit}
              onReloadLatest={onReloadLatest}
              onRetrySave={onRetrySave}
              onSave={onSave}
              saveState={saveState}
              selectedGroup={selectedGroup}
            />
          ) : (
            <>
              <GroupSelector
                currentUserId={currentUserId}
                groups={board.groups}
                entryMode={entryMode}
                selectedGroupId={null}
                onSelect={onSelectGroup}
              />
              {board.myGroupId ? null : (
                <Card>
                  <Title>아직 기도조에 배정되지 않았어요</Title>
                  <Body>
                    {entryMode === 'input'
                      ? '내 조가 배정되면 이 화면에서 기도제목을 작성할 수 있어요.'
                      : '모든 조의 기도제목은 볼 수 있지만, 작성과 수정은 내 조에 배정된 뒤 가능합니다.'}
                  </Body>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

function PrayerBoardHero({
  board,
  currentUserId,
  onMoveWeek,
  saving,
  weekWasAutoAdvanced,
}: {
  board: PrayerWeekSummary;
  currentUserId: number;
  onMoveWeek: (direction: -1 | 1) => void;
  saving: boolean;
  weekWasAutoAdvanced: boolean;
}) {
  const myGroup = findMyGroup(board, currentUserId);
  const totalSubmittedCount = countPrayerBoardSubmittedMembers(board.groups);
  const totalTargetCount = countPrayerBoardTargetMembers(board.groups);
  const myGroupSubmittedCount = myGroup ? countSubmittedMembers(myGroup) : 0;
  const myGroupTargetCount = myGroup?.members.length ?? 0;
  const hasCurrentSeason = Boolean(getPrayerWeekCurrentSeason(board));

  return (
    <View style={styles.hero}>
      {weekWasAutoAdvanced ? (
        <Card>
          <Chip label="토요일 작성" tone="info" />
          <Title>다음 주차 기도제목을 작성해요</Title>
          <Body>토요일에는 다음 월요일 주차로 자동 이동합니다. 저장 요청에는 월요일 주차만 사용해요.</Body>
        </Card>
      ) : null}
      <Card>
        <View style={styles.heroCardHeader}>
          <View style={styles.headerText}>
            <Text style={styles.sectionTitle}>이번 주 공동체 기도</Text>
            <Text style={styles.sectionDescription}>이번 주 기도제목을 조별로 확인해요</Text>
          </View>
          <Chip
            label={hasCurrentSeason ? getBoardStatusLabel(board.status) : '운영 전'}
            tone={hasCurrentSeason ? getBoardStatusTone(board.status) : 'default'}
          />
        </View>
        <View style={styles.weekControls}>
          <Button
            accessibilityLabel="이전 주 기도제목 보기"
            disabled={saving}
            onPress={() => onMoveWeek(-1)}
            variant="ghost">
            이전
          </Button>
          <View style={styles.weekLabel}>
            <Text style={styles.weekDate}>{formatWeekLabel(board.weekStartDate)}</Text>
            <Text style={styles.weekRange}>{board.weekStartDate} ~ {board.weekEndDate}</Text>
          </View>
          <Button
            accessibilityLabel="다음 주 기도제목 보기"
            disabled={saving}
            onPress={() => onMoveWeek(1)}
            variant="ghost">
            다음
          </Button>
        </View>
        {totalTargetCount > 0 ? (
          <View style={styles.progressGrid}>
            <ProgressStat label="전체 작성" value={totalSubmittedCount} total={totalTargetCount} />
            {myGroup ? (
              <ProgressStat label="우리 조 작성" value={myGroupSubmittedCount} total={myGroupTargetCount} />
            ) : null}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

function GroupSelector({
  currentUserId,
  entryMode,
  groups,
  onSelect,
  selectedGroupId,
}: {
  currentUserId: number;
  entryMode: PrayerEntryMode;
  groups: PrayerGroupSummary[];
  onSelect: (groupId: number) => void;
  selectedGroupId: number | null;
}) {
  const hasMyGroup = groups.some((group) =>
    group.members.some((member) => member.userId === currentUserId),
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>
        {entryMode === 'input' && hasMyGroup ? '내 조 먼저 보기' : '조별로 보기'}
      </Text>
      <View style={styles.groupGrid}>
        {groups
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((group) => {
            const selected = group.groupId === selectedGroupId;
            const mine = group.members.some((member) => member.userId === currentUserId);
            const submittedCount = countSubmittedMembers(group);
            const groupNumber = group.sortOrder > 0 ? group.sortOrder : group.groupId;

            return (
              <Pressable
                accessibilityLabel={`${group.groupName} 기도조 선택`}
                accessibilityRole="button"
                accessibilityState={{selected}}
                key={group.groupId}
                onPress={() => onSelect(group.groupId)}
                style={({pressed}) => [
                  styles.groupButton,
                  selected ? styles.groupButtonSelected : null,
                  pressed ? styles.pressed : null,
                ]}>
                <View style={[styles.groupMark, selected ? styles.groupMarkSelected : null]}>
                  <View style={[styles.groupMarkAccent, selected ? styles.groupMarkAccentSelected : null]} />
                  <Text style={[styles.groupMarkNumber, selected ? styles.groupMarkNumberSelected : null]}>
                    {String(groupNumber).padStart(2, '0')}
                  </Text>
                  <View style={styles.groupMarkDots}>
                    <View style={[styles.groupMarkDot, selected ? styles.groupMarkDotSelected : null]} />
                    <View style={[styles.groupMarkDot, selected ? styles.groupMarkDotSelected : null]} />
                    <View style={[styles.groupMarkDot, selected ? styles.groupMarkDotSelected : null]} />
                  </View>
                </View>
                <View style={styles.groupButtonBody}>
                  <Text style={[styles.groupButtonText, selected ? styles.groupButtonTextSelected : null]}>
                    {group.groupName}
                  </Text>
                  <Text style={styles.groupButtonMeta}>
                    {group.members.length}명 · {submittedCount}명 작성{mine ? ' · 내 조' : ''}
                  </Text>
                </View>
                <Text style={styles.groupChevron}>›</Text>
              </Pressable>
            );
          })}
      </View>
    </View>
  );
}

function PrayerEntryPanel({
  actionError,
  boardStatus,
  dirtyCount,
  drafts,
  entryMode,
  groupPanelMode,
  onBackToGroups,
  onChangeDraft,
  onCancelEdit,
  onKeepLocalAndReload,
  onOpenEdit,
  onReloadLatest,
  onRetrySave,
  onSave,
  saveState,
  selectedGroup,
}: {
  actionError: ApiError | null;
  boardStatus: string;
  dirtyCount: number;
  drafts: PrayerDraft[];
  entryMode: PrayerEntryMode;
  groupPanelMode: GroupPanelMode;
  onBackToGroups: () => void;
  onChangeDraft: (userId: number, content: string) => void;
  onCancelEdit: () => void;
  onKeepLocalAndReload: () => void;
  onOpenEdit: () => void;
  onReloadLatest: () => void;
  onRetrySave: () => void;
  onSave: () => void;
  saveState: SaveState;
  selectedGroup: PrayerGroupSummary;
}) {
  const {width} = useWindowDimensions();
  const saving = saveState === 'saving';
  const refreshing = saveState === 'refreshing';
  const canEditBoard = boardStatus === 'OPEN' && !saving && !refreshing;
  const compact = width < 360;
  const editableDraftCount = drafts.filter((draft) => draft.editable).length;
  const canEditGroup = canEditBoard && editableDraftCount > 0;
  const editing = groupPanelMode === 'edit' && canEditGroup;

  return (
    <>
      {actionError ? (
        <PrayerActionErrorCard
          error={actionError}
          onKeepLocalAndReload={onKeepLocalAndReload}
          onReloadLatest={onReloadLatest}
          onRetrySave={onRetrySave}
        />
      ) : null}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>{selectedGroup.groupName} 기도제목</Text>
          <Button
            accessibilityLabel="기도조 목록으로 돌아가기"
            disabled={saving}
            onPress={onBackToGroups}
            variant="ghost">
            목록
          </Button>
        </View>
        <Card>
          <View style={styles.heroCardHeader}>
            <View style={styles.headerText}>
              <Text style={styles.sectionTitle}>
                {editing ? `${selectedGroup.groupName} 수정` : `${selectedGroup.groupName} 모아보기`}
              </Text>
              <Text style={styles.sectionDescription}>
                {selectedGroup.members.length}명 중 {countSubmittedMembers(selectedGroup)}명 작성
              </Text>
            </View>
            {canEditGroup && !editing ? (
              <Button
                accessibilityLabel={`${selectedGroup.groupName} 기도제목 수정 화면 열기`}
                disabled={saving}
                onPress={onOpenEdit}
                variant="secondary">
                수정
              </Button>
            ) : null}
          </View>
          <Body>
            {editing
              ? '내 조 기도제목을 한 번에 수정하고 저장해요.'
              : boardStatus !== 'OPEN'
                ? '지금은 조회만 가능합니다.'
                : canEditGroup
                  ? '평소에는 보기 화면으로 보고, 수정 버튼을 눌러 내 조 기도제목을 작성해요.'
                  : entryMode === 'input'
                    ? '내 조가 배정되면 기도제목을 작성할 수 있어요.'
                    : '다른 조의 기도제목은 조회만 가능합니다.'}
          </Body>
        </Card>
      </View>
      {drafts.map((draft) => (
        <Card key={draft.userId}>
          <View style={styles.memberHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{draft.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.memberText}>
              <Text style={styles.memberName}>{draft.name}</Text>
              <Text style={styles.memberMeta}>
                {draft.submittedAt ? `${formatDateTime(draft.submittedAt)} 작성` : '아직 작성 전이에요'}
              </Text>
            </View>
            <Chip
              label={isDraftDirty(draft) ? '수정중' : draft.submittedAt ? '작성완료' : '미작성'}
              tone={isDraftDirty(draft) ? 'warning' : draft.submittedAt ? 'success' : 'default'}
            />
          </View>
          {editing && draft.editable ? (
            <>
              <TextInput
                accessibilityLabel={`${draft.name} 기도제목 입력`}
                editable={canEditBoard}
                multiline
                onChangeText={(value) => onChangeDraft(draft.userId, value)}
                placeholder="기도제목을 입력해 주세요"
                placeholderTextColor={colors.subtleText}
                style={[
                  styles.prayerInput,
                  compact ? styles.prayerInputCompact : null,
                  !canEditBoard ? styles.prayerInputDisabled : null,
                ]}
                value={draft.content}
              />
              <Text style={styles.inputCounter}>
                {draft.content.length}/{PRAYER_CONTENT_MAX_LENGTH}
              </Text>
            </>
          ) : (
            <Text style={styles.prayerReadonlyText}>
              {draft.content.trim().length > 0 ? draft.content : '아직 작성된 기도제목이 없습니다.'}
            </Text>
          )}
        </Card>
      ))}
      {editing ? (
        <Card>
          <View style={styles.saveSummaryRow}>
            <Chip label={`${dirtyCount}명 변경`} tone={dirtyCount > 0 ? 'warning' : 'default'} />
            <Chip label={getBoardStatusLabel(boardStatus)} tone={getBoardStatusTone(boardStatus)} />
          </View>
          <Button
            accessibilityLabel={`${selectedGroup.groupName} 변경된 기도제목 저장`}
            disabled={!canEditBoard || dirtyCount === 0 || saving}
            onPress={onSave}>
            {saving ? '저장 중...' : '변경 사항 저장'}
          </Button>
          <Button
            accessibilityLabel={`${selectedGroup.groupName} 기도제목 수정 취소`}
            disabled={saving}
            onPress={onCancelEdit}
            variant="secondary">
            취소
          </Button>
        </Card>
      ) : null}
    </>
  );
}

function PrayerActionErrorCard({
  error,
  onKeepLocalAndReload,
  onReloadLatest,
  onRetrySave,
}: {
  error: ApiError;
  onKeepLocalAndReload: () => void;
  onReloadLatest: () => void;
  onRetrySave: () => void;
}) {
  if (error.kind === 'conflict') {
    return (
      <PrayerStatusPanel
        actionAccessibilityLabel="기도제목 충돌 후 최신 내용 새로고침"
        actionLabel="새로고침"
        message="새로고침 후 최신 내용을 확인해 주세요"
        onActionPress={onReloadLatest}
        onSecondaryActionPress={onKeepLocalAndReload}
        secondaryActionAccessibilityLabel="기도제목 충돌 후 내 입력 보기"
        secondaryActionLabel="내 입력 보기"
        title="먼저 수정된 내용이 있어요"
      />
    );
  }

  return (
    <PrayerStatusPanel
      actionAccessibilityLabel="기도제목 저장 실패 후 다시 시도"
      actionLabel="다시 시도"
      message={getSafePrayerActionMessage(error)}
      onActionPress={onRetrySave}
      title={getActionErrorTitle(error.kind)}
    />
  );
}

function PrayerErrorState({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  const presentation = getApiErrorPresentation(error, {
    conflictTitle: '최신 기도제목 상태가 필요합니다',
    conflictMessage: '다른 사용자가 먼저 수정한 기도제목이 있을 수 있습니다. 다시 불러온 뒤 저장해 주세요.',
    permissionTitle: '기도제목 접근 권한이 없습니다',
    permissionMessage: '기도제목을 보거나 저장할 권한이 없습니다.',
    defaultTitle: '기도제목을 불러오지 못했습니다',
  });

  switch (error.kind) {
    case 'sessionExpired':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="세션 만료 후 기도제목 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'permissionDenied':
      return (
        <PermissionDenied
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="권한 오류 후 기도제목 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <PrayerStatusPanel
          title="먼저 수정된 내용이 있어요"
          message="새로고침 후 최신 내용을 확인해 주세요"
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="충돌 후 기도제목 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="오프라인 후 기도제목 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="기도제목 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    default:
      return assertNever(error.kind);
  }
}

function PrayerStatusPanel({
  actionAccessibilityLabel,
  actionLabel,
  message,
  onActionPress,
  onSecondaryActionPress,
  secondaryActionAccessibilityLabel,
  secondaryActionLabel,
  title,
}: {
  actionAccessibilityLabel: string;
  actionLabel: string;
  message: string;
  onActionPress: () => void;
  onSecondaryActionPress?: () => void;
  secondaryActionAccessibilityLabel?: string;
  secondaryActionLabel?: string;
  title: string;
}) {
  return (
    <View accessibilityRole="alert" style={styles.statusPanel}>
      <View style={styles.statusBrandRow}>
        <Text style={styles.statusBrand}>FaithLog</Text>
        <Chip label="기도제목" tone="default" />
      </View>
      <View style={styles.statusIconWrap}>
        <Text style={styles.statusIcon}>!</Text>
      </View>
      <Text style={styles.statusTitle}>{title}</Text>
      <Text style={styles.statusMessage}>{message}</Text>
      <View style={styles.statusActions}>
        <Button
          accessibilityLabel={actionAccessibilityLabel}
          onPress={onActionPress}>
          {actionLabel}
        </Button>
        {secondaryActionLabel && onSecondaryActionPress ? (
          <Button
            accessibilityLabel={secondaryActionAccessibilityLabel ?? secondaryActionLabel}
            onPress={onSecondaryActionPress}
            variant="secondary">
            {secondaryActionLabel}
          </Button>
        ) : null}
      </View>
    </View>
  );
}

function ProgressStat({label, total, value}: {label: string; total: number; value: number}) {
  const percent = total > 0 ? Math.min(Math.max(value / total, 0), 1) : 0;

  return (
    <View style={styles.progressStat}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>{value}/{total}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, {width: `${percent * 100}%`}]} />
      </View>
    </View>
  );
}

function buildDrafts(
  board: PrayerWeekSummary,
  currentDrafts: Record<number, PrayerDraft>,
  currentUserId: number,
): Record<number, PrayerDraft> {
  const myGroup = findMyGroup(board, currentUserId);

  return board.groups.reduce<Record<number, PrayerDraft>>((nextDrafts, group) => {
    const isMyGroup = myGroup?.groupId === group.groupId;

    group.members.forEach((member) => {
      const serverContent = member.content ?? '';
      const currentDraft = currentDrafts[member.userId];
      const shouldKeepLocal =
        currentDraft !== undefined && currentDraft.content !== currentDraft.baseContent;

      nextDrafts[member.userId] = {
        baseContent: serverContent,
        content: shouldKeepLocal ? currentDraft.content : serverContent,
        editable: isMyGroup,
        groupId: group.groupId,
        groupName: group.groupName,
        name: member.name,
        submittedAt: member.submittedAt,
        userId: member.userId,
        version: member.version,
      };
    });

    return nextDrafts;
  }, {});
}

function findSelectedGroup(
  board: PrayerWeekSummary | null,
  selectedGroupId: number | null,
  currentUserId: number,
) {
  if (!board || board.groups.length === 0) {
    return null;
  }

  return (
    board.groups.find((group) => group.groupId === selectedGroupId) ??
    board.groups.find((group) => group.members.some((member) => member.userId === currentUserId)) ??
    board.groups.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0] ??
    null
  );
}

function resolveGroupId(
  board: PrayerWeekSummary,
  currentGroupId: number | null,
  currentUserId: number,
) {
  return findSelectedGroup(board, currentGroupId, currentUserId)?.groupId ?? null;
}

function resolveGroupIdForEntryMode(
  board: PrayerWeekSummary,
  currentGroupId: number | null,
  currentUserId: number,
  entryMode: PrayerEntryMode,
) {
  if (entryMode === 'input') {
    const myGroup = findMyGroup(board, currentUserId);

    if (myGroup) {
      return myGroup.groupId;
    }
  }

  return resolveGroupId(board, currentGroupId, currentUserId);
}

function findMyGroup(board: PrayerWeekSummary, currentUserId: number) {
  return (
    board.groups.find((group) => group.groupId === board.myGroupId) ??
    board.groups.find((group) => group.members.some((member) => member.userId === currentUserId)) ??
    null
  );
}

function getPrayerWeekCurrentSeason(board: PrayerWeekSummary) {
  return board.currentSeason ?? board.activeSeason ?? board.season ?? null;
}

function isDraftDirty(draft: PrayerDraft) {
  return draft.content !== draft.baseContent;
}

function normalizePrayerContent(content: string) {
  const normalized = content.trim();

  return normalized.length > 0 ? normalized : null;
}

async function resolveAccessToken(setAuthState: (state: AuthGateState) => void) {
  return resolveCurrentAccessToken(() => {
    setAuthState({status: 'sessionExpired', message: '저장된 access token이 없습니다.'});
  });
}

function handleAuthError(error: ApiError, setAuthState: (state: AuthGateState) => void) {
  if (error.kind === 'sessionExpired') {
    setAuthState({status: 'sessionExpired', message: error.message});
  }
}

function toApiError(error: unknown, fallback: string): ApiError {
  if (error instanceof FaithLogApiError) {
    return error.detail;
  }

  return {kind: 'error', message: fallback};
}

function getActionErrorTitle(kind: ApiError['kind']) {
  switch (kind) {
    case 'sessionExpired':
      return '세션이 만료되었습니다';
    case 'permissionDenied':
      return '저장 권한이 없습니다';
    case 'conflict':
      return '최신 상태와 충돌했습니다';
    case 'offline':
      return '네트워크 연결이 필요합니다';
    case 'error':
      return '요청을 처리하지 못했습니다';
    default:
      return assertNever(kind);
  }
}

function getBoardStatusLabel(status: string) {
  switch (status) {
    case 'OPEN':
      return '입력 가능';
    case 'CLOSED':
      return '마감';
    default:
      return status;
  }
}

function getBoardStatusTone(status: string) {
  if (status === 'OPEN') {
    return 'success';
  }

  if (status === 'CLOSED') {
    return 'warning';
  }

  return 'default';
}

function getInitialPrayerWeekStartDate(date: Date) {
  return isSaturday(date) ? getNextWeekStartDate(date) : getWeekStartDate(date);
}

function getNextWeekStartDate(date: Date) {
  return addDays(getWeekStartDate(date), 7);
}

function isSaturday(date: Date) {
  return date.getDay() === 6;
}

function getWeekStartDate(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);

  return formatLocalDate(start);
}

function formatWeekLabel(weekStartDate: string) {
  const date = new Date(`${weekStartDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return weekStartDate;
  }

  const month = date.getMonth() + 1;
  const weekOfMonth = Math.floor((date.getDate() - 1) / 7) + 1;

  return `${month}월 ${weekOfMonth}주차`;
}

function countSubmittedMembers(group: PrayerGroupSummary) {
  return group.members.filter((member) => member.submittedAt || member.content?.trim()).length;
}

function countPrayerBoardTargetMembers(groups: PrayerGroupSummary[]) {
  const memberIds = new Set<number>();

  groups.forEach((group) => {
    group.members.forEach((member) => {
      memberIds.add(member.userId);
    });
  });

  return memberIds.size;
}

function countPrayerBoardSubmittedMembers(groups: PrayerGroupSummary[]) {
  const memberIds = new Set<number>();

  groups.forEach((group) => {
    group.members.forEach((member) => {
      if (member.submittedAt || member.content?.trim()) {
        memberIds.add(member.userId);
      }
    });
  });

  return memberIds.size;
}

function getSafePrayerActionMessage(error: ApiError) {
  if (error.kind === 'offline') {
    return '네트워크 상태를 확인하고 다시 시도해주세요';
  }

  if (error.kind === 'permissionDenied') {
    return '기도제목을 저장할 권한을 확인해주세요';
  }

  if (error.kind === 'sessionExpired') {
    return '다시 로그인한 뒤 저장해주세요';
  }

  return '네트워크 상태를 확인하고 다시 시도해주세요';
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);

  return formatLocalDate(date);
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ko-KR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  avatarText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  campusChip: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    flexShrink: 1,
    height: 28,
    justifyContent: 'center',
    maxWidth: 158,
    minWidth: 0,
    paddingHorizontal: 10,
  },
  campusChipText: {
    color: colors.faith,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    maxWidth: 138,
  },
  groupButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.item,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 74,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  groupMark: {
    alignItems: 'center',
    backgroundColor: colors.neutralSoft,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingBottom: 7,
    width: 42,
  },
  groupMarkAccent: {
    alignSelf: 'stretch',
    backgroundColor: colors.mint,
    height: 5,
  },
  groupMarkAccentSelected: {
    backgroundColor: colors.primary,
  },
  groupMarkDot: {
    backgroundColor: colors.mint,
    borderRadius: 3,
    height: 5,
    width: 5,
  },
  groupMarkDots: {
    flexDirection: 'row',
    gap: 4,
  },
  groupMarkDotSelected: {
    backgroundColor: colors.primary,
  },
  groupMarkNumber: {
    color: colors.faith,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 3,
  },
  groupMarkNumberSelected: {
    color: colors.primary,
  },
  groupMarkSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  groupButtonBody: {
    flex: 1,
    minWidth: 0,
  },
  groupButtonMeta: {
    color: colors.mutedText,
    fontSize: 15,
    marginTop: 4,
  },
  groupButtonSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  groupButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  groupButtonTextSelected: {
    color: colors.primary,
  },
  groupChevron: {
    color: colors.subtleText,
    fontSize: 16,
    fontWeight: '600',
  },
  groupGrid: {
    gap: spacing.gap,
  },
  hero: {
    gap: spacing.gap,
  },
  heroCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  heroSubtitle: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 20,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 34,
  },
  keyboardRoot: {
    flex: 1,
  },
  notificationBadge: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  notificationIcon: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  progressFill: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: '100%',
  },
  progressGrid: {
    gap: spacing.gap,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '600',
  },
  progressStat: {
    gap: 8,
  },
  progressTrack: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.pill,
    height: 6,
    overflow: 'hidden',
  },
  progressValue: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  saveSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scrollContent: {
    gap: spacing.gap,
    paddingBottom: spacing.bottomSafe + 112,
  },
  section: {
    gap: spacing.gap,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  sectionDescription: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    lineHeight: 20,
  },
  sectionHeading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
  },
  sectionTitle: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  headerText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  inputCounter: {
    alignSelf: 'flex-end',
    color: colors.subtleText,
    fontSize: 15,
    marginTop: 8,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.gap,
  },
  memberHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.gap,
  },
  memberMeta: {
    color: colors.mutedText,
    fontSize: 15,
    marginTop: 2,
  },
  memberName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  memberText: {
    flex: 1,
    minWidth: 0,
  },
  prayerInput: {
    backgroundColor: colors.neutralSoft,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.gap,
    minHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  prayerInputCompact: {
    minHeight: 92,
  },
  prayerInputDisabled: {
    opacity: 0.65,
  },
  prayerReadonlyText: {
    backgroundColor: colors.neutralSoft,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.gap,
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.72,
  },
  statusActions: {
    gap: spacing.gap,
    marginTop: 24,
    minWidth: 160,
  },
  statusBrand: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  statusBrandRow: {
    alignSelf: 'stretch',
    gap: 10,
  },
  statusIcon: {
    color: colors.danger,
    fontSize: 24,
    fontWeight: '700',
  },
  statusIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    marginTop: 72,
    width: 56,
  },
  statusMessage: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
  },
  statusPanel: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.card,
    minHeight: 520,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 30,
    marginTop: 42,
    textAlign: 'center',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 36,
    width: '100%',
  },
  weekControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  weekDate: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  weekLabel: {
    alignItems: 'center',
    flex: 1,
  },
  weekRange: {
    color: colors.mutedText,
    fontSize: 15,
    marginTop: 2,
    textAlign: 'center',
  },
});
