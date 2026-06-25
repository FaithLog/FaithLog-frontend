import {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';

import {
  createPollComment,
  deletePollComment,
  FaithLogApiError,
  fetchCoffeeBrands,
  fetchCoffeeMenus,
  fetchPollComments,
  fetchPollDetail,
  fetchPollResults,
  fetchPolls,
  savePollResponse,
  updatePollComment,
} from '../api/client';
import {getApiErrorPresentation} from '../api/errorPolicy';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {
  ApiError,
  CoffeeBrand,
  CoffeeMenu,
  PollComment,
  PollDetail,
  PollResults,
  PollSummary,
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

type PollScreenProps = {
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
  state: AuthenticatedState;
};

type ListState =
  | {status: 'loading'}
  | {status: 'success'; polls: PollSummary[]}
  | {status: 'error'; error: ApiError};

type DetailState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {
      status: 'success';
      coffeeCatalog: CoffeeCatalogState;
      comments: PollComment[];
      detail: PollDetail;
      resultError: ApiError | null;
      results: PollResults | null;
    }
  | {status: 'error'; error: ApiError};

type DetailTab = 'response' | 'comments' | 'results';
type ActionState = {kind: 'response' | 'comment' | 'edit' | 'delete'; id?: number} | null;
type CoffeeCatalogState =
  | {status: 'notNeeded'}
  | {status: 'success'; brands: CoffeeBrand[]; menus: CoffeeMenu[]}
  | {status: 'error'; error: ApiError};

const RESPONSE_ERROR_CODES = new Set([
  'POLL_RESPONSE_DUPLICATE_OPTION',
  'POLL_RESPONSE_INVALID_SELECTION_COUNT',
]);
const COMMENT_MAX_LENGTH = 500;
const MEMO_MAX_LENGTH = 200;

export function PollScreen({setAuthState, setNotice, state}: PollScreenProps) {
  const campusId = state.selectedCampus.campusId;
  const [listState, setListState] = useState<ListState>({status: 'loading'});
  const [selectedPollId, setSelectedPollId] = useState<number | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({status: 'idle'});
  const [detailTab, setDetailTab] = useState<DetailTab>('response');
  const [selectedOptionIds, setSelectedOptionIds] = useState<number[]>([]);
  const [memo, setMemo] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [editingComment, setEditingComment] = useState<PollComment | null>(null);
  const [actionState, setActionState] = useState<ActionState>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const loadPolls = async () => {
    setListState({status: 'loading'});
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const polls = await fetchPolls(accessToken, campusId);
      setListState({status: 'success', polls});
    } catch (error) {
      const apiError = toApiError(error, '투표 목록을 불러오지 못했습니다.');
      setListState({status: 'error', error: apiError});
      handleAuthError(apiError, setAuthState);
    }
  };

  const loadDetail = async (pollId: number, tab: DetailTab = detailTab) => {
    setDetailState({status: 'loading'});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const [detail, comments, resultState] = await Promise.all([
        fetchPollDetail(accessToken, campusId, pollId),
        fetchPollComments(accessToken, campusId, pollId),
        fetchPollResultState(accessToken, campusId, pollId),
      ]);
      const coffeeCatalog = await loadCoffeeCatalog(accessToken, detail);
      if (coffeeCatalog.status === 'error') {
        handleAuthError(coffeeCatalog.error, setAuthState);
      }
      setDetailState({
        status: 'success',
        detail,
        comments,
        results: resultState.results,
        resultError: resultState.error,
        coffeeCatalog,
      });
      setSelectedOptionIds(detail.myResponse?.optionIds ?? []);
      setMemo((detail.myResponse?.memo ?? '').slice(0, MEMO_MAX_LENGTH));
      setDetailTab(tab);
    } catch (error) {
      const apiError = toApiError(error, '투표 상세를 불러오지 못했습니다.');
      setDetailState({status: 'error', error: apiError});
      handleAuthError(apiError, setAuthState);
    }
  };

  useEffect(() => {
    void loadPolls();
  }, [campusId]);

  const openDetail = (poll: PollSummary) => {
    setSelectedPollId(poll.id);
    setDetailTab(poll.responded || poll.status !== 'OPEN' ? 'results' : 'response');
    void loadDetail(poll.id, poll.responded || poll.status !== 'OPEN' ? 'results' : 'response');
  };

  const closeDetail = () => {
    setSelectedPollId(null);
    setDetailState({status: 'idle'});
    setActionError(null);
    setEditingComment(null);
    void loadPolls();
  };

  const activeDetail = detailState.status === 'success' ? detailState.detail : null;
  const selectedOptions = useMemo(
    () =>
      activeDetail
        ? activeDetail.options.filter((option) => selectedOptionIds.includes(option.id))
        : [],
    [activeDetail, selectedOptionIds],
  );

  const toggleOption = (optionId: number) => {
    if (!activeDetail || activeDetail.status !== 'OPEN' || actionState) {
      return;
    }

    setActionError(null);
    setSelectedOptionIds((current) => {
      if (activeDetail.selectionType === 'SINGLE') {
        return current.includes(optionId) ? [] : [optionId];
      }

      return current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
    });
  };

  const submitResponse = async () => {
    if (!activeDetail || actionState || activeDetail.status !== 'OPEN') {
      return;
    }

    const validation = validateSelectedOptions(selectedOptionIds, activeDetail.selectionType);

    if (validation) {
      setActionError(validation);
      return;
    }

    setActionState({kind: 'response'});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      await savePollResponse(accessToken, campusId, activeDetail.id, {
        optionIds: selectedOptionIds,
        memo: memo.trim().slice(0, MEMO_MAX_LENGTH),
      });
      setNotice({
        tone: 'success',
        title: '투표 응답 저장',
        message: selectedOptions.length > 0
          ? `${selectedOptions.map((option) => option.content).join(', ')} 응답을 저장했습니다.`
          : '투표 응답을 저장했습니다.',
      });
      await loadDetail(activeDetail.id, 'results');
      await loadPolls();
    } catch (error) {
      const apiError = toApiError(error, '투표 응답을 저장하지 못했습니다.');
      setActionError(apiError);
      handleAuthError(apiError, setAuthState);
    } finally {
      setActionState(null);
    }
  };

  const submitComment = async () => {
    if (!activeDetail || actionState || activeDetail.status !== 'OPEN') {
      return;
    }

    const content = commentContent.trim().slice(0, COMMENT_MAX_LENGTH);

    if (!content) {
      setActionError({kind: 'error', message: '댓글 내용을 입력해 주세요.'});
      return;
    }

    setActionState({kind: 'comment'});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      await createPollComment(accessToken, campusId, activeDetail.id, {content});
      setCommentContent('');
      setNotice({tone: 'success', title: '댓글 작성', message: '댓글을 등록했습니다.'});
      await loadDetail(activeDetail.id, 'comments');
    } catch (error) {
      const apiError = toApiError(error, '댓글을 등록하지 못했습니다.');
      setActionError(apiError);
      handleAuthError(apiError, setAuthState);
    } finally {
      setActionState(null);
    }
  };

  const submitCommentEdit = async () => {
    if (!activeDetail || !editingComment || actionState || activeDetail.status !== 'OPEN') {
      return;
    }

    const content = commentContent.trim().slice(0, COMMENT_MAX_LENGTH);

    if (!content) {
      setActionError({kind: 'error', message: '수정할 댓글 내용을 입력해 주세요.'});
      return;
    }

    setActionState({kind: 'edit', id: editingComment.commentId});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      await updatePollComment(accessToken, campusId, activeDetail.id, editingComment.commentId, {
        content,
      });
      setEditingComment(null);
      setCommentContent('');
      setNotice({tone: 'success', title: '댓글 수정', message: '댓글을 수정했습니다.'});
      await loadDetail(activeDetail.id, 'comments');
    } catch (error) {
      const apiError = toApiError(error, '댓글을 수정하지 못했습니다.');
      setActionError(apiError);
      handleAuthError(apiError, setAuthState);
    } finally {
      setActionState(null);
    }
  };

  const removeComment = async (comment: PollComment) => {
    if (!activeDetail || actionState || activeDetail.status !== 'OPEN') {
      return;
    }

    setActionState({kind: 'delete', id: comment.commentId});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      await deletePollComment(accessToken, campusId, activeDetail.id, comment.commentId);
      setNotice({tone: 'success', title: '댓글 삭제', message: '댓글을 삭제했습니다.'});
      await loadDetail(activeDetail.id, 'comments');
    } catch (error) {
      const apiError = toApiError(error, '댓글을 삭제하지 못했습니다.');
      setActionError(apiError);
      handleAuthError(apiError, setAuthState);
    } finally {
      setActionState(null);
    }
  };

  if (selectedPollId !== null) {
    if (detailState.status === 'error') {
      return (
        <>
          <Button accessibilityLabel="투표 목록으로 돌아가기" onPress={closeDetail} variant="ghost">
            목록으로
          </Button>
          <PollErrorState error={detailState.error} onRetry={() => loadDetail(selectedPollId)} />
        </>
      );
    }

    if (detailState.status !== 'success') {
      return <Loading message="투표 상세와 댓글을 불러오고 있어요." />;
    }

    return (
      <View style={styles.figmaScreen}>
        <PollDetailHeader
          campusLabel={`${state.selectedCampus.region} ${state.selectedCampus.campusName}`}
          detail={detailState.detail}
          onBack={closeDetail}
        />
        <PollTabs activeTab={detailTab} onSelect={setDetailTab} />
        {actionError ? <ActionErrorCard error={actionError} /> : null}
        {detailTab === 'response' ? (
          <ResponsePanel
            actionState={actionState}
            coffeeCatalog={detailState.coffeeCatalog}
            detail={detailState.detail}
            memo={memo}
            onMemoChange={(value) => setMemo(value.slice(0, MEMO_MAX_LENGTH))}
            onRetryCoffeeCatalog={() => loadDetail(detailState.detail.id, detailTab)}
            onSubmit={submitResponse}
            onToggleOption={toggleOption}
            selectedOptionIds={selectedOptionIds}
          />
        ) : null}
        {detailTab === 'comments' ? (
          <CommentsPanel
            actionState={actionState}
            commentContent={commentContent}
            comments={detailState.comments}
            currentUserId={state.user.id}
            editingComment={editingComment}
            isOpen={detailState.detail.status === 'OPEN'}
            onCancelEdit={() => {
              setEditingComment(null);
              setCommentContent('');
              setActionError(null);
            }}
            onChangeComment={(value) => setCommentContent(value.slice(0, COMMENT_MAX_LENGTH))}
            onDelete={removeComment}
            onEdit={(comment) => {
              setEditingComment(comment);
              setCommentContent(comment.content.slice(0, COMMENT_MAX_LENGTH));
              setActionError(null);
            }}
            onSubmit={editingComment ? submitCommentEdit : submitComment}
          />
        ) : null}
        {detailTab === 'results' ? (
          <ResultsPanel
            detail={detailState.detail}
            error={detailState.resultError}
            onRetry={() => loadDetail(detailState.detail.id, 'results')}
            results={detailState.results}
          />
        ) : null}
      </View>
    );
  }

  if (listState.status === 'error') {
    return <PollErrorState error={listState.error} onRetry={loadPolls} />;
  }

  if (listState.status !== 'success') {
    return <Loading message="투표 목록을 불러오고 있어요." />;
  }

  return (
    <View style={styles.figmaScreen}>
      <FigmaScreenHeader
        chip={`${state.selectedCampus.region} ${state.selectedCampus.campusName}`}
        title="투표"
      />
      <Text style={styles.figmaSectionTitle}>진행 중인 투표</Text>
      <View style={styles.filterRow}>
        {['전체', '수요', '토요', '커피', '커스텀'].map((label, index) => (
          <View key={label} style={[styles.figmaFilterChip, index === 0 ? styles.figmaFilterChipActive : null]}>
            <Text style={[styles.figmaFilterText, index === 0 ? styles.figmaFilterTextActive : null]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      {listState.polls.length === 0 ? (
        <Empty
          title="진행 중인 투표가 없어요"
          message="새 투표가 열리면 이곳에서 응답하고 결과를 확인할 수 있어요."
          actionLabel="다시 불러오기"
          actionAccessibilityLabel="투표 목록 다시 불러오기"
          onActionPress={loadPolls}
        />
      ) : (
        <>
          {listState.polls
            .filter((poll) => poll.status === 'OPEN' && !poll.responded)
            .slice(0, 4)
            .map((poll) => (
              <PollListCard key={poll.id} onPress={() => openDetail(poll)} poll={poll} />
            ))}
          <Text style={styles.figmaSectionTitle}>내가 응답한 투표</Text>
          {listState.polls.filter((poll) => poll.responded).length === 0 ? (
            <Text style={styles.figmaMutedText}>아직 응답한 투표가 없습니다.</Text>
          ) : (
            listState.polls
              .filter((poll) => poll.responded)
              .slice(0, 2)
              .map((poll) => (
                <PollListCard key={poll.id} onPress={() => openDetail(poll)} poll={poll} />
              ))
          )}
        </>
      )}
    </View>
  );
}

function FigmaScreenHeader({chip, title}: {chip: string; title: string}) {
  return (
    <View style={styles.figmaHeader}>
      <Text style={styles.figmaTitle}>{title}</Text>
      <View style={styles.figmaCampusChip}>
        <Text style={styles.figmaCampusText}>{chip}</Text>
      </View>
    </View>
  );
}

function PollDetailHeader({
  campusLabel,
  detail,
  onBack,
}: {
  campusLabel: string;
  detail: PollDetail;
  onBack: () => void;
}) {
  return (
    <>
      <FigmaScreenHeader chip={campusLabel} title={getPollDetailTitle(detail)} />
      <View style={styles.figmaHeroCard}>
        <Text style={styles.figmaHeroTitle}>{detail.title}</Text>
        <Text style={styles.figmaHeroMeta}>
          {getPollTypeLabel(detail.pollType)} · {detail.selectionType === 'SINGLE' ? '단일 선택' : '다중 선택'} · {detail.isAnonymous ? '익명' : '응답자 공개'}
        </Text>
        <View style={styles.figmaSmallChip}>
          <Text style={styles.figmaSmallChipText}>
            {detail.status === 'OPEN' ? getPollDeadlineLabel(detail.endsAt) : getPollStatusLabel(detail.status)}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="투표 목록으로 돌아가기"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.figmaBackButton}>
          <Text style={styles.figmaBackButtonText}>목록</Text>
        </Pressable>
      </View>
      {detail.status === 'SCHEDULED' ? (
        <InlineNotice message="아직 시작 전인 투표라 응답과 댓글 작성이 제한됩니다." tone="warning" />
      ) : null}
      {detail.status === 'CLOSED' ? (
        <InlineNotice message="마감된 투표라 응답과 댓글 수정은 할 수 없고 결과만 확인할 수 있어요." tone="info" />
      ) : null}
    </>
  );
}

function PollTabs({
  activeTab,
  onSelect,
}: {
  activeTab: DetailTab;
  onSelect: (tab: DetailTab) => void;
}) {
  const tabs: Array<{id: DetailTab; label: string}> = [
    {id: 'response', label: '응답'},
    {id: 'comments', label: '댓글'},
    {id: 'results', label: '결과'},
  ];

  return (
    <View accessibilityRole="tablist" style={styles.tabs}>
      {tabs.map((tab) => (
        <Pressable
          accessibilityLabel={`${tab.label} 탭으로 이동`}
          accessibilityRole="tab"
          accessibilityState={{selected: activeTab === tab.id}}
          key={tab.id}
          onPress={() => onSelect(tab.id)}
          style={({pressed}) => [
            styles.tab,
            activeTab === tab.id ? styles.tabActive : null,
            pressed ? styles.pressed : null,
          ]}>
          <Text style={[styles.tabText, activeTab === tab.id ? styles.tabTextActive : null]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ResponsePanel({
  actionState,
  coffeeCatalog,
  detail,
  memo,
  onMemoChange,
  onRetryCoffeeCatalog,
  onSubmit,
  onToggleOption,
  selectedOptionIds,
}: {
  actionState: ActionState;
  coffeeCatalog: CoffeeCatalogState;
  detail: PollDetail;
  memo: string;
  onMemoChange: (value: string) => void;
  onRetryCoffeeCatalog: () => void;
  onSubmit: () => void;
  onToggleOption: (optionId: number) => void;
  selectedOptionIds: number[];
}) {
  const isOpen = detail.status === 'OPEN';
  const responding = actionState?.kind === 'response';
  const hasResponse = Boolean(detail.myResponse);

  return (
    <>
      <Text style={styles.figmaSectionTitle}>응답 선택</Text>
      {detail.pollType === 'COFFEE' ? (
        <CoffeeCatalogPanel catalog={coffeeCatalog} onRetry={onRetryCoffeeCatalog} />
      ) : null}
      <View style={styles.optionList}>
        {detail.options
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((option) => {
            const selected = selectedOptionIds.includes(option.id);
            const matchedMenu = findCoffeeMenuForOption(coffeeCatalog, option.composeMenuCode);
            const optionTitle =
              detail.pollType === 'COFFEE' && matchedMenu ? matchedMenu.name : option.content;
            const optionMeta =
              detail.pollType === 'COFFEE'
                ? getCoffeeOptionMeta(option, matchedMenu)
                : null;

            return (
              <Pressable
                accessibilityLabel={`${optionTitle} 선택지${selected ? ' 선택됨' : ''}`}
                accessibilityRole={detail.selectionType === 'SINGLE' ? 'radio' : 'checkbox'}
                accessibilityState={{checked: selected, disabled: !isOpen || responding}}
                disabled={!isOpen || responding}
                key={option.id}
                onPress={() => onToggleOption(option.id)}
                style={({pressed}) => [
                  styles.optionRow,
                  selected ? styles.optionRowSelected : null,
                  pressed ? styles.pressed : null,
                ]}>
                <Text style={[styles.optionMark, selected ? styles.optionMarkSelected : null]}>
                  {selected ? '✓' : detail.selectionType === 'SINGLE' ? '○' : '□'}
                </Text>
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{optionTitle}</Text>
                  {optionMeta ? <Text style={styles.optionMeta}>{optionMeta}</Text> : null}
                </View>
              </Pressable>
            );
          })}
      </View>
      <Text style={styles.fieldLabel}>메모</Text>
      <TextInput
        accessibilityLabel="투표 응답 메모 입력"
        editable={isOpen && !responding}
        multiline
        onChangeText={onMemoChange}
        placeholder="필요한 메모를 남겨주세요"
        placeholderTextColor={colors.subtleText}
        style={styles.multiInput}
        value={memo}
      />
      <Button
        accessibilityLabel="투표 응답 저장"
        disabled={!isOpen || responding}
        onPress={onSubmit}>
        {responding ? '저장 중...' : hasResponse ? '응답 수정' : getPollSubmitLabel(detail)}
      </Button>
    </>
  );
}

function CoffeeCatalogPanel({
  catalog,
  onRetry,
}: {
  catalog: CoffeeCatalogState;
  onRetry: () => void;
}) {
  if (catalog.status === 'notNeeded') {
    return null;
  }

  if (catalog.status === 'error') {
    return (
      <View style={styles.catalogBox}>
        <Text style={styles.catalogTitle}>{getCoffeeCatalogErrorTitle(catalog.error)}</Text>
        <Text style={styles.catalogBody}>
          {getErrorMessage(catalog.error)} 저장된 메뉴명과 가격으로 계속 표시합니다.
        </Text>
        <Button
          accessibilityLabel="커피 브랜드와 메뉴 다시 불러오기"
          onPress={onRetry}
          variant="secondary">
          메뉴 다시 불러오기
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.catalogBox}>
      <Text style={styles.catalogTitle}>메뉴 정보를 확인했어요</Text>
      <Text style={styles.catalogBody}>
        현재 선택할 수 있는 커피 메뉴와 금액을 함께 보여줍니다.
      </Text>
    </View>
  );
}

function CommentsPanel({
  actionState,
  commentContent,
  comments,
  currentUserId,
  editingComment,
  isOpen,
  onCancelEdit,
  onChangeComment,
  onDelete,
  onEdit,
  onSubmit,
}: {
  actionState: ActionState;
  commentContent: string;
  comments: PollComment[];
  currentUserId: number;
  editingComment: PollComment | null;
  isOpen: boolean;
  onCancelEdit: () => void;
  onChangeComment: (value: string) => void;
  onDelete: (comment: PollComment) => void;
  onEdit: (comment: PollComment) => void;
  onSubmit: () => void;
}) {
  const submitting = actionState?.kind === 'comment' || actionState?.kind === 'edit';

  return (
    <>
      <View style={styles.figmaCommentCard}>
        <Text style={styles.figmaSectionTitle}>{editingComment ? '댓글 수정' : '댓글'}</Text>
        <TextInput
          accessibilityLabel={editingComment ? '수정할 댓글 내용 입력' : '댓글 내용 입력'}
          editable={isOpen && !submitting}
          multiline
          onChangeText={onChangeComment}
          placeholder="댓글을 입력해 주세요"
          placeholderTextColor={colors.subtleText}
          style={styles.multiInput}
          value={commentContent}
        />
        <View style={styles.actionRow}>
          <Button
            accessibilityLabel={editingComment ? '댓글 수정 저장' : '댓글 등록'}
            disabled={!isOpen || submitting}
            onPress={onSubmit}>
            {submitting ? '저장 중...' : editingComment ? '수정 저장' : '댓글 등록'}
          </Button>
          {editingComment ? (
            <Button
              accessibilityLabel="댓글 수정 취소"
              disabled={submitting}
              onPress={onCancelEdit}
              variant="secondary">
              취소
            </Button>
          ) : null}
        </View>
      </View>
      {comments.length === 0 ? (
        <Empty title="아직 댓글이 없어요" message="첫 댓글을 남겨 투표 맥락을 공유해 주세요." />
      ) : (
        comments.map((comment) => {
          const canEdit = isOpen && !comment.deleted && comment.userId === currentUserId;
          const deleting =
            actionState?.kind === 'delete' && actionState.id === comment.commentId;

          return (
            <View key={comment.commentId} style={styles.figmaCommentCard}>
              <View style={styles.commentHeader}>
                <View>
                  <Text style={styles.commentAuthor}>{comment.name}</Text>
                  <Text style={styles.commentTime}>{formatDateTime(comment.updatedAt)}</Text>
                </View>
                {comment.deleted ? <Chip label="삭제됨" /> : null}
              </View>
              <Body>{comment.content}</Body>
              {canEdit ? (
                <View style={styles.actionRow}>
                  <Button
                    accessibilityLabel={`${comment.name} 댓글 수정`}
                    disabled={Boolean(actionState)}
                    onPress={() => onEdit(comment)}
                    variant="secondary">
                    수정
                  </Button>
                  <Button
                    accessibilityLabel={`${comment.name} 댓글 삭제`}
                    disabled={Boolean(actionState)}
                    onPress={() => onDelete(comment)}
                    variant="danger">
                    {deleting ? '삭제 중...' : '삭제'}
                  </Button>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </>
  );
}

function ResultsPanel({
  detail,
  error,
  onRetry,
  results,
}: {
  detail: PollDetail;
  error: ApiError | null;
  onRetry: () => void;
  results: PollResults | null;
}) {
  if (!results) {
    if (error) {
      return <PollErrorState error={error} onRetry={onRetry} />;
    }

    return (
      <ErrorState
        title="결과를 불러오지 못했습니다"
        message="응답과 댓글은 사용할 수 있지만 결과 API 응답을 확인하지 못했습니다."
        actionLabel="다시 불러오기"
        actionAccessibilityLabel="투표 결과 다시 불러오기"
        onActionPress={onRetry}
      />
    );
  }

  const mySelectedLabels = detail.options
    .filter((option) => detail.myResponse?.optionIds.includes(option.id))
    .map((option) => option.content);

  return (
    <>
      <View style={styles.figmaCommentCard}>
        <Text style={styles.figmaHeroTitle}>{`${results.targetMemberCount}명 중 ${results.respondedCount}명 응답`}</Text>
        <View style={styles.chipRow}>
          <Chip label={results.anonymous ? '익명 응답' : '명단 공개'} tone={results.anonymous ? 'default' : 'info'} />
          <Chip label={`${results.notRespondedCount}명 미응답`} tone={results.notRespondedCount > 0 ? 'warning' : 'success'} />
        </View>
        <Body>
          {detail.myResponse
            ? `내 응답은 ${mySelectedLabels.join(', ') || '선택지 없음'}으로 저장됐어요.`
            : '아직 저장된 내 응답이 없습니다.'}
        </Body>
      </View>
      {results.optionResults
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((option) => (
          <View key={option.id} style={styles.figmaOptionResultCard}>
            <View style={styles.headerRow}>
              <Title>{option.content}</Title>
              <Chip label={`${option.responseCount}명`} tone={option.responseCount > 0 ? 'info' : 'default'} />
            </View>
            {results.anonymous ? (
              <Body>익명 투표라 응답자 명단은 공개되지 않습니다.</Body>
            ) : option.respondents.length === 0 ? (
              <Body>아직 이 선택지에 응답한 사람이 없습니다.</Body>
            ) : (
              <View style={styles.respondentGrid}>
                {option.respondents.map((respondent) => (
                  <View key={`${option.id}-${respondent.userId}`} style={styles.respondent}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{respondent.name.slice(0, 1)}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.respondentName}>
                      {respondent.name}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
    </>
  );
}

function PollListCard({onPress, poll}: {onPress: () => void; poll: PollSummary}) {
  return (
    <Pressable
      accessibilityLabel={`${poll.title} 상세 보기`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.figmaPollRow, pressed ? styles.pressed : null]}>
      <View style={styles.figmaPollIcon}>
        <Text style={styles.figmaPollIconText}>{getPollIcon(poll.pollType)}</Text>
      </View>
      <View style={styles.figmaPollText}>
        <Text style={styles.figmaPollTitle}>{poll.title}</Text>
        <Text style={styles.figmaPollMeta}>
          {getPollTypeLabel(poll.pollType)} · {poll.selectionType === 'SINGLE' ? '단일 선택' : '다중 선택'} · {poll.isAnonymous ? '익명' : '공개'}
        </Text>
      </View>
      <View style={styles.figmaPollButton}>
        <Text style={styles.figmaPollButtonText}>{poll.responded ? '보기' : '투표'}</Text>
      </View>
    </Pressable>
  );
}

function PollErrorState({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  const presentation = getApiErrorPresentation(error, {
    conflictTitle: '최신 투표 상태가 필요합니다',
    conflictMessage: '투표 상태가 변경되었습니다. 다시 불러온 뒤 응답해 주세요.',
    permissionTitle: '투표 접근 권한이 없습니다',
    permissionMessage: '현재 계정 또는 캠퍼스로는 이 투표에 접근할 수 없습니다.',
    defaultTitle: '투표를 불러오지 못했습니다',
  });

  switch (error.kind) {
    case 'sessionExpired':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="세션 만료 후 투표 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'permissionDenied':
      return (
        <PermissionDenied
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="권한 오류 후 투표 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="충돌 후 투표 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="오프라인 후 투표 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="투표 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    default:
      return assertNever(error.kind);
  }
}

function ActionErrorCard({error}: {error: ApiError}) {
  const presentation = getApiErrorPresentation(error, {
    conflictMessage: '투표 상태가 변경되었습니다. 다시 불러온 뒤 응답해 주세요.',
  });
  const title = RESPONSE_ERROR_CODES.has(error.code ?? '')
    ? '선택을 다시 확인해 주세요'
    : presentation.title;

  return (
    <Card>
      <Eyebrow>{getActionErrorTitle(error.kind)}</Eyebrow>
      <Title>{title}</Title>
      <Body>{presentation.message}</Body>
    </Card>
  );
}

function InlineNotice({message, tone}: {message: string; tone: 'info' | 'warning'}) {
  return (
    <View style={[styles.inlineNotice, tone === 'warning' ? styles.inlineWarning : styles.inlineInfo]}>
      <Text style={styles.inlineNoticeText}>{message}</Text>
    </View>
  );
}

async function loadCoffeeCatalog(
  accessToken: string,
  detail: PollDetail,
): Promise<CoffeeCatalogState> {
  if (detail.pollType !== 'COFFEE') {
    return {status: 'notNeeded'};
  }

  try {
    const brands = await fetchCoffeeBrands(accessToken);
    const menusByBrand = await Promise.all(
      brands
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((brand) => fetchCoffeeMenus(accessToken, brand.id)),
    );

    return {
      status: 'success',
      brands,
      menus: menusByBrand.flat().sort((a, b) => a.name.localeCompare(b.name, 'ko-KR')),
    };
  } catch (error) {
    const apiError = toApiError(error, '커피 브랜드와 메뉴를 불러오지 못했습니다.');

    if (apiError.kind === 'sessionExpired') {
      throw error;
    }

    return {status: 'error', error: apiError};
  }
}

async function fetchPollResultState(
  accessToken: string,
  campusId: unknown,
  pollId: unknown,
): Promise<{results: PollResults | null; error: ApiError | null}> {
  try {
    return {
      results: await fetchPollResults(accessToken, campusId, pollId),
      error: null,
    };
  } catch (error) {
    const apiError = toApiError(error, '투표 결과를 불러오지 못했습니다.');

    if (apiError.kind === 'sessionExpired') {
      throw error;
    }

    return {results: null, error: apiError};
  }
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

function validateSelectedOptions(optionIds: number[], selectionType: string): ApiError | null {
  if (optionIds.length === 0) {
    return {
      kind: 'error',
      code: 'POLL_RESPONSE_INVALID_SELECTION_COUNT',
      message: '투표 선택 개수가 올바르지 않습니다.',
    };
  }

  if (new Set(optionIds).size !== optionIds.length) {
    return {
      kind: 'error',
      code: 'POLL_RESPONSE_DUPLICATE_OPTION',
      message: '중복된 투표 선택지가 포함되어 있습니다.',
    };
  }

  if (selectionType === 'SINGLE' && optionIds.length !== 1) {
    return {
      kind: 'error',
      code: 'POLL_RESPONSE_INVALID_SELECTION_COUNT',
      message: '단일 선택 투표는 하나만 선택할 수 있습니다.',
    };
  }

  return null;
}

function toApiError(error: unknown, fallback: string): ApiError {
  if (error instanceof FaithLogApiError) {
    return error.detail;
  }

  return {kind: 'error', message: fallback};
}

function getErrorMessage(error: ApiError) {
  return getApiErrorPresentation(error).message;
}

function getActionErrorTitle(kind: ApiError['kind']) {
  switch (kind) {
    case 'sessionExpired':
      return '세션이 만료되었습니다';
    case 'permissionDenied':
      return '권한이 없습니다';
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

function getCoffeeCatalogErrorTitle(error: ApiError) {
  switch (error.kind) {
    case 'permissionDenied':
      return '커피 메뉴 조회 권한이 없습니다';
    case 'offline':
      return '커피 메뉴 연결이 불안정합니다';
    case 'conflict':
      return '커피 메뉴 최신 상태가 필요합니다';
    case 'sessionExpired':
      return '세션이 만료되었습니다';
    case 'error':
      return '커피 메뉴를 불러오지 못했습니다';
    default:
      return assertNever(error.kind);
  }
}

function findCoffeeMenuForOption(
  catalog: CoffeeCatalogState,
  composeMenuCode: string | null,
) {
  if (catalog.status !== 'success' || !composeMenuCode) {
    return null;
  }

  return catalog.menus.find((menu) => menu.menuCode === composeMenuCode) ?? null;
}

function getCoffeeOptionMeta(
  option: {composeMenuCode: string | null; priceAmount: number},
  menu: CoffeeMenu | null,
) {
  if (menu) {
    const savedPollPrice =
      option.priceAmount !== menu.priceAmount
        ? ` · 현재 투표 ${formatWon(option.priceAmount)}`
        : '';

    return `${getCoffeeCategoryLabel(menu.category)} · ${formatWon(
      menu.priceAmount,
    )}${savedPollPrice}`;
  }

  return `${option.composeMenuCode ? '메뉴 확인 중' : '메뉴 정보 없음'} · ${formatWon(option.priceAmount)}`;
}

function getPollDetailTitle(detail: PollDetail) {
  if (detail.pollType === 'COFFEE') {
    return '커피 주문';
  }

  if (detail.title.includes('수요') || detail.pollType === 'WEDNESDAY') {
    return '수요예배 투표';
  }

  if (detail.title.includes('토요') || detail.pollType === 'SATURDAY') {
    return '토요 모임 투표';
  }

  return detail.selectionType === 'MULTIPLE' ? '커스텀 투표' : '투표 상세';
}

function getPollDeadlineLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '마감 확인';
  }

  const today = new Date();
  const sameDate =
    today.getFullYear() === date.getFullYear() &&
    today.getMonth() === date.getMonth() &&
    today.getDate() === date.getDate();
  const time = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  return `${sameDate ? '오늘' : `${date.getMonth() + 1}/${date.getDate()}`} ${time} 마감`;
}

function getPollSubmitLabel(detail: PollDetail) {
  return detail.pollType === 'COFFEE' ? '주문 저장' : '응답 제출';
}

function getPollIcon(type: string) {
  switch (type) {
    case 'WEDNESDAY':
      return '수';
    case 'SATURDAY':
      return '토';
    case 'COFFEE':
      return '커';
    default:
      return '▤';
  }
}

function getPollStatusLabel(status: string) {
  switch (status) {
    case 'OPEN':
      return '진행 중';
    case 'CLOSED':
      return '마감';
    case 'SCHEDULED':
      return '예정';
    default:
      return status;
  }
}

function getStatusTone(status: string) {
  switch (status) {
    case 'OPEN':
      return 'success';
    case 'CLOSED':
      return 'default';
    case 'SCHEDULED':
      return 'warning';
    default:
      return 'default';
  }
}

function getPollTypeLabel(type: string) {
  switch (type) {
    case 'CUSTOM':
      return '커스텀';
    case 'COFFEE':
      return '커피';
    case 'WEDNESDAY':
      return '수요예배';
    case 'SATURDAY':
      return '토요모임';
    default:
      return type;
  }
}

function getCoffeeCategoryLabel(category: string) {
  switch (category) {
    case 'COFFEE':
      return '커피';
    case 'DUTCH_COFFEE':
      return '더치커피';
    case 'DECAF':
      return '디카페인';
    case 'BEVERAGE':
      return '음료';
    case 'TEA_BEVERAGE':
      return '티/음료';
    case 'SMOOTHIE':
      return '스무디';
    case 'ADE':
      return '에이드';
    case 'TEA':
      return '티';
    case 'JUICE':
      return '주스';
    case 'FRAPPE':
      return '프라페';
    case 'MILK_SHAKE':
      return '밀크쉐이크';
    case 'DESSERT':
      return '디저트';
    default:
      return category;
  }
}

function formatDateRange(startsAt: string, endsAt: string) {
  return `${formatDateTime(startsAt)} - ${formatDateTime(endsAt)}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatWon(amount: number) {
  return `${Math.max(0, amount).toLocaleString('ko-KR')}원`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled state: ${String(value)}`);
}

const pollColors = {
  card: colors.surface,
  chip: colors.borderSoft,
  text: colors.textPrimary,
  muted: colors.textSecondary,
  border: colors.borderSoft,
  dark: colors.primary,
};

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    marginTop: spacing.gap,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  avatarText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  catalogBody: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 20,
  },
  catalogBox: {
    backgroundColor: pollColors.card,
    borderColor: pollColors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    marginTop: spacing.gap,
    padding: spacing.gap,
  },
  catalogTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.gap,
  },
  commentAuthor: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  commentHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.gap,
  },
  commentTime: {
    color: colors.subtleText,
    fontSize: 15,
    marginTop: 2,
  },
  fieldLabel: {
    color: pollColors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: spacing.gap,
  },
  figmaBackButton: {
    alignItems: 'center',
    backgroundColor: pollColors.chip,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    top: 24,
    width: 58,
  },
  figmaBackButtonText: {
    color: pollColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  figmaCampusChip: {
    alignItems: 'center',
    backgroundColor: pollColors.chip,
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    minWidth: 86,
    paddingHorizontal: 12,
  },
  figmaCampusText: {
    color: pollColors.muted,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  figmaCommentCard: {
    backgroundColor: pollColors.card,
    borderRadius: 18,
    gap: 12,
    padding: 20,
  },
  figmaFilterChip: {
    alignItems: 'center',
    backgroundColor: pollColors.chip,
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    minWidth: 54,
    paddingHorizontal: 14,
  },
  figmaFilterChipActive: {
    backgroundColor: pollColors.dark,
  },
  figmaFilterText: {
    color: pollColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  figmaFilterTextActive: {
    color: pollColors.card,
  },
  figmaHeader: {
    alignItems: 'flex-start',
    gap: 10,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  figmaHeroCard: {
    backgroundColor: pollColors.card,
    borderRadius: 22,
    gap: 10,
    minHeight: 124,
    padding: 24,
  },
  figmaHeroMeta: {
    color: pollColors.muted,
    fontSize: 15,
    lineHeight: 20,
  },
  figmaHeroTitle: {
    color: pollColors.text,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 27,
  },
  figmaMutedText: {
    color: pollColors.muted,
    fontSize: 15,
    lineHeight: 20,
  },
  figmaOptionResultCard: {
    backgroundColor: pollColors.card,
    borderRadius: 18,
    gap: 10,
    padding: 18,
  },
  figmaPollButton: {
    alignItems: 'center',
    backgroundColor: pollColors.dark,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 58,
  },
  figmaPollButtonText: {
    color: pollColors.card,
    fontSize: 15,
    fontWeight: '700',
  },
  figmaPollIcon: {
    alignItems: 'center',
    backgroundColor: pollColors.chip,
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  figmaPollIconText: {
    color: pollColors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  figmaPollMeta: {
    color: pollColors.muted,
    fontSize: 15,
    lineHeight: 20,
  },
  figmaPollRow: {
    alignItems: 'center',
    backgroundColor: pollColors.card,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    paddingHorizontal: 20,
  },
  figmaPollText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  figmaPollTitle: {
    color: pollColors.text,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
  },
  figmaScreen: {
    gap: 20,
    paddingTop: 2,
  },
  figmaSectionTitle: {
    color: pollColors.text,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
  },
  figmaSmallChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: pollColors.chip,
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  figmaSmallChipText: {
    color: pollColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  figmaTitle: {
    color: pollColors.text,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 34,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  inlineInfo: {
    backgroundColor: colors.primarySoft,
  },
  inlineNotice: {
    borderRadius: radius.item,
    marginTop: spacing.gap,
    padding: spacing.gap,
  },
  inlineNoticeText: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 20,
  },
  inlineWarning: {
    backgroundColor: colors.warningSoft,
  },
  multiInput: {
    backgroundColor: pollColors.card,
    borderColor: pollColors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 92,
    padding: 14,
    textAlignVertical: 'top',
  },
  optionList: {
    gap: 10,
    marginTop: spacing.gap,
  },
  optionMark: {
    color: colors.subtleText,
    fontSize: 16,
    fontWeight: '600',
    width: 24,
  },
  optionMarkSelected: {
    color: pollColors.text,
  },
  optionMeta: {
    color: colors.mutedText,
    fontSize: 15,
    marginTop: 3,
  },
  optionRow: {
    alignItems: 'center',
    backgroundColor: pollColors.card,
    borderColor: pollColors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.gap,
    minHeight: 56,
    padding: spacing.gap,
  },
  optionRowSelected: {
    backgroundColor: pollColors.chip,
    borderColor: pollColors.border,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  optionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  pressed: {
    opacity: 0.72,
  },
  respondent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 130,
    width: '46%',
  },
  respondentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    marginTop: spacing.gap,
  },
  respondentName: {
    color: colors.mutedText,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  tab: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: colors.primarySoft,
  },
  tabText: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.primary,
  },
  tabs: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
});
