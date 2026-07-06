import {useEffect, useState} from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  addUserPollOption,
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
  FaithLogHeaderIconButton,
  FaithLogHeaderPillButton,
  FaithLogHeaderTopRow,
  Loading,
  Offline,
  PermissionDenied,
  Title,
} from '../components/ui';
import {IconexIcon, type IconexIconName} from '../components/IconexIcon';
import {colors, radius, spacing} from '../theme';
import {
  getUserPollListGroups,
  getUserVisiblePollCount,
  isPollActionable,
} from './pollListVisibility';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type Notice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

type PollScreenProps = {
  canOpenAdminMode: boolean;
  onOpenAdminMode: () => void;
  onOpenNotifications: () => void;
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
type PollListTab = 'active' | 'closed';
type ActionState =
  | {kind: 'response' | 'comment' | 'edit' | 'delete' | 'optionAdd'; id?: number}
  | null;
type CoffeeCatalogState =
  | {status: 'notNeeded'}
  | {status: 'success'; brands: CoffeeBrand[]; menus: CoffeeMenu[]}
  | {status: 'error'; error: ApiError};

const RESPONSE_ERROR_CODES = new Set([
  'POLL_RESPONSE_DUPLICATE_OPTION',
  'POLL_RESPONSE_INVALID_SELECTION_COUNT',
]);
const COMMENT_MAX_LENGTH = 500;

export function PollScreen({
  canOpenAdminMode,
  onOpenAdminMode,
  onOpenNotifications,
  setAuthState,
  setNotice: _setNotice,
  state,
}: PollScreenProps) {
  const campusId = state.selectedCampus.campusId;
  const [listState, setListState] = useState<ListState>({status: 'loading'});
  const [selectedPollId, setSelectedPollId] = useState<number | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({status: 'idle'});
  const [detailTab, setDetailTab] = useState<DetailTab>('response');
  const [listTab, setListTab] = useState<PollListTab>('active');
  const [selectedOptionIds, setSelectedOptionIds] = useState<number[]>([]);
  const [commentContent, setCommentContent] = useState('');
  const [editingComment, setEditingComment] = useState<PollComment | null>(null);
  const [optionAddVisible, setOptionAddVisible] = useState(false);
  const [optionAddContent, setOptionAddContent] = useState('');
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
    const initialTab = poll.responded || !isPollActionable(poll) ? 'results' : 'response';
    setSelectedPollId(poll.id);
    setDetailTab(initialTab);
    void loadDetail(poll.id, initialTab);
  };

  const closeDetail = () => {
    setSelectedPollId(null);
    setDetailState({status: 'idle'});
    setActionError(null);
    setEditingComment(null);
    void loadPolls();
  };

  const activeDetail = detailState.status === 'success' ? detailState.detail : null;

  const toggleOption = (optionId: number) => {
    if (!activeDetail || !isPollActionable(activeDetail) || actionState) {
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
    if (!activeDetail || actionState || !isPollActionable(activeDetail)) {
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

  const submitUserOption = async (option: string | CoffeeMenu) => {
    if (
      !activeDetail ||
      actionState ||
      !isPollActionable(activeDetail) ||
      !isUserOptionAddAllowed(activeDetail)
    ) {
      return;
    }

    const optionContent = typeof option === 'string' ? option : option.name;
    const optionMenuId = typeof option === 'string' ? undefined : option.id;
    const trimmed = optionContent.trim();

    if (!trimmed) {
      setActionError({kind: 'error', message: '추가할 항목을 입력해 주세요.'});
      return;
    }

    const coffeeCatalog =
      detailState.status === 'success' ? detailState.coffeeCatalog : ({status: 'notNeeded'} as const);

    if (isDuplicatePollOption(activeDetail, coffeeCatalog, trimmed)) {
      setActionError({kind: 'error', message: '이미 추가된 항목입니다.'});
      return;
    }

    setActionState({kind: 'optionAdd'});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const added = await addUserPollOptionWithMenuContractFallback({
        accessToken,
        campusId,
        content: trimmed,
        ...(optionMenuId === undefined ? {} : {menuId: optionMenuId}),
        pollId: activeDetail.id,
      });
      setOptionAddContent('');
      setOptionAddVisible(false);
      await loadDetail(activeDetail.id, 'response');
      setSelectedOptionIds((current) =>
        activeDetail.selectionType === 'SINGLE'
          ? [added.id]
          : Array.from(new Set([...current, added.id])),
      );
    } catch (error) {
      const apiError = toApiError(error, '투표 항목을 추가하지 못했습니다.');
      setActionError(apiError);
      handleAuthError(apiError, setAuthState);
    } finally {
      setActionState(null);
    }
  };

  const submitComment = async () => {
    if (!activeDetail || actionState || !isPollActionable(activeDetail)) {
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
    if (!activeDetail || !editingComment || actionState || !isPollActionable(activeDetail)) {
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
    if (!activeDetail || actionState || !isPollActionable(activeDetail)) {
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={16}
        style={styles.keyboardRoot}>
        <ScrollView
          contentContainerStyle={styles.figmaScreen}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
        <PollDetailHeader
          canOpenAdminMode={canOpenAdminMode}
          campusLabel={state.selectedCampus.campusName}
          contextLabel={`${state.user.name}님`}
          detail={detailState.detail}
          onBack={closeDetail}
          onOpenAdminMode={onOpenAdminMode}
          onOpenNotifications={onOpenNotifications}
        />
        <PollTabs activeTab={detailTab} onSelect={setDetailTab} />
        {actionError ? <ActionErrorCard error={actionError} /> : null}
        {detailTab === 'response' ? (
          <ResponsePanel
            actionState={actionState}
            coffeeCatalog={detailState.coffeeCatalog}
            detail={detailState.detail}
            onRetryCoffeeCatalog={() => loadDetail(detailState.detail.id, detailTab)}
            onAddOption={() => setOptionAddVisible(true)}
            onSubmit={submitResponse}
            onToggleOption={toggleOption}
            results={detailState.results}
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
            isOpen={isPollActionable(detailState.detail)}
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
        <UserOptionAddSheet
          actionState={actionState}
          coffeeCatalog={detailState.coffeeCatalog}
          content={optionAddContent}
          detail={detailState.detail}
          onCancel={() => {
            if (actionState?.kind !== 'optionAdd') {
              setOptionAddVisible(false);
              setOptionAddContent('');
            }
          }}
          onChangeContent={setOptionAddContent}
          onSubmit={submitUserOption}
          visible={optionAddVisible}
        />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (listState.status === 'error') {
    return <PollErrorState error={listState.error} onRetry={loadPolls} />;
  }

  if (listState.status !== 'success') {
    return <Loading message="투표 목록을 불러오고 있어요." />;
  }

  const pollGroups = getUserPollListGroups(listState.polls);
  const visiblePollCount = getUserVisiblePollCount(pollGroups);
  const activeTabPollCount =
    pollGroups.activePolls.length +
    pollGroups.scheduledPolls.length +
    pollGroups.respondedPolls.length;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={16}
      style={styles.keyboardRoot}>
      <ScrollView
        contentContainerStyle={styles.figmaScreen}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
      <FigmaScreenHeader
        canOpenAdminMode={canOpenAdminMode}
        chip={state.selectedCampus.campusName}
        contextLabel={`${state.user.name}님`}
        onOpenAdminMode={onOpenAdminMode}
        onOpenNotifications={onOpenNotifications}
        title="투표"
      />
      <View style={styles.filterRow}>
        {[
          {id: 'active', label: '진행 투표'},
          {id: 'closed', label: '마감한 투표'},
        ].map((tab) => {
          const active = listTab === tab.id;

          return (
            <Pressable
              accessibilityLabel={`${tab.label} 탭`}
              accessibilityRole="tab"
              accessibilityState={{selected: active}}
              key={tab.id}
              onPress={() => setListTab(tab.id as PollListTab)}
              style={[styles.figmaFilterChip, active ? styles.figmaFilterChipActive : null]}>
              <Text style={[styles.figmaFilterText, active ? styles.figmaFilterTextActive : null]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {visiblePollCount === 0 ? (
        <Empty
          title="진행 중인 투표가 없어요"
          message="새 투표가 열리면 이곳에서 응답하고 결과를 확인할 수 있어요."
          actionLabel="다시 불러오기"
          actionAccessibilityLabel="투표 목록 다시 불러오기"
          onActionPress={loadPolls}
        />
      ) : listTab === 'active' ? (
        <>
          <Text style={styles.figmaSectionTitle}>진행 중인 투표</Text>
          {activeTabPollCount === 0 ? (
            <Text style={styles.figmaMutedText}>진행 중인 투표가 없습니다.</Text>
          ) : null}
          {pollGroups.activePolls.length > 0 ? (
            pollGroups.activePolls.slice(0, 4).map((poll) => (
              <PollListCard key={poll.id} onPress={() => openDetail(poll)} poll={poll} />
            ))
          ) : null}
          {pollGroups.scheduledPolls.length > 0 ? (
            <>
              <Text style={styles.figmaSectionTitle}>예정된 투표</Text>
              {pollGroups.scheduledPolls.slice(0, 2).map((poll) => (
                <PollListCard key={poll.id} onPress={() => openDetail(poll)} poll={poll} />
              ))}
            </>
          ) : null}
          <Text style={styles.figmaSectionTitle}>내가 응답한 투표</Text>
          {pollGroups.respondedPolls.length === 0 ? (
            <Text style={styles.figmaMutedText}>아직 응답한 투표가 없습니다.</Text>
          ) : (
            pollGroups.respondedPolls.slice(0, 2).map((poll) => (
              <PollListCard key={poll.id} onPress={() => openDetail(poll)} poll={poll} />
            ))
          )}
        </>
      ) : (
        <>
          <Text style={styles.figmaSectionTitle}>마감한 투표</Text>
          {pollGroups.recentlyClosedPolls.length === 0 ? (
            <Text style={styles.figmaMutedText}>최근 마감한 투표가 없습니다.</Text>
          ) : (
            pollGroups.recentlyClosedPolls.slice(0, 6).map((poll) => (
              <PollListCard key={poll.id} onPress={() => openDetail(poll)} poll={poll} />
            ))
          )}
        </>
      )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FigmaScreenHeader({
  canOpenAdminMode,
  chip,
  contextLabel,
  onOpenAdminMode,
  onOpenNotifications,
  title,
}: {
  canOpenAdminMode: boolean;
  chip: string;
  contextLabel: string;
  onOpenAdminMode: () => void;
  onOpenNotifications: () => void;
  title: string;
}) {
  return (
    <View style={styles.figmaHeader}>
      <FaithLogHeaderTopRow campusLabel={chip} contextLabel={contextLabel}>
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
      <Text style={styles.figmaTitle}>{title}</Text>
    </View>
  );
}

function PollDetailHeader({
  canOpenAdminMode,
  campusLabel,
  contextLabel,
  detail,
  onBack,
  onOpenAdminMode,
  onOpenNotifications,
}: {
  canOpenAdminMode: boolean;
  campusLabel: string;
  contextLabel: string;
  detail: PollDetail;
  onBack: () => void;
  onOpenAdminMode: () => void;
  onOpenNotifications: () => void;
}) {
  return (
    <>
      <FigmaScreenHeader
        canOpenAdminMode={canOpenAdminMode}
        chip={campusLabel}
        contextLabel={contextLabel}
        onOpenAdminMode={onOpenAdminMode}
        onOpenNotifications={onOpenNotifications}
        title={getPollDetailTitle(detail)}
      />
      <View style={styles.figmaHeroCard}>
        <View style={styles.figmaHeroHeaderRow}>
          <Text style={styles.figmaHeroTitle}>{detail.title}</Text>
          <Pressable
            accessibilityLabel="투표 목록으로 돌아가기"
            accessibilityRole="button"
            onPress={onBack}
            style={styles.figmaBackButton}>
            <Text style={styles.figmaBackButtonText}>목록</Text>
          </Pressable>
        </View>
        <Text style={styles.figmaHeroMeta}>
          {getPollTypeLabel(detail.pollType)} · {detail.selectionType === 'SINGLE' ? '단일 선택' : '다중 선택'} · {detail.isAnonymous ? '익명' : '응답자 공개'}
        </Text>
        <View style={styles.figmaSmallChip}>
          <Text style={styles.figmaSmallChipText}>
            {isPollActionable(detail) ? getPollDeadlineLabel(detail.endsAt) : getPollStatusLabel('CLOSED')}
          </Text>
        </View>
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
  onAddOption,
  onRetryCoffeeCatalog,
  onSubmit,
  onToggleOption,
  results,
  selectedOptionIds,
}: {
  actionState: ActionState;
  coffeeCatalog: CoffeeCatalogState;
  detail: PollDetail;
  onAddOption: () => void;
  onRetryCoffeeCatalog: () => void;
  onSubmit: () => void;
  onToggleOption: (optionId: number) => void;
  results: PollResults | null;
  selectedOptionIds: number[];
}) {
  const isOpen = isPollActionable(detail);
  const responding = actionState?.kind === 'response';
  const hasResponse = Boolean(detail.myResponse);
  const canAddOption = isOpen && isUserOptionAddAllowed(detail);

  return (
    <>
      <Text style={styles.figmaSectionTitle}>응답 선택</Text>
      {hasResponse ? (
        <InlineNotice
          message={
            isOpen
              ? '이미 응답했어요. 마감 전까지 선택을 바꾸고 다시 저장할 수 있습니다.'
              : '마감된 투표라 저장된 응답만 확인할 수 있습니다.'
          }
          tone={isOpen ? 'info' : 'warning'}
        />
      ) : null}
      {detail.pollType === 'COFFEE' ? (
        <CoffeeCatalogPanel catalog={coffeeCatalog} onRetry={onRetryCoffeeCatalog} />
      ) : null}
      {canAddOption ? (
        <Pressable
          accessibilityLabel="투표 항목 추가"
          accessibilityRole="button"
          disabled={actionState?.kind === 'optionAdd'}
          onPress={onAddOption}
          style={({pressed}) => [
            styles.addOptionButton,
            actionState?.kind === 'optionAdd' ? styles.addOptionButtonDisabled : null,
            pressed ? styles.pressed : null,
          ]}>
          <IconexIcon color={colors.primary} name="plus" size={18} strokeWidth={2} />
          <Text style={styles.addOptionButtonText}>
            {detail.pollType === 'COFFEE' ? '커피 메뉴 추가' : '항목 추가'}
          </Text>
        </Pressable>
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
            const optionResult = results?.optionResults.find((item) => item.id === option.id);
            const respondentPreview = getRespondentPreview(optionResult);

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
                <PollSelectionIcon selected={selected} type={detail.selectionType} />
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{optionTitle}</Text>
                  {optionMeta ? <Text style={styles.optionMeta}>{optionMeta}</Text> : null}
                  {respondentPreview ? (
                    <Text style={styles.optionMeta}>{respondentPreview}</Text>
                  ) : null}
                </View>
                {optionResult ? (
                  <View
                    style={[
                      styles.optionCountPill,
                      selected ? styles.optionCountPillSelected : null,
                    ]}>
                    <Text
                      style={[
                        styles.optionCountText,
                        selected ? styles.optionCountTextSelected : null,
                      ]}>
                      {`${optionResult.responseCount}명`}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
      </View>
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
        <View style={styles.commentActionRow}>
          <CompactActionButton
            accessibilityLabel={editingComment ? '댓글 수정 저장' : '댓글 등록'}
            disabled={!isOpen || submitting}
            onPress={onSubmit}
            tone="primary">
            {submitting ? '저장 중...' : editingComment ? '수정 저장' : '댓글 등록'}
          </CompactActionButton>
          {editingComment ? (
            <CompactActionButton
              accessibilityLabel="댓글 수정 취소"
              disabled={submitting}
              onPress={onCancelEdit}
              tone="secondary">
              취소
            </CompactActionButton>
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
                <View style={styles.commentAuthorBlock}>
                  <Text style={styles.commentAuthor}>{comment.name}</Text>
                  <Text style={styles.commentTime}>{formatDateTime(comment.updatedAt)}</Text>
                </View>
                {canEdit ? (
                  <View style={styles.commentHeaderActions}>
                    <CompactActionButton
                      accessibilityLabel={`${comment.name} 댓글 수정`}
                      disabled={Boolean(actionState)}
                      onPress={() => onEdit(comment)}
                      tone="secondary">
                      수정
                    </CompactActionButton>
                    <CompactActionButton
                      accessibilityLabel={`${comment.name} 댓글 삭제`}
                      disabled={Boolean(actionState)}
                      onPress={() => onDelete(comment)}
                      tone="danger">
                      {deleting ? '삭제 중...' : '삭제'}
                    </CompactActionButton>
                  </View>
                ) : comment.deleted ? (
                  <Chip label="삭제됨" />
                ) : null}
              </View>
              <Body>{comment.content}</Body>
            </View>
          );
        })
      )}
    </>
  );
}

function CompactActionButton({
  accessibilityLabel,
  children,
  disabled = false,
  onPress,
  tone,
}: {
  accessibilityLabel: string;
  children: string;
  disabled?: boolean;
  onPress: () => void;
  tone: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.commentCompactButton,
        styles[`${tone}CommentCompactButton`],
        disabled ? styles.addOptionButtonDisabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text style={[styles.commentCompactButtonText, styles[`${tone}CommentCompactButtonText`]]}>
        {children}
      </Text>
    </Pressable>
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
      <Text style={styles.figmaSectionTitle}>선택지별 명단</Text>
      {results.optionResults
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((option) => (
          <View key={option.id} style={styles.figmaOptionResultCard}>
            <View style={styles.headerRow}>
              <Text numberOfLines={2} style={styles.resultOptionTitle}>
                {option.content}
              </Text>
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
  const respondedOrClosed = poll.responded || poll.status !== 'OPEN';

  return (
    <Pressable
      accessibilityLabel={`${poll.title} 상세 보기`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.figmaPollRow, pressed ? styles.pressed : null]}>
      <View style={styles.figmaPollIcon}>
        {respondedOrClosed ? (
          <Text style={styles.figmaPollIconText}>{poll.responded ? '✓' : getPollInitial(poll.pollType)}</Text>
        ) : (
          <IconexIcon color={pollColors.text} name={getPollIcon(poll.pollType)} size={22} />
        )}
      </View>
      <View style={styles.figmaPollText}>
        <Text style={styles.figmaPollTitle}>{poll.title}</Text>
        <Text style={styles.figmaPollMeta}>
          {getPollTypeLabel(poll.pollType)} · {poll.selectionType === 'SINGLE' ? '단일 선택' : '다중 선택'} · {poll.isAnonymous ? '익명' : '공개'}
        </Text>
      </View>
      <View style={styles.figmaPollButton}>
        <Text style={styles.figmaPollButtonText}>
          {poll.responded || poll.status !== 'OPEN' ? '보기' : '투표'}
        </Text>
      </View>
    </Pressable>
  );
}

function PollSelectionIcon({
  selected,
  type,
}: {
  selected: boolean;
  type: PollDetail['selectionType'];
}) {
  if (type === 'SINGLE') {
    return (
      <View style={[styles.optionMark, styles.optionMarkRadio]}>
        {selected ? <View style={styles.optionMarkRadioDot} /> : null}
      </View>
    );
  }

  return (
    <View style={[styles.optionMark, selected ? styles.optionMarkSelected : null]}>
      {selected ? <IconexIcon color={colors.surface} name="check" size={14} strokeWidth={2.4} /> : null}
    </View>
  );
}

function UserOptionAddSheet({
  actionState,
  coffeeCatalog,
  content,
  detail,
  onCancel,
  onChangeContent,
  onSubmit,
  visible,
}: {
  actionState: ActionState;
  coffeeCatalog: CoffeeCatalogState;
  content: string;
  detail: PollDetail;
  onCancel: () => void;
  onChangeContent: (value: string) => void;
  onSubmit: (option: string | CoffeeMenu) => void;
  visible: boolean;
}) {
  const submitting = actionState?.kind === 'optionAdd';
  const isCoffee = detail.pollType === 'COFFEE';
  const trimmedContent = content.trim();
  const customDuplicate =
    !isCoffee && trimmedContent.length > 0
      ? isDuplicatePollOption(detail, coffeeCatalog, trimmedContent)
      : false;
  const customValidationMessage =
    !isCoffee && content.length > 0 && trimmedContent.length === 0
      ? '공백만 입력할 수 없습니다.'
      : customDuplicate
        ? '이미 추가된 항목입니다.'
        : null;
  const coffeeMenus =
    coffeeCatalog.status === 'success'
      ? coffeeCatalog.menus
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
      : [];

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={16}
        style={styles.sheetKeyboardRoot}>
        <View style={styles.sheetBackdrop}>
        <View style={styles.optionAddSheet}>
          <View style={styles.optionAddHeader}>
            <View style={styles.optionAddHeaderText}>
              <Text style={styles.optionAddTitle}>
                {isCoffee ? '커피 메뉴 추가' : '항목 추가'}
              </Text>
              <Text style={styles.optionAddDescription}>
                {isCoffee
                  ? '투표에 추가할 커피 메뉴를 선택해 주세요.'
                  : '새 선택지 이름을 입력해 주세요.'}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="항목 추가 닫기"
              accessibilityRole="button"
              disabled={submitting}
              onPress={onCancel}
              style={({pressed}) => [styles.optionAddClose, pressed ? styles.pressed : null]}>
              <Text style={styles.optionAddCloseText}>x</Text>
            </Pressable>
          </View>

          {isCoffee && coffeeMenus.length > 0 ? (
            <ScrollView
              contentContainerStyle={styles.optionAddMenuList}
              style={styles.optionAddScroll}>
              {coffeeMenus.map((menu) => {
                const added = isDuplicatePollOption(detail, coffeeCatalog, menu.name);

                return (
                  <Pressable
                    accessibilityLabel={`${menu.name} 항목 ${added ? '추가됨' : '추가'}`}
                    accessibilityRole="button"
                    disabled={submitting || added}
                    key={menu.id}
                    onPress={() => onSubmit(menu)}
                    style={({pressed}) => [
                      styles.optionAddMenuRow,
                      added ? styles.optionAddMenuRowAdded : null,
                      submitting ? styles.addOptionButtonDisabled : null,
                      pressed ? styles.pressed : null,
                    ]}>
                    <View style={styles.optionAddMenuText}>
                      <Text style={styles.optionAddMenuTitle}>{menu.name}</Text>
                      <Text style={styles.optionAddMenuMeta}>
                        {getCoffeeCategoryLabel(menu.category)} · {formatWon(menu.priceAmount)}
                      </Text>
                    </View>
                    <View style={styles.optionAddMenuPill}>
                      <Text style={styles.optionAddMenuPillText}>
                        {submitting ? '추가 중' : added ? '추가됨' : '추가'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <>
              {isCoffee && coffeeCatalog.status === 'error' ? (
                <InlineNotice message={getErrorMessage(coffeeCatalog.error)} tone="warning" />
              ) : null}
              <TextInput
                accessibilityLabel="추가할 투표 항목 입력"
                editable={!submitting}
                onChangeText={onChangeContent}
                placeholder={isCoffee ? '추가할 커피 메뉴명' : '추가할 항목'}
                placeholderTextColor={colors.subtleText}
                style={styles.optionAddInput}
                value={content}
              />
              {customValidationMessage ? (
                <Text style={styles.optionAddInlineError}>{customValidationMessage}</Text>
              ) : null}
              <View style={styles.optionAddActions}>
                <Pressable
                  accessibilityLabel="항목 추가 취소"
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={onCancel}
                  style={({pressed}) => [
                    styles.optionAddSecondaryButton,
                    pressed ? styles.pressed : null,
                  ]}>
                  <Text style={styles.optionAddSecondaryButtonText}>취소</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="항목 추가 저장"
                  accessibilityRole="button"
                  disabled={submitting || trimmedContent.length === 0 || customDuplicate}
                  onPress={() => onSubmit(content)}
                  style={({pressed}) => [
                    styles.optionAddPrimaryButton,
                    submitting || trimmedContent.length === 0 || customDuplicate
                      ? styles.addOptionButtonDisabled
                      : null,
                    pressed ? styles.pressed : null,
                  ]}>
                  <Text style={styles.optionAddPrimaryButtonText}>
                    {submitting ? '추가 중...' : '추가'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
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

function isUserOptionAddAllowed(detail: PollDetail) {
  if (detail.pollType === 'COFFEE') {
    return true;
  }

  if (typeof detail.allowUserOptionAdd === 'boolean') {
    return detail.allowUserOptionAdd;
  }

  return detail.pollType === 'CUSTOM';
}

async function addUserPollOptionWithMenuContractFallback({
  accessToken,
  campusId,
  content,
  menuId,
  pollId,
}: {
  accessToken: string;
  campusId: number;
  content: string;
  menuId?: number;
  pollId: number;
}) {
  const requests =
    menuId === undefined
      ? [{content}]
      : [{content, menuId}, {menuId}, {content}];
  let lastError: unknown = null;

  for (const request of requests) {
    try {
      return await addUserPollOption(accessToken, campusId, pollId, request);
    } catch (error) {
      if (!canRetryPollOptionAddWithNextContract(error)) {
        throw error;
      }

      lastError = error;
    }
  }

  throw lastError;
}

function canRetryPollOptionAddWithNextContract(error: unknown) {
  if (
    !(error instanceof FaithLogApiError) ||
    (error.detail.status !== 400 && error.detail.status !== 422)
  ) {
    return false;
  }

  const message = `${error.detail.code ?? ''} ${error.detail.message}`.toLocaleLowerCase('ko-KR');
  const nonContractErrorMarkers = [
    'duplicate',
    'already',
    'conflict',
    'closed',
    'permission',
    '이미',
    '중복',
    '권한',
    '마감',
    '종료',
  ];

  return !nonContractErrorMarkers.some((marker) => message.includes(marker));
}

function isDuplicatePollOption(
  detail: PollDetail,
  coffeeCatalog: CoffeeCatalogState,
  content: string,
) {
  const normalizedContent = normalizePollOptionLabel(content);

  return detail.options.some((option) => {
    const labels = [option.content];
    const matchedMenu = findCoffeeMenuForOption(coffeeCatalog, option.composeMenuCode);

    if (matchedMenu) {
      labels.push(matchedMenu.name);
    }

    return labels.some((label) => normalizePollOptionLabel(label) === normalizedContent);
  });
}

function normalizePollOptionLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
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

function getPollIcon(type: string): IconexIconName {
  switch (type) {
    case 'WEDNESDAY':
      return 'calendar';
    case 'SATURDAY':
      return 'calendar';
    case 'COFFEE':
      return 'receipt';
    default:
      return 'document';
  }
}

function getPollInitial(type: string) {
  switch (type) {
    case 'WEDNESDAY':
      return '수';
    case 'SATURDAY':
      return '토';
    case 'COFFEE':
      return '커';
    default:
      return '커';
  }
}

function getRespondentPreview(option: PollResults['optionResults'][number] | undefined) {
  if (!option || option.responseCount === 0 || option.respondents.length === 0) {
    return null;
  }

  const names = option.respondents.slice(0, 2).map((person) => maskKoreanName(person.name));
  const extraCount = Math.max(0, option.responseCount - names.length);

  return extraCount > 0 ? `${names.join(', ')} 외` : names.join(', ');
}

function maskKoreanName(name: string) {
  const trimmed = name.trim();

  if (trimmed.length <= 1) {
    return trimmed;
  }

  return `${trimmed.slice(0, 1)}OO`;
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
  addOptionButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  addOptionButtonDisabled: {
    opacity: 0.48,
  },
  addOptionButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
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
  commentAuthorBlock: {
    flex: 1,
    minWidth: 0,
  },
  commentActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  commentCompactButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    minHeight: 34,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 13,
  },
  commentCompactButtonText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  commentHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  commentHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  commentTime: {
    color: colors.subtleText,
    fontSize: 15,
    marginTop: 2,
  },
  figmaBackButton: {
    alignItems: 'center',
    backgroundColor: pollColors.chip,
    borderRadius: 12,
    flexShrink: 0,
    height: 34,
    justifyContent: 'center',
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
    backgroundColor: '#E8F3FF',
  },
  figmaFilterText: {
    color: pollColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  figmaFilterTextActive: {
    color: colors.primary,
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
    borderRadius: 24,
    gap: 10,
    minHeight: 120,
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  figmaHeroHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  figmaHeroMeta: {
    color: pollColors.muted,
    fontSize: 15,
    lineHeight: 20,
  },
  figmaHeroTitle: {
    color: pollColors.text,
    flex: 1,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 26,
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
    backgroundColor: '#E8F3FF',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 58,
  },
  figmaPollButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  figmaPollIcon: {
    alignItems: 'center',
    backgroundColor: pollColors.chip,
    borderRadius: 15,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  figmaPollIconText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
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
    paddingBottom: 96,
    paddingTop: 2,
  },
  figmaSectionTitle: {
    color: pollColors.text,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 28,
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
    fontSize: 21,
    fontWeight: '600',
    lineHeight: 28,
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
  keyboardRoot: {
    flex: 1,
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
    alignItems: 'center',
    borderColor: colors.textMuted,
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  optionMarkRadio: {
    borderRadius: 12,
  },
  optionMarkRadioDot: {
    backgroundColor: colors.primary,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  optionMarkSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionCountPill: {
    alignItems: 'center',
    backgroundColor: '#F2F4F6',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    minWidth: 54,
    paddingHorizontal: 12,
  },
  optionCountPillSelected: {
    backgroundColor: '#E8F3FF',
  },
  optionCountText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  optionCountTextSelected: {
    color: colors.primary,
  },
  optionAddActions: {
    flexDirection: 'row',
    gap: spacing.gap,
    marginTop: spacing.gap,
  },
  optionAddClose: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  optionAddCloseText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  optionAddDescription: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 20,
  },
  optionAddHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  optionAddHeaderText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  optionAddInput: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  optionAddInlineError: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  optionAddMenuList: {
    gap: 10,
    paddingBottom: spacing.gap,
  },
  optionAddMenuMeta: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 20,
  },
  optionAddMenuPill: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: radius.pill,
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  optionAddMenuPillText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  optionAddMenuRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: radius.item,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.gap,
    minHeight: 64,
    padding: spacing.gap,
  },
  optionAddMenuRowAdded: {
    backgroundColor: colors.borderSoft,
    opacity: 0.72,
  },
  optionAddMenuText: {
    flex: 1,
    minWidth: 0,
  },
  optionAddMenuTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  optionAddPrimaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.control,
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  optionAddPrimaryButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  optionAddScroll: {
    maxHeight: 420,
  },
  optionAddSecondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: radius.control,
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  optionAddSecondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  optionAddSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    gap: spacing.gap,
    maxHeight: '86%',
    padding: spacing.card,
    width: '100%',
  },
  optionAddTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
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
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.gap,
    minHeight: 58,
    padding: spacing.gap,
  },
  optionRowSelected: {
    backgroundColor: pollColors.card,
    borderColor: colors.primary,
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
  dangerCommentCompactButton: {
    backgroundColor: colors.dangerSoft,
  },
  dangerCommentCompactButtonText: {
    color: colors.danger,
  },
  primaryCommentCompactButton: {
    backgroundColor: colors.primary,
  },
  primaryCommentCompactButtonText: {
    color: colors.surface,
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
  resultOptionTitle: {
    color: pollColors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
    minWidth: 0,
  },
  respondentName: {
    color: colors.mutedText,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  sheetBackdrop: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetKeyboardRoot: {
    flex: 1,
  },
  secondaryCommentCompactButton: {
    backgroundColor: colors.borderSoft,
  },
  secondaryCommentCompactButtonText: {
    color: colors.textPrimary,
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
