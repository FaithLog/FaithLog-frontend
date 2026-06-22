import {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';

import {
  FaithLogApiError,
  fetchPrayerWeek,
  savePrayerSubmissions,
} from '../api/client';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {
  ApiError,
  PrayerGroupSummary,
  PrayerWeekSummary,
} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {
  Body,
  Button,
  Card,
  Chip,
  Conflict,
  Empty,
  ErrorState,
  Eyebrow,
  ListRow,
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

type PrayerScreenProps = {
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
  groupId: number;
  groupName: string;
  name: string;
  submittedAt: string | null;
  userId: number;
  version: number;
};

type SaveState = 'idle' | 'saving' | 'refreshing';

const PRAYER_CONTENT_MAX_LENGTH = 1000;

export function PrayerScreen({setAuthState, setNotice, state}: PrayerScreenProps) {
  const campusId = state.selectedCampus.campusId;
  const [weekStartDate, setWeekStartDate] = useState(() => getWeekStartDate(new Date()));
  const [boardState, setBoardState] = useState<BoardState>({status: 'loading'});
  const [drafts, setDrafts] = useState<Record<number, PrayerDraft>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
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
  const dirtyDrafts = selectedDrafts.filter((draft) => isDraftDirty(draft));
  const saving = saveState === 'saving';

  const loadBoard = async ({preserveDrafts = false}: {preserveDrafts?: boolean} = {}) => {
    setBoardState({status: 'loading'});
    setSaveState(preserveDrafts ? 'refreshing' : 'idle');

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const board = await fetchPrayerWeek(accessToken, campusId, weekStartDate);
      setBoardState({status: 'success', board});
      setDrafts((currentDrafts) => buildDrafts(board, preserveDrafts ? currentDrafts : {}));
      setSelectedGroupId((currentGroupId) =>
        resolveGroupId(board, currentGroupId, state.user.id),
      );
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
  }, [campusId, weekStartDate]);

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

      if (!draft) {
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

    if (dirtyDrafts.length === 0) {
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

      const savedBoard = await savePrayerSubmissions(accessToken, campusId, weekStartDate, {
        submissions: selectedDrafts.map((draft) => ({
          userId: draft.userId,
          content: normalizePrayerContent(draft.content),
          version: draft.version,
        })),
      });

      setBoardState({status: 'success', board: savedBoard});
      setDrafts(buildDrafts(savedBoard, {}));
      setSelectedGroupId(resolveGroupId(savedBoard, selectedGroup.groupId, state.user.id));
      setNotice({
        tone: 'success',
        title: '기도제목 저장 완료',
        message: `${selectedGroup.groupName} ${dirtyDrafts.length}명 기도제목을 최신 version으로 갱신했습니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '기도제목을 저장하지 못했습니다.');
      setActionError(apiError);
      handleAuthError(apiError, setAuthState);
    } finally {
      setSaveState('idle');
    }
  };

  if (boardState.status === 'error') {
    return <PrayerErrorState error={boardState.error} onRetry={() => loadBoard()} />;
  }

  if (boardState.status !== 'success') {
    return <Loading message="이번 주 기도제목을 불러오고 있어요." />;
  }

  const board = boardState.board;

  return (
    <>
      <Card>
        <Eyebrow>User 11 Prayer Board</Eyebrow>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Title>조별 기도제목</Title>
            <Body>{state.selectedCampus.campusName} 캠퍼스의 주간 기도제목입니다.</Body>
          </View>
          <Chip label={getBoardStatusLabel(board.status)} tone={getBoardStatusTone(board.status)} />
        </View>
        <View style={styles.weekControls}>
          <Button
            accessibilityLabel="이전 주 기도제목 보기"
            disabled={saving}
            onPress={() => moveWeek(-1)}
            variant="secondary">
            이전 주
          </Button>
          <View style={styles.weekLabel}>
            <Text style={styles.weekDate}>{board.weekStartDate}</Text>
            <Text style={styles.weekRange}>~ {board.weekEndDate}</Text>
          </View>
          <Button
            accessibilityLabel="다음 주 기도제목 보기"
            disabled={saving}
            onPress={() => moveWeek(1)}
            variant="secondary">
            다음 주
          </Button>
        </View>
        <View style={styles.metaGrid}>
          <ListRow
            label="작성 현황"
            supportingText="GET /api/v1/campuses/{campusId}/prayers/weeks/{weekStartDate}"
            value={`${board.submittedCount}/${board.targetMemberCount}`}
          />
          <ListRow label="기도조" supportingText="활성 조 기준" value={`${board.groups.length}개`} />
        </View>
      </Card>

      {board.targetMemberCount === 0 || board.groups.length === 0 ? (
        <Empty
          title="이번 주 활성 기도조가 없습니다"
          message="기도 시즌이나 조 배정이 열리면 이 화면에서 조회하고 입력할 수 있어요."
          actionLabel="다시 불러오기"
          actionAccessibilityLabel="빈 기도제목 게시판 다시 불러오기"
          onActionPress={() => loadBoard()}
        />
      ) : (
        <>
          <GroupSelector
            currentUserId={state.user.id}
            groups={board.groups}
            selectedGroupId={selectedGroup?.groupId ?? null}
            onSelect={(groupId) => {
              setActionError(null);
              setSelectedGroupId(groupId);
            }}
          />
          {selectedGroup ? (
            <PrayerEntryPanel
              actionError={actionError}
              boardStatus={board.status}
              dirtyCount={dirtyDrafts.length}
              drafts={selectedDrafts}
              onChangeDraft={updateDraft}
              onKeepLocalAndReload={() => loadBoard({preserveDrafts: true})}
              onReloadLatest={() => loadBoard()}
              onSave={saveSelectedGroup}
              saveState={saveState}
              selectedGroup={selectedGroup}
            />
          ) : (
            <ErrorState
              title="기도조를 선택할 수 없습니다"
              message="선택 가능한 조 정보를 다시 불러와 주세요."
              actionLabel="다시 불러오기"
              actionAccessibilityLabel="기도조 선택 오류 후 다시 불러오기"
              onActionPress={() => loadBoard()}
            />
          )}
        </>
      )}
    </>
  );
}

function GroupSelector({
  currentUserId,
  groups,
  onSelect,
  selectedGroupId,
}: {
  currentUserId: number;
  groups: PrayerGroupSummary[];
  onSelect: (groupId: number) => void;
  selectedGroupId: number | null;
}) {
  return (
    <Card>
      <Eyebrow>User 11-1 Prayer Group Detail</Eyebrow>
      <Title>기도조 선택</Title>
      <View style={styles.groupGrid}>
        {groups
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((group) => {
            const selected = group.groupId === selectedGroupId;
            const mine = group.members.some((member) => member.userId === currentUserId);

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
                <Text style={[styles.groupButtonText, selected ? styles.groupButtonTextSelected : null]}>
                  {group.groupName}
                </Text>
                <Text style={styles.groupButtonMeta}>
                  {group.members.length}명{mine ? ' · 내 조' : ''}
                </Text>
              </Pressable>
            );
          })}
      </View>
    </Card>
  );
}

function PrayerEntryPanel({
  actionError,
  boardStatus,
  dirtyCount,
  drafts,
  onChangeDraft,
  onKeepLocalAndReload,
  onReloadLatest,
  onSave,
  saveState,
  selectedGroup,
}: {
  actionError: ApiError | null;
  boardStatus: string;
  dirtyCount: number;
  drafts: PrayerDraft[];
  onChangeDraft: (userId: number, content: string) => void;
  onKeepLocalAndReload: () => void;
  onReloadLatest: () => void;
  onSave: () => void;
  saveState: SaveState;
  selectedGroup: PrayerGroupSummary;
}) {
  const saving = saveState === 'saving';
  const refreshing = saveState === 'refreshing';
  const editable = boardStatus === 'OPEN' && !saving && !refreshing;

  return (
    <>
      {actionError ? (
        <PrayerActionErrorCard
          error={actionError}
          onKeepLocalAndReload={onKeepLocalAndReload}
          onReloadLatest={onReloadLatest}
        />
      ) : null}
      <Card>
        <Eyebrow>User 12 Prayer Entry</Eyebrow>
        <Title>{selectedGroup.groupName} 기도제목 입력</Title>
        <Body>
          {boardStatus === 'OPEN'
          ? '사람별 내용과 조회 당시 version으로 저장합니다. 한 명이라도 version 충돌이 있으면 전체 저장이 rollback됩니다.'
          : 'OPEN 상태가 아니라 저장은 제한되고 조회만 가능합니다.'}
        </Body>
        <View style={styles.chipRow}>
          <Chip label={`${dirtyCount}명 변경`} tone={dirtyCount > 0 ? 'warning' : 'default'} />
          <Chip label={`상태 ${boardStatus}`} tone={getBoardStatusTone(boardStatus)} />
        </View>
      </Card>
      {drafts.map((draft) => (
        <Card key={draft.userId}>
          <View style={styles.memberHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{draft.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.memberText}>
              <Text style={styles.memberName}>{draft.name}</Text>
              <Text style={styles.memberMeta}>
                version {draft.version}
                {draft.submittedAt ? ` · ${formatDateTime(draft.submittedAt)}` : ' · 미작성'}
              </Text>
            </View>
            {isDraftDirty(draft) ? <Chip label="수정됨" tone="warning" /> : null}
          </View>
          <TextInput
            accessibilityLabel={`${draft.name} 기도제목 입력`}
            editable={editable}
            multiline
            onChangeText={(value) => onChangeDraft(draft.userId, value)}
            placeholder="기도제목을 입력해 주세요"
            placeholderTextColor={colors.subtleText}
            style={[styles.prayerInput, !editable ? styles.prayerInputDisabled : null]}
            value={draft.content}
          />
          <Text style={styles.inputCounter}>
            {draft.content.length}/{PRAYER_CONTENT_MAX_LENGTH}
          </Text>
        </Card>
      ))}
      <Card>
        <Button
          accessibilityLabel={`${selectedGroup.groupName} 변경된 기도제목 저장`}
          disabled={!editable || dirtyCount === 0}
          onPress={onSave}>
          {saving ? '저장 중...' : '변경 사항 저장'}
        </Button>
        <Button
          accessibilityLabel="기도제목 최신 서버 데이터 다시 불러오기"
          disabled={saving}
          onPress={onReloadLatest}
          variant="secondary">
          {refreshing ? '불러오는 중...' : '최신 데이터 다시 불러오기'}
        </Button>
      </Card>
    </>
  );
}

function PrayerActionErrorCard({
  error,
  onKeepLocalAndReload,
  onReloadLatest,
}: {
  error: ApiError;
  onKeepLocalAndReload: () => void;
  onReloadLatest: () => void;
}) {
  if (error.kind === 'conflict') {
    return (
      <Conflict
        title="기도제목 저장이 rollback됐습니다"
        message={`${getErrorMessage(error)} 저장 요청 안의 항목 중 하나라도 충돌하면 전체 요청이 저장되지 않습니다.`}
        actionLabel="최신 서버 데이터 다시 불러오기"
        actionAccessibilityLabel="기도제목 충돌 후 최신 서버 데이터로 다시 불러오기"
        onActionPress={onReloadLatest}
        secondaryActionLabel="내 작성 유지하고 최신 확인"
        secondaryActionAccessibilityLabel="기도제목 충돌 후 내 작성 내용을 유지하며 최신 version 확인"
        onSecondaryActionPress={onKeepLocalAndReload}
      />
    );
  }

  return (
    <Card>
      <Eyebrow>{error.code ?? error.kind}</Eyebrow>
      <Title>{getActionErrorTitle(error.kind)}</Title>
      <Body>{getErrorMessage(error)}</Body>
    </Card>
  );
}

function PrayerErrorState({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  switch (error.kind) {
    case 'sessionExpired':
      return (
        <ErrorState
          title="세션이 만료되었습니다"
          message={getErrorMessage(error)}
          actionLabel="다시 시도"
          actionAccessibilityLabel="세션 만료 후 기도제목 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'permissionDenied':
      return (
        <PermissionDenied
          title="기도제목 접근 권한이 없습니다"
          message={getErrorMessage(error)}
          actionLabel="다시 시도"
          actionAccessibilityLabel="권한 오류 후 기도제목 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title="최신 기도제목 상태가 필요합니다"
          message={getErrorMessage(error)}
          actionLabel="다시 불러오기"
          actionAccessibilityLabel="충돌 후 기도제목 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title="네트워크 연결이 필요합니다"
          message={getErrorMessage(error)}
          actionLabel="다시 시도"
          actionAccessibilityLabel="오프라인 후 기도제목 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return (
        <ErrorState
          title="기도제목을 불러오지 못했습니다"
          message={getErrorMessage(error)}
          actionLabel="다시 시도"
          actionAccessibilityLabel="기도제목 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    default:
      return assertNever(error.kind);
  }
}

function buildDrafts(
  board: PrayerWeekSummary,
  currentDrafts: Record<number, PrayerDraft>,
): Record<number, PrayerDraft> {
  return board.groups.reduce<Record<number, PrayerDraft>>((nextDrafts, group) => {
    group.members.forEach((member) => {
      const serverContent = member.content ?? '';
      const currentDraft = currentDrafts[member.userId];
      const shouldKeepLocal =
        currentDraft !== undefined && currentDraft.content !== currentDraft.baseContent;

      nextDrafts[member.userId] = {
        baseContent: serverContent,
        content: shouldKeepLocal ? currentDraft.content : serverContent,
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

function isDraftDirty(draft: PrayerDraft) {
  return draft.content !== draft.baseContent;
}

function normalizePrayerContent(content: string) {
  const normalized = content.trim();

  return normalized.length > 0 ? normalized : null;
}

async function resolveAccessToken(setAuthState: (state: AuthGateState) => void) {
  const {accessToken} = await getStoredTokens();

  if (!accessToken) {
    await clearTokens();
    setAuthState({status: 'sessionExpired', message: '저장된 access token이 없습니다.'});
    return null;
  }

  return accessToken;
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

function getErrorMessage(error: ApiError) {
  return error.code ? `[${error.code}] ${error.message}` : error.message;
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

function getWeekStartDate(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);

  return formatLocalDate(start);
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
    fontWeight: '800',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  groupButton: {
    backgroundColor: colors.neutralSoft,
    borderColor: colors.border,
    borderRadius: radius.item,
    borderWidth: 1,
    minWidth: '46%',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  groupButtonMeta: {
    color: colors.mutedText,
    fontSize: 12,
    marginTop: 4,
  },
  groupButtonSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  groupButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  groupButtonTextSelected: {
    color: colors.primary,
  },
  groupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  inputCounter: {
    alignSelf: 'flex-end',
    color: colors.subtleText,
    fontSize: 12,
    marginTop: 8,
  },
  memberHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.gap,
  },
  memberMeta: {
    color: colors.mutedText,
    fontSize: 12,
    marginTop: 2,
  },
  memberName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  memberText: {
    flex: 1,
  },
  metaGrid: {
    gap: spacing.gap,
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
  prayerInputDisabled: {
    opacity: 0.65,
  },
  pressed: {
    opacity: 0.72,
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
    fontWeight: '800',
    textAlign: 'center',
  },
  weekLabel: {
    alignItems: 'center',
    flex: 1,
  },
  weekRange: {
    color: colors.mutedText,
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
});
