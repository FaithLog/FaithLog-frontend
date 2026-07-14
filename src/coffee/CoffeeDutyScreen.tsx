import {memo, useEffect, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  closeAdminPoll,
  createAdminPoll,
  fetchAdminPolls,
  fetchAdminPollResults,
} from '../api/adminPollApi';
import {
  createCoffeeDutyPaymentAccount,
  deactivateCoffeeDutyPaymentAccount,
  FaithLogApiError,
  fetchAdminCampusChargesForMyAccounts,
  fetchAdminPaymentAccounts,
  fetchCoffeeBrands,
  fetchCoffeeMenus,
  fetchMyDutyAssignment,
  fetchPaymentAccounts,
} from '../api/client';
import type {
  AdminCampusChargeSummary,
  CoffeeMenu,
  DutyAssignment,
  PaymentAccount,
  PollResults,
  PollSummary,
} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {
  Body,
  Eyebrow,
  TextField,
} from '../components/ui';
import {colors, spacing} from '../theme';
import {DutyDateTimePickerModal, formatDutyDateTimeLabel} from '../duty/DutyDateTimePicker';
import {DutyPageNav} from '../duty/DutyPageNav';
import {
  DutyDateTimeField,
  DutyPollCreateHeader,
  DutyPollCreateShell,
  DutyPollTypeCard,
  DutyToggleField,
} from '../duty/DutyPollCreate';
import {
  DutyActionButton,
  DutyActionRow,
  DutyAsyncState,
  DutyConfirmSheet,
  DutyEntityCard,
  DutyFormSection,
  DutyMetricSurface,
  DutyPageScaffold,
  DutyPageSection,
  DutySectionHeader,
} from '../duty/DutyPresentation';
import {formatWon} from '../utils/money';

type CoffeeDutyLoadState =
  | {status: 'loading'}
  | {
      status: 'ready';
      accounts: PaymentAccount[];
      assignment: DutyAssignment;
      charges: AdminCampusChargeSummary | null;
      menus: CoffeeMenu[];
    }
  | {status: 'notAssigned'}
  | {status: 'error'; message: string};

type CoffeePollCreateState =
  | {status: 'idle'}
  | {status: 'creating'}
  | {status: 'success'; title: string}
  | {status: 'error'; message: string};

type CoffeePollListState =
  | {status: 'loading'}
  | {status: 'success'; polls: PollSummary[]}
  | {status: 'error'; message: string};

type CoffeePollResultState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; results: PollResults}
  | {status: 'error'; message: string};
type CoffeePollCloseState =
  | {status: 'idle'}
  | {status: 'closing'; pollId: number}
  | {status: 'success'; title: string}
  | {status: 'error'; message: string};

type CoffeePollStatusTab = 'ongoing' | 'closed';
type CoffeeDutyPage = 'summary' | 'accounts' | 'create' | 'manage';

type CoffeeAccountForm = {
  accountHolder: string;
  accountNumber: string;
  bankName: string;
  nickname: string;
};

type CoffeeAccountSaveState =
  | {status: 'idle'}
  | {status: 'saving'}
  | {status: 'success'; nickname: string}
  | {status: 'error'; message: string};

type CoffeeAccountDeleteState =
  | {status: 'idle'}
  | {status: 'deleting'; accountId: number}
  | {status: 'success'; nickname: string}
  | {status: 'error'; message: string};

type CoffeeDutyScreenProps = {
  canOpenAdminMode: boolean;
  onBack: () => void;
  onOpenAdminMode: () => void;
  onOpenNotifications: () => void;
  setAuthState: (state: AuthGateState) => void;
  state: Extract<AuthGateState, {status: 'authenticated'}>;
};

const DEFAULT_COFFEE_POLL_TITLE = '커피 주문';
const DEFAULT_DEADLINE_OFFSET_MS = 2 * 60 * 60 * 1000;
const emptyCoffeeAccountForm: CoffeeAccountForm = {
  accountHolder: '',
  accountNumber: '',
  bankName: '',
  nickname: '커피 계좌',
};
const coffeeDutyPages: Array<{id: CoffeeDutyPage; label: string}> = [
  {id: 'manage', label: '투표'},
  {id: 'create', label: '투표 생성'},
  {id: 'accounts', label: '내 계좌'},
  {id: 'summary', label: '정산'},
];
const space = {
  sm: spacing.gap,
  md: spacing.card,
  lg: spacing.screenX,
  xl: spacing.screenX + spacing.gap,
};

export function CoffeeDutyScreen({onBack, setAuthState, state}: CoffeeDutyScreenProps) {
  const [loadState, setLoadState] = useState<CoffeeDutyLoadState>({status: 'loading'});
  const [selectedMenuIds, setSelectedMenuIds] = useState<number[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [title, setTitle] = useState(DEFAULT_COFFEE_POLL_TITLE);
  const [deadlineText, setDeadlineText] = useState(() =>
    formatLocalDateTimeInput(new Date(Date.now() + DEFAULT_DEADLINE_OFFSET_MS)),
  );
  const [createState, setCreateState] = useState<CoffeePollCreateState>({status: 'idle'});
  const createPollInFlight = useRef(false);
  const [accountForm, setAccountForm] = useState<CoffeeAccountForm>(emptyCoffeeAccountForm);
  const [accountSaveState, setAccountSaveState] = useState<CoffeeAccountSaveState>({status: 'idle'});
  const [accountDeleteState, setAccountDeleteState] = useState<CoffeeAccountDeleteState>({status: 'idle'});
  const [page, setPage] = useState<CoffeeDutyPage>('manage');
  const [pollRefreshKey, setPollRefreshKey] = useState(0);
  const [createdPollId, setCreatedPollId] = useState<number | null>(null);
  const [knownOwnedCoffeeAccountIds, setKnownOwnedCoffeeAccountIds] = useState<Set<number>>(
    () => new Set(),
  );
  const campusId = state.selectedCampus.campusId;

  const load = async (ownedCoffeeAccountIdsOverride?: Set<number>) => {
    setLoadState({status: 'loading'});
    setCreateState({status: 'idle'});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const assignment = await resolveCoffeeDutyAssignment(accessToken, campusId, state);

      if (!assignment) {
        setLoadState({status: 'notAssigned'});
        return;
      }

      const [accounts, brands] = await Promise.all([
        fetchAdminPaymentAccounts(accessToken, campusId, {
          accountType: 'COFFEE',
          includeInactive: true,
        })
          .catch((error) => {
            if (isPaymentAccountListEndpointMissing(error)) {
              return fetchPaymentAccounts(accessToken, campusId, {accountType: 'COFFEE'});
            }

            throw error;
          }),
        fetchCoffeeBrands(accessToken),
      ]);
      const nextKnownOwnedCoffeeAccountIds = new Set(
        ownedCoffeeAccountIdsOverride ?? knownOwnedCoffeeAccountIds,
      );
      accounts.forEach((account) => {
        if (
          account.accountType === 'COFFEE' &&
          account.isActive !== false &&
          account.ownerUserId === state.user.id
        ) {
          nextKnownOwnedCoffeeAccountIds.add(account.id);
        }
      });
      const coffeeAccounts = getOwnedCoffeePaymentAccounts(
        accounts,
        state.user.id,
        nextKnownOwnedCoffeeAccountIds,
      );
      const nextSelectedAccountId =
        selectedAccountId && coffeeAccounts.some((account) => account.id === selectedAccountId)
          ? selectedAccountId
          : coffeeAccounts[0]?.id ?? null;
      const [menus, charges] = await Promise.all([
        Promise.all(brands.map((brand) => fetchCoffeeMenus(accessToken, brand.id))).then((groups) =>
          groups.flat(),
        ),
        fetchCoffeeChargeSummary(accessToken, campusId, nextSelectedAccountId),
      ]);

      setLoadState({
        status: 'ready',
        accounts: coffeeAccounts,
        assignment,
        charges,
        menus,
      });
      setKnownOwnedCoffeeAccountIds(nextKnownOwnedCoffeeAccountIds);
      setSelectedMenuIds((current) =>
        current.filter((menuId) => menus.some((menu) => menu.id === menuId)),
      );
      setSelectedAccountId(nextSelectedAccountId);
    } catch (error) {
      const message = getCoffeeDutyErrorMessage(error);

      if (error instanceof FaithLogApiError && error.detail.kind === 'sessionExpired') {
        setAuthState({status: 'sessionExpired', message: error.detail.message});
        return;
      }

      setLoadState({status: 'error', message});
    }
  };

  useEffect(() => {
    const emptyKnownOwnedCoffeeAccountIds = new Set<number>();
    setKnownOwnedCoffeeAccountIds(emptyKnownOwnedCoffeeAccountIds);
    void load(emptyKnownOwnedCoffeeAccountIds);
  }, [campusId, state.user.id]);

  const selectedMenus = useMemo(
    () =>
      loadState.status === 'ready'
        ? selectedMenuIds
            .map((menuId) => loadState.menus.find((menu) => menu.id === menuId))
            .filter((menu): menu is CoffeeMenu => Boolean(menu))
        : [],
    [loadState, selectedMenuIds],
  );

  const createCoffeePoll = async () => {
    if (loadState.status !== 'ready' || createPollInFlight.current) {
      return;
    }

    const trimmedTitle = title.trim();
    const endsAt = parseLocalDateTimeInput(deadlineText);

    if (!trimmedTitle) {
      setCreateState({status: 'error', message: '투표 제목을 입력해 주세요.'});
      return;
    }

    if (!endsAt || endsAt.getTime() <= Date.now()) {
      setCreateState({status: 'error', message: '마감 일시는 현재 시각 이후로 입력해 주세요.'});
      return;
    }

    const selectedAccount = loadState.accounts.find((account) => account.id === selectedAccountId);

    if (!selectedAccount) {
      setCreateState({status: 'error', message: '커피 투표를 만들려면 내가 만든 커피 계좌를 먼저 등록해 주세요.'});
      return;
    }

    const uniqueSelectedMenus = getUniqueCoffeeMenus(selectedMenus);

    if (uniqueSelectedMenus.length === 0) {
      setCreateState({status: 'error', message: '커피 메뉴를 하나 이상 선택해 주세요.'});
      return;
    }

    createPollInFlight.current = true;
    setCreateState({status: 'creating'});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const created = await createAdminPoll(accessToken, campusId, {
        chargeGenerationType: 'OPTION_PRICE',
        endsAt: endsAt.toISOString(),
        allowUserOptionAdd: true,
        isAnonymous: false,
        options: uniqueSelectedMenus.map((menu, index) => ({
          content: null,
          menuId: menu.id,
          priceAmount: null,
          sortOrder: index + 1,
        })),
        paymentAccountId: selectedAccount.id,
        paymentCategory: 'COFFEE',
        pollType: 'COFFEE',
        selectionType: 'SINGLE',
        startsAt: new Date().toISOString(),
        templateId: null,
        title: trimmedTitle,
      });

      setCreateState({status: 'success', title: trimmedTitle});
      setTitle(DEFAULT_COFFEE_POLL_TITLE);
      setSelectedMenuIds([]);
      setCreatedPollId(created.id);
      setPage('manage');
      setPollRefreshKey((current) => current + 1);
      await load();
    } catch (error) {
      setCreateState({status: 'error', message: getCoffeeDutyErrorMessage(error)});
    } finally {
      createPollInFlight.current = false;
    }
  };

  const saveCoffeeAccount = async () => {
    if (accountSaveState.status === 'saving') {
      return;
    }

    const nickname = accountForm.nickname.trim();
    const bankName = accountForm.bankName.trim();
    const accountNumber = accountForm.accountNumber.trim();
    const accountHolder = accountForm.accountHolder.trim();

    if (!nickname || !bankName || !accountNumber || !accountHolder) {
      setAccountSaveState({status: 'error', message: '계좌 정보를 모두 입력해 주세요.'});
      return;
    }

    setAccountSaveState({status: 'saving'});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const account = await createCoffeeDutyPaymentAccount(accessToken, campusId, {
        accountHolder,
        accountNumber,
        accountType: 'COFFEE',
        bankName,
        nickname,
      });
      const nextKnownOwnedCoffeeAccountIds = new Set(knownOwnedCoffeeAccountIds);
      nextKnownOwnedCoffeeAccountIds.add(account.id);

      setAccountForm(emptyCoffeeAccountForm);
      setAccountSaveState({status: 'success', nickname: account.nickname});
      setKnownOwnedCoffeeAccountIds(nextKnownOwnedCoffeeAccountIds);
      setSelectedAccountId(account.id);
      await load(nextKnownOwnedCoffeeAccountIds);
    } catch (error) {
      setAccountSaveState({status: 'error', message: getCoffeeDutyErrorMessage(error)});
    }
  };

  const deleteCoffeeAccount = async (account: PaymentAccount) => {
    if (accountDeleteState.status === 'deleting') {
      return;
    }

    setAccountDeleteState({status: 'deleting', accountId: account.id});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      await deactivateCoffeeDutyPaymentAccount(accessToken, account.id);
      setAccountDeleteState({status: 'success', nickname: account.nickname});
      setSelectedAccountId((current) => (current === account.id ? null : current));
      await load();
    } catch (error) {
      setAccountDeleteState({status: 'error', message: getCoffeeDutyErrorMessage(error)});
    }
  };

  return (
    <DutyPageScaffold
      backAccessibilityLabel="내정보로 돌아가기"
      campusName={state.selectedCampus.campusName}
      contextLabel={`${state.user.name}님`}
      domainLabel="커피"
      navigation={loadState.status === 'ready' ? (
        <DutyPageNav
            domainLabel="커피"
            items={coffeeDutyPages}
            page={page}
            onSelectPage={setPage}
          />
      ) : undefined}
      onBack={onBack}
      title="커피 정산 관리">
      {loadState.status === 'loading' ? (
        <DutyAsyncState message="커피 담당자 정보를 확인하고 있어요." status="loading" />
      ) : loadState.status === 'notAssigned' ? (
        <DutyAsyncState
          actionLabel="내정보로 돌아가기"
          message="현재 캠퍼스의 활성 커피 담당자로 지정된 경우에만 사용할 수 있어요."
          onAction={onBack}
          status="empty"
          title="커피 담당자 전용 화면입니다"
        />
      ) : loadState.status === 'error' ? (
        <DutyAsyncState
          actionLabel="다시 확인"
          message={loadState.message}
          onAction={() => void load()}
          status="error"
          title="커피 관리 정보를 불러오지 못했습니다"
        />
      ) : (
        <>
          {page === 'summary' ? (
            <CoffeeSettlementSummary onRefresh={() => void load()} state={loadState} />
          ) : null}
          {page === 'accounts' ? (
            <CoffeeAccountManagement
              deleteState={accountDeleteState}
              form={accountForm}
              onChangeForm={(patch) => setAccountForm((current) => ({...current, ...patch}))}
              onDeleteAccount={deleteCoffeeAccount}
              onRefresh={() => void load()}
              onSave={saveCoffeeAccount}
              saveState={accountSaveState}
              state={loadState}
            />
          ) : null}
          {page === 'create' ? (
            <CoffeePollCreator
              createState={createState}
              deadlineText={deadlineText}
              onCreate={createCoffeePoll}
              onDeadlineChange={setDeadlineText}
              onOpenAccounts={() => setPage('accounts')}
              onRefresh={() => void load()}
              onSelectAccount={setSelectedAccountId}
              onToggleMenu={(menuId) =>
                setSelectedMenuIds((current) =>
                  current.includes(menuId)
                    ? current.filter((selectedId) => selectedId !== menuId)
                    : Array.from(new Set([...current, menuId])),
                )
              }
              onTitleChange={setTitle}
              selectedAccountId={selectedAccountId}
              selectedMenuIds={selectedMenuIds}
              state={loadState}
              title={title}
            />
          ) : null}
          {page === 'manage' ? (
            <CoffeePollManagement
              campusId={campusId}
              focusPollId={createdPollId}
              onRefreshSettlement={() => load()}
              refreshKey={pollRefreshKey}
              setAuthState={setAuthState}
            />
          ) : null}
        </>
      )}
    </DutyPageScaffold>
  );
}

function CoffeeSettlementSummary({
  onRefresh,
  state,
}: {
  onRefresh: () => void;
  state: Extract<CoffeeDutyLoadState, {status: 'ready'}>;
}) {
  const charges = state.charges;
  const unpaidAmount = charges?.summary.unpaidAmount ?? 0;
  const memberCount = charges?.members.filter((member) => member.unpaidAmount > 0).length ?? 0;

  return (
    <DutyPageSection>
      <DutySectionHeader
        action={<DutyActionButton accessibilityLabel="커피 정산 새로고침" label="새로고침" onPress={onRefresh} />}
        description="내 커피 계좌에 연결된 청구와 미납 현황을 확인할 수 있어요."
        eyebrow="내 정산"
        title="커피 정산 현황"
      />
      <DutyMetricSurface label="미납 합계" value={formatWon(unpaidAmount)}>
        <Text style={styles.summaryBody}>
          미납 {memberCount}명 · 커피 계좌 {state.accounts.length}개 · 담당자 {state.assignment.name}
        </Text>
      </DutyMetricSurface>
      {charges?.members.length ? (
        <View style={styles.optionList}>
          {charges.members.slice(0, 5).map((member) => (
            <DutyEntityCard
              key={member.userId}
              statusLabel={formatWon(member.unpaidAmount)}
              statusTone="warning"
              title={member.name}
            />
          ))}
        </View>
      ) : (
        <DutyAsyncState message="표시할 커피 미납 내역이 없습니다." status="empty" />
      )}
    </DutyPageSection>
  );
}

function CoffeeAccountManagement({
  deleteState,
  form,
  onChangeForm,
  onDeleteAccount,
  onRefresh,
  onSave,
  saveState,
  state,
}: {
  deleteState: CoffeeAccountDeleteState;
  form: CoffeeAccountForm;
  onChangeForm: (patch: Partial<CoffeeAccountForm>) => void;
  onDeleteAccount: (account: PaymentAccount) => void;
  onRefresh: () => void;
  onSave: () => void;
  saveState: CoffeeAccountSaveState;
  state: Extract<CoffeeDutyLoadState, {status: 'ready'}>;
}) {
  const busy = saveState.status === 'saving' || deleteState.status === 'deleting';
  const [deleteTarget, setDeleteTarget] = useState<PaymentAccount | null>(null);

  return (
    <>
      <DutyPageSection>
        <DutySectionHeader
          action={<DutyActionButton accessibilityLabel="커피 계좌 새로고침" label="새로고침" onPress={onRefresh} />}
          description="커피 정산에 사용할 내 계좌를 관리할 수 있어요."
          eyebrow="내 계좌"
          title="정산 계좌 관리"
        />
        {state.accounts.length === 0 ? (
          <DutyAsyncState message="아래에서 청구에 사용할 본인 계좌를 등록해 주세요." status="empty" title="등록된 커피 계좌가 없습니다" />
        ) : (
          <View style={styles.optionList}>
            {state.accounts.map((account) => (
              <DutyEntityCard
                key={account.id}
                statusLabel="활성"
                statusTone="success"
                subtitle={`${account.bankName} ${account.accountNumber}`}
                title={account.nickname}>
                <Text style={styles.selectMeta}>예금주 {account.accountHolder}</Text>
                <DutyActionButton
                  accessibilityLabel={`${account.nickname} 계좌 삭제`}
                  busy={deleteState.status === 'deleting' && deleteState.accountId === account.id}
                  disabled={busy && !(deleteState.status === 'deleting' && deleteState.accountId === account.id)}
                  label={deleteState.status === 'deleting' && deleteState.accountId === account.id ? '삭제 중' : '삭제'}
                  onPress={() => setDeleteTarget(account)}
                  variant="danger"
                />
              </DutyEntityCard>
            ))}
          </View>
        )}
        {deleteState.status === 'success' ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{deleteState.nickname} 계좌를 삭제했습니다.</Text>
          </View>
        ) : null}
        {deleteState.status === 'error' ? <CoffeeInlineError message={deleteState.message} /> : null}
      </DutyPageSection>
      <CoffeeAccountDeleteConfirmModal
        account={deleteTarget}
        busy={deleteState.status === 'deleting'}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) {
            return;
          }

          onDeleteAccount(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      <DutyFormSection>
        <DutySectionHeader description="커피 담당자가 받을 커피 금액 계좌만 등록합니다." eyebrow="계좌 등록" title="커피 정산 계좌 추가" />
        <TextField
          accessibilityLabel="커피 계좌 별칭"
          label="별칭"
          onChangeText={(nickname) => onChangeForm({nickname})}
          placeholder="커피 계좌"
          value={form.nickname}
        />
        <TextField
          accessibilityLabel="커피 계좌 은행명"
          label="은행"
          onChangeText={(bankName) => onChangeForm({bankName})}
          placeholder="카카오뱅크"
          value={form.bankName}
        />
        <TextField
          accessibilityLabel="커피 계좌번호"
          label="계좌번호"
          onChangeText={(accountNumber) => onChangeForm({accountNumber})}
          placeholder="3333-33-333333"
          value={form.accountNumber}
        />
        <TextField
          accessibilityLabel="커피 계좌 예금주"
          label="예금주"
          onChangeText={(accountHolder) => onChangeForm({accountHolder})}
          placeholder="커피 담당자"
          value={form.accountHolder}
        />
        {saveState.status === 'success' ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{saveState.nickname} 계좌를 등록했습니다.</Text>
          </View>
        ) : null}
        {saveState.status === 'error' ? <CoffeeInlineError message={saveState.message} /> : null}
        <DutyActionButton
          accessibilityLabel="커피 계좌 등록"
          busy={busy}
          label={busy ? '저장 중...' : '커피 계좌 저장'}
          onPress={onSave}
          variant="primary"
        />
      </DutyFormSection>
    </>
  );
}

function CoffeePollCreator({
  createState,
  deadlineText,
  onCreate,
  onDeadlineChange,
  onOpenAccounts,
  onRefresh,
  onSelectAccount,
  onTitleChange,
  onToggleMenu,
  selectedAccountId,
  selectedMenuIds,
  state,
  title,
}: {
  createState: CoffeePollCreateState;
  deadlineText: string;
  onCreate: () => void;
  onDeadlineChange: (value: string) => void;
  onOpenAccounts: () => void;
  onRefresh: () => void;
  onSelectAccount: (accountId: number) => void;
  onTitleChange: (value: string) => void;
  onToggleMenu: (menuId: number) => void;
  selectedAccountId: number | null;
  selectedMenuIds: number[];
  state: Extract<CoffeeDutyLoadState, {status: 'ready'}>;
  title: string;
}) {
  const busy = createState.status === 'creating';
  const [menuPickerVisible, setMenuPickerVisible] = useState(false);
  const [deadlinePickerVisible, setDeadlinePickerVisible] = useState(false);
  const selectedMenus = state.menus.filter((menu) => selectedMenuIds.includes(menu.id));
  const missingOwnedCoffeeAccount = state.accounts.length === 0;

  return (
    <DutyPollCreateShell>
      <DutyPollCreateHeader
        description="메뉴와 마감 시간을 정해 커피 주문 투표를 시작하세요."
        title="커피 투표 생성"
      />
      <DutyPollTypeCard
        description="커피 메뉴 가격으로 정산이 연결되고 사용자 항목 추가가 허용됩니다."
        iconLabel="커"
        title="커피 주문"
      />

      <DutyFormSection>
        <Eyebrow>투표 제목</Eyebrow>
        <TextField label="제목" onChangeText={onTitleChange} value={title} />
      </DutyFormSection>

      <DutyDateTimeField
        accessibilityLabel="커피 투표 마감 일시 선택"
        disabled={busy}
        label="마감 일시"
        onPress={() => setDeadlinePickerVisible(true)}
        value={formatDutyDateTimeLabel(
          parseLocalDateTimeInput(deadlineText)
            ?? new Date(Date.now() + DEFAULT_DEADLINE_OFFSET_MS),
        )}
      />
      <DutyDateTimePickerModal
        minimumDate={new Date()}
        onApply={(value) => {
          onDeadlineChange(formatLocalDateTimeInput(value));
          setDeadlinePickerVisible(false);
        }}
        onClose={() => setDeadlinePickerVisible(false)}
        value={
          parseLocalDateTimeInput(deadlineText)
            ?? new Date(Date.now() + DEFAULT_DEADLINE_OFFSET_MS)
        }
        visible={deadlinePickerVisible}
      />

      <DutyFormSection>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Eyebrow>선택지</Eyebrow>
            <Body>메뉴 이름과 금액을 보고 투표에 넣을 항목을 고릅니다.</Body>
          </View>
          <Pressable
            accessibilityLabel="커피 메뉴 추가 모달 열기"
            accessibilityRole="button"
            onPress={() => setMenuPickerVisible(true)}
            style={({pressed}) => [styles.pollCreateAddOption, pressed ? styles.pressed : null]}>
            <Text style={styles.pollCreateAddOptionText}>메뉴 추가</Text>
          </Pressable>
        </View>
        {state.menus.length === 0 ? (
          <CoffeeInlineError message="커피 메뉴를 불러오지 못했습니다." />
        ) : (
          <View style={styles.pollCreateOptionList}>
            {selectedMenus.length === 0 ? (
              <Text style={styles.summaryBody}>선택된 커피 메뉴가 없습니다.</Text>
            ) : (
              selectedMenus.map((menu, index) => (
                <View key={menu.id} style={styles.pollCreateOptionRow}>
                  <View style={styles.pollCreateOptionNumber}>
                    <Text style={styles.pollCreateOptionNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.pollCreateOptionField}>
                    <Text style={styles.selectTitle}>{menu.name}</Text>
                    <Text style={styles.selectMeta}>{formatWon(menu.priceAmount)}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`${menu.name} 메뉴 제거`}
                    accessibilityRole="button"
                    onPress={() => onToggleMenu(menu.id)}
                    style={({pressed}) => [
                      styles.pollCreateRemoveOption,
                      pressed ? styles.pressed : null,
                    ]}>
                    <Text style={styles.pollCreateRemoveOptionText}>x</Text>
                  </Pressable>
                </View>
              ))
            )}
            {menuPickerVisible ? (
              <CoffeeMenuPickerModal
                menus={state.menus}
                onClose={() => setMenuPickerVisible(false)}
                onRefresh={onRefresh}
                onSelectMenu={(menuId) => {
                  onToggleMenu(menuId);
                  setMenuPickerVisible(false);
                }}
                selectedMenuIds={selectedMenuIds}
              />
            ) : null}
          </View>
        )}
      </DutyFormSection>

      <DutyFormSection>
        <Eyebrow>청구 계좌</Eyebrow>
        {missingOwnedCoffeeAccount ? (
          <>
            <CoffeeInlineError message="커피 투표를 만들려면 내가 만든 커피 계좌를 먼저 등록해 주세요." />
            <DutyActionButton
              accessibilityLabel="커피 계좌 등록 화면으로 이동"
              disabled={busy}
              label="계좌 등록"
              onPress={onOpenAccounts}
            />
          </>
        ) : (
          <View style={styles.optionList}>
            {state.accounts.map((account) => {
              const selected = account.id === selectedAccountId;

              return (
                <Pressable
                  accessibilityLabel={`${account.nickname} 커피 계좌 선택`}
                  accessibilityRole="button"
                  key={account.id}
                  onPress={() => onSelectAccount(account.id)}
                  style={({pressed}) => [
                    styles.selectRow,
                    selected ? styles.selectRowActive : null,
                    pressed ? styles.pressed : null,
                  ]}>
                  <Text style={styles.selectTitle}>{account.nickname}</Text>
                  <Text style={styles.selectMeta}>
                    커피 · {account.bankName} {account.accountNumber}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </DutyFormSection>

      <DutyToggleField
        accessibilityLabel="커피 투표 사용자 항목 추가 허용"
        checked
        description="커피 투표는 사용자가 필요한 커피 항목을 추가할 수 있게 고정합니다."
        disabled
        onPress={() => undefined}
        title="일반 사용자 항목 추가"
      />

      {createState.status === 'success' ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{createState.title} 투표를 생성했습니다.</Text>
        </View>
      ) : null}
      {createState.status === 'error' ? <CoffeeInlineError message={createState.message} /> : null}

      <DutyActionRow>
        <DutyActionButton
          accessibilityLabel="커피 주문 투표 생성"
          busy={busy}
          disabled={missingOwnedCoffeeAccount}
          label={busy ? '생성 중...' : '투표 생성'}
          onPress={onCreate}
          variant="primary"
        />
      </DutyActionRow>
    </DutyPollCreateShell>
  );
}

function CoffeeAccountDeleteConfirmModal({
  account,
  busy,
  onCancel,
  onConfirm,
}: {
  account: PaymentAccount | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <DutyConfirmSheet
      busy={busy}
      cancelAccessibilityLabel="커피 계좌 삭제 취소"
      confirmAccessibilityLabel="커피 계좌 삭제 확인"
      confirmLabel="삭제"
      message={account ? `${account.nickname} 계좌는 새 커피 정산에 사용할 수 없게 됩니다.` : '선택한 커피 계좌를 삭제합니다.'}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title="커피 계좌를 삭제할까요?"
      visible={Boolean(account)}>
      {account ? (
        <DutyEntityCard subtitle={`${account.bankName} ${account.accountNumber}`} title={account.nickname}>
          <Text style={styles.selectMeta}>예금주 {account.accountHolder}</Text>
        </DutyEntityCard>
      ) : null}
    </DutyConfirmSheet>
  );
}

function CoffeeMenuPickerModal({
  menus,
  onClose,
  onRefresh,
  onSelectMenu,
  selectedMenuIds,
}: {
  menus: CoffeeMenu[];
  onClose: () => void;
  onRefresh: () => void;
  onSelectMenu: (menuId: number) => void;
  selectedMenuIds: number[];
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent={true}
      visible>
      <View style={styles.modalScrim}>
        <View style={styles.menuSheet}>
          <View style={styles.menuSheetHeader}>
            <View style={styles.headerText}>
              <Text style={styles.pollCreateTitle}>커피 메뉴 추가</Text>
              <Text style={styles.pollCreateDescription}>
                투표에 넣을 메뉴를 선택하세요.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="커피 메뉴 추가 모달 닫기"
              accessibilityRole="button"
              onPress={onClose}
              style={({pressed}) => [styles.menuSheetClose, pressed ? styles.pressed : null]}>
              <Text style={styles.pollCreateRemoveOptionText}>x</Text>
            </Pressable>
          </View>
          {menus.length === 0 ? (
            <View style={styles.menuSheetEmpty}>
              <Text style={styles.summaryBody}>추가할 수 있는 메뉴가 없습니다.</Text>
              <Pressable
                accessibilityLabel="커피 메뉴 다시 불러오기"
                accessibilityRole="button"
                onPress={onRefresh}
                style={({pressed}) => [styles.pollCreateAddOption, pressed ? styles.pressed : null]}>
                <Text style={styles.pollCreateAddOptionText}>새로고침</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              contentContainerStyle={styles.menuSheetScrollContent}
              data={menus}
              initialNumToRender={12}
              keyExtractor={(menu) => String(menu.id)}
              maxToRenderPerBatch={12}
              renderItem={({item}) => (
                <CoffeeMenuPickerRow
                  added={selectedMenuIds.includes(item.id)}
                  menu={item}
                  onSelect={onSelectMenu}
                />
              )}
              style={styles.menuSheetScroll}
              windowSize={7}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const CoffeeMenuPickerRow = memo(function CoffeeMenuPickerRow({
  added,
  menu,
  onSelect,
}: {
  added: boolean;
  menu: CoffeeMenu;
  onSelect: (menuId: number) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${menu.name} 메뉴 ${added ? '추가됨' : '추가'}`}
      accessibilityRole="button"
      accessibilityState={{disabled: added, selected: added}}
      disabled={added}
      onPress={() => onSelect(menu.id)}
      style={({pressed}) => [
        styles.coffeeMenuRow,
        added ? styles.coffeeMenuRowAdded : null,
        pressed ? styles.pressed : null,
      ]}>
      <View style={styles.headerText}>
        <Text style={styles.selectTitle}>{menu.name}</Text>
        <Text style={styles.selectMeta}>{formatWon(menu.priceAmount)}</Text>
      </View>
      <View style={[styles.pollCreateSelectPill, added ? styles.pollCreateSelectPillAdded : null]}>
        <Text
          style={[
            styles.pollCreateSelectPillText,
            added ? styles.pollCreateSelectPillTextAdded : null,
          ]}>
          {added ? '추가됨' : '추가'}
        </Text>
      </View>
    </Pressable>
  );
});

function CoffeePollManagement({
  campusId,
  focusPollId,
  onRefreshSettlement,
  refreshKey,
  setAuthState,
}: {
  campusId: number;
  focusPollId: number | null;
  onRefreshSettlement: () => Promise<void>;
  refreshKey: number;
  setAuthState: (state: AuthGateState) => void;
}) {
  const [tab, setTab] = useState<CoffeePollStatusTab>('ongoing');
  const [listState, setListState] = useState<CoffeePollListState>({status: 'loading'});
  const [selectedPollId, setSelectedPollId] = useState<number | null>(null);
  const [resultState, setResultState] = useState<CoffeePollResultState>({status: 'idle'});
  const [closeState, setCloseState] = useState<CoffeePollCloseState>({status: 'idle'});
  const [closeTarget, setCloseTarget] = useState<PollSummary | null>(null);

  const loadPolls = async () => {
    setListState({status: 'loading'});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const polls = await fetchAdminPolls(accessToken, campusId);
      setListState({
        status: 'success',
        polls: polls.filter((poll) => poll.pollType === 'COFFEE'),
      });
    } catch (error) {
      if (error instanceof FaithLogApiError && error.detail.kind === 'sessionExpired') {
        setAuthState({status: 'sessionExpired', message: error.detail.message});
        return;
      }

      setListState({status: 'error', message: getCoffeeDutyErrorMessage(error)});
    }
  };

  const loadResults = async (poll: PollSummary) => {
    setSelectedPollId(poll.id);
    setResultState({status: 'loading'});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const results = await fetchAdminPollResults(accessToken, campusId, poll.id);
      setResultState({status: 'success', results});
    } catch (error) {
      if (error instanceof FaithLogApiError && error.detail.kind === 'sessionExpired') {
        setAuthState({status: 'sessionExpired', message: error.detail.message});
        return;
      }

      setResultState({status: 'error', message: getCoffeeDutyErrorMessage(error)});
    }
  };

  const closeCoffeePoll = async () => {
    if (!closeTarget || closeState.status === 'closing') {
      return;
    }

    const target = closeTarget;
    setCloseState({status: 'closing', pollId: target.id});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const closed = await closeAdminPoll(accessToken, campusId, target.id);
      setCloseTarget(null);
      setCloseState({status: 'success', title: closed.title});
      setSelectedPollId(closed.id);
      await loadPolls();
      await loadResults({
        ...target,
        status: closed.status,
      });
      await onRefreshSettlement();
    } catch (error) {
      if (error instanceof FaithLogApiError && error.detail.kind === 'sessionExpired') {
        setAuthState({status: 'sessionExpired', message: error.detail.message});
        return;
      }

      setCloseState({status: 'error', message: getCoffeeDutyErrorMessage(error)});
    }
  };

  useEffect(() => {
    setTab('ongoing');
    setSelectedPollId(null);
    setResultState({status: 'idle'});
    setCloseState({status: 'idle'});
    setCloseTarget(null);
    void loadPolls();
  }, [campusId, refreshKey]);

  const polls =
    listState.status === 'success'
      ? prioritizePolls(getCoffeePollsByTab(listState.polls, tab, focusPollId), focusPollId)
      : [];
  const counts =
    listState.status === 'success'
      ? {
          closed: getCoffeePollsByTab(listState.polls, 'closed').length,
          ongoing: getCoffeePollsByTab(listState.polls, 'ongoing').length,
        }
      : {closed: 0, ongoing: 0};

  return (
    <DutyPageSection>
      <DutySectionHeader
        action={<DutyActionButton accessibilityLabel="커피 투표 목록 새로고침" label="새로고침" onPress={loadPolls} />}
        description="커피 투표만 관리합니다. 일반 투표와 반복 템플릿은 관리자 화면에서 처리합니다."
        eyebrow="투표 관리"
        title="커피 투표 현황"
      />

      <View style={styles.segmentedControl}>
        <CoffeePollTabButton
          active={tab === 'ongoing'}
          count={counts.ongoing}
          label="진행 중"
          onPress={() => setTab('ongoing')}
        />
        <CoffeePollTabButton
          active={tab === 'closed'}
          count={counts.closed}
          label="마감"
          onPress={() => setTab('closed')}
        />
      </View>

      {listState.status === 'loading' ? (
        <DutyAsyncState message="커피 투표를 불러오고 있어요." status="loading" />
      ) : listState.status === 'error' ? (
        <DutyAsyncState actionLabel="다시 불러오기" message={listState.message} onAction={() => void loadPolls()} status="error" title="커피 투표를 불러오지 못했습니다" />
      ) : polls.length === 0 ? (
        <DutyAsyncState message="새 투표를 만들면 이곳에서 진행 상태를 확인할 수 있어요." status="empty" title="표시할 커피 투표가 없습니다" />
      ) : (
        <View style={styles.optionList}>
          {polls.map((poll) => (
            <DutyEntityCard
              key={poll.id}
              statusLabel={getPollStatusLabel(poll.status)}
              statusTone={isEndedPoll(poll, Date.now()) ? 'default' : 'success'}
              subtitle={`마감 ${formatDateTime(poll.endsAt)}`}
              title={poll.title}>
              <DutyActionRow>
                <DutyActionButton
                  accessibilityLabel={`${poll.title} 결과 보기`}
                  label="결과"
                  onPress={() => void loadResults(poll)}
                  selected={selectedPollId === poll.id}
                />
              {!isEndedPoll(poll, Date.now()) ? (
                <DutyActionButton
                  accessibilityLabel={`${poll.title} 투표 종료`}
                  label="종료"
                  onPress={() => setCloseTarget(poll)}
                  variant="danger"
                />
              ) : null}
              </DutyActionRow>
            </DutyEntityCard>
          ))}
        </View>
      )}

      {closeState.status === 'success' ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{closeState.title} 투표를 종료했습니다.</Text>
        </View>
      ) : null}
      {closeState.status === 'error' ? <CoffeeInlineError message={closeState.message} /> : null}

      <CoffeePollResultPanel state={resultState} />
      <CoffeePollCloseConfirmModal
        busy={closeState.status === 'closing'}
        onCancel={() => setCloseTarget(null)}
        onConfirm={closeCoffeePoll}
        poll={closeTarget}
      />
    </DutyPageSection>
  );
}

function CoffeePollCloseConfirmModal({
  busy,
  onCancel,
  onConfirm,
  poll,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  poll: PollSummary | null;
}) {
  return (
    <DutyConfirmSheet
      busy={busy}
      cancelAccessibilityLabel="커피 투표 종료 취소"
      confirmAccessibilityLabel="커피 투표 종료 확인"
      confirmLabel="투표 종료"
      message={poll ? `${poll.title} 투표를 즉시 마감합니다. 종료 후에는 응답을 추가할 수 없습니다.` : '선택한 커피 투표를 종료합니다.'}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title="커피 투표를 종료할까요?"
      visible={Boolean(poll)}>
      {poll ? <DutyEntityCard subtitle={`${getPollStatusLabel(poll.status)} · ${formatDateTime(poll.endsAt)}`} title={poll.title} /> : null}
    </DutyConfirmSheet>
  );
}

function CoffeePollTabButton({
  active,
  count,
  label,
  onPress,
}: {
  active: boolean;
  count: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} 커피 투표 보기`}
      accessibilityRole="button"
      accessibilityState={{selected: active}}
      onPress={onPress}
      style={({pressed}) => [
        styles.segmentedButton,
        active ? styles.segmentedButtonActive : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text style={[styles.segmentedButtonText, active ? styles.segmentedButtonTextActive : null]}>
        {label} {count}
      </Text>
    </Pressable>
  );
}

function CoffeePollResultPanel({state}: {state: CoffeePollResultState}) {
  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'loading') {
    return <DutyAsyncState message="투표 결과를 불러오고 있어요." status="loading" />;
  }

  if (state.status === 'error') {
    return <DutyAsyncState message={state.message} status="error" title="투표 결과를 불러오지 못했습니다" />;
  }

  return (
    <DutyFormSection>
      <DutySectionHeader
        description={`응답 ${state.results.respondedCount}명 · 미응답 ${state.results.notRespondedCount}명`}
        eyebrow="투표 결과"
        title={state.results.title}
      />
      {state.results.optionResults.map((option) => (
        <DutyEntityCard key={option.id} statusLabel={`${option.responseCount}명`} statusTone="info" title={option.content}>
          {state.results.anonymous ? (
            <Text style={styles.selectMeta}>익명 투표라 응답자 명단은 표시하지 않습니다.</Text>
          ) : option.respondents.length === 0 ? (
            <Text style={styles.selectMeta}>아직 선택한 사람이 없습니다.</Text>
          ) : (
            <View style={styles.respondentWrap}>
              {option.respondents.map((respondent) => (
                <View key={`${option.id}-${respondent.userId}`} style={styles.respondentChip}>
                  <Text numberOfLines={1} style={styles.respondentText}>
                    {respondent.name}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </DutyEntityCard>
      ))}
    </DutyFormSection>
  );
}

async function resolveAccessToken(setAuthState: (state: AuthGateState) => void) {
  return resolveCurrentAccessToken(() => {
    setAuthState({
      status: 'sessionExpired',
      message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
    });
  });
}

async function fetchCoffeeChargeSummary(
  accessToken: string,
  campusId: number,
  paymentAccountId: number | null,
) {
  if (paymentAccountId === null) {
    return null;
  }

  return fetchAdminCampusChargesForMyAccounts(accessToken, campusId, {
    paymentAccountId,
    paymentCategory: 'COFFEE',
    size: 10,
    status: 'ALL',
  });
}

function getOwnedCoffeePaymentAccounts(
  accounts: PaymentAccount[],
  currentUserId: number,
  knownOwnedCoffeeAccountIds: Set<number>,
) {
  return accounts.filter((account) => {
    if (account.accountType !== 'COFFEE' || account.isActive === false) {
      return false;
    }

    if (account.ownerUserId === currentUserId) {
      return true;
    }

    return (
      (account.ownerUserId === undefined || account.ownerUserId === null) &&
      knownOwnedCoffeeAccountIds.has(account.id)
    );
  });
}

function isPaymentAccountListEndpointMissing(error: unknown) {
  return (
    error instanceof FaithLogApiError &&
    (error.detail.status === 404 || error.detail.status === 501)
  );
}

async function resolveCoffeeDutyAssignment(
  accessToken: string,
  campusId: number,
  state: Extract<AuthGateState, {status: 'authenticated'}>,
) {
  const duty = await fetchMyDutyAssignment(accessToken, campusId);

  if (duty.dutyType !== 'COFFEE' || !duty.isActive || duty.userId !== state.user.id) {
    return null;
  }

  return {
    assignedAt: '',
    assignmentId: 0,
    campusId: duty.campusId,
    dutyType: duty.dutyType,
    email: state.user.email,
    isActive: duty.isActive,
    name: state.user.name,
    userId: duty.userId,
  };
}

function getCoffeeDutyErrorMessage(error: unknown) {
  if (error instanceof FaithLogApiError) {
    if (error.detail.kind === 'permissionDenied') {
      return '현재 계정으로 커피 계좌를 변경할 권한이 없습니다. 커피 담당자 권한이 배포 API에 반영됐는지 확인해 주세요.';
    }

    return error.detail.message;
  }

  return '커피 관리 정보를 불러오지 못했습니다.';
}

function CoffeeInlineError({message}: {message: string}) {
  return (
    <View accessibilityRole="alert" style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function formatLocalDateTimeInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function parseLocalDateTimeInput(value: string) {
  const normalized = value.trim().replace('T', ' ');
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function getCoffeePollsByTab(
  polls: PollSummary[],
  tab: CoffeePollStatusTab,
  focusPollId: number | null = null,
) {
  const now = Date.now();

  const sortedPolls = polls
    .filter((poll) => {
      const ended = isEndedPoll(poll, now);

      return tab === 'closed' ? ended : !ended;
    })
    .slice()
    .sort((left, right) => {
      const leftTime = getSortablePollEndTime(left);
      const rightTime = getSortablePollEndTime(right);

      return tab === 'closed' ? rightTime - leftTime : leftTime - rightTime;
    });

  return includeFocusedCoffeePoll(sortedPolls, focusPollId);
}

function includeFocusedCoffeePoll(polls: PollSummary[], focusPollId: number | null) {
  const limitedPolls = polls.slice(0, 10);

  if (focusPollId === null || limitedPolls.some((poll) => poll.id === focusPollId)) {
    return limitedPolls;
  }

  const focusedPoll = polls.find((poll) => poll.id === focusPollId);

  if (!focusedPoll) {
    return limitedPolls;
  }

  return [focusedPoll, ...limitedPolls].slice(0, 10);
}

function prioritizePolls(polls: PollSummary[], focusPollId: number | null) {
  if (focusPollId === null) {
    return polls;
  }

  return polls.slice().sort((left, right) => {
    if (left.id === focusPollId) {
      return -1;
    }

    if (right.id === focusPollId) {
      return 1;
    }

    return 0;
  });
}

function getUniqueCoffeeMenus(menus: CoffeeMenu[]) {
  const seenIds = new Set<number>();

  return menus.filter((menu) => {
    if (seenIds.has(menu.id)) {
      return false;
    }

    seenIds.add(menu.id);
    return true;
  });
}

function isEndedPoll(poll: PollSummary, now: number) {
  return poll.status === 'CLOSED' || getSortablePollEndTime(poll) <= now;
}

function getSortablePollEndTime(poll: PollSummary) {
  const time = new Date(poll.endsAt).getTime();

  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${month}월 ${day}일 ${hour}:${minute}`;
}

function getPollStatusLabel(status: string) {
  switch (status) {
    case 'OPEN':
      return '진행 중';
    case 'CLOSED':
      return '마감';
    default:
      return status;
  }
}

const styles = StyleSheet.create({
  accountDeleteButton: {
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 58,
    paddingHorizontal: 12,
  },
  accountDeleteButtonText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  accountDeleteConfirmButton: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
  },
  accountDeleteConfirmButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '800',
  },
  accountRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.md,
    justifyContent: 'space-between',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 18,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backButtonText: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 32,
  },
  content: {
    gap: space.md,
    paddingBottom: 130,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  closeButtonText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  frame: {
    backgroundColor: colors.background,
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  header: {
    gap: space.sm,
    marginBottom: space.sm,
  },
  headerText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  campusChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.borderSoft,
    borderRadius: 14,
    maxWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  campusChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  inputBlock: {
    gap: space.sm,
    marginTop: space.md,
  },
  inputLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  kicker: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  memberAmount: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  memberList: {
    gap: space.sm,
    marginTop: space.md,
  },
  memberName: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  memberRow: {
    alignItems: 'center',
    borderTopColor: colors.borderSoft,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space.sm,
  },
  menuChip: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  menuChipActive: {
    backgroundColor: colors.mint,
    borderColor: colors.faith,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  menuName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  menuNameActive: {
    color: colors.textPrimary,
  },
  menuPrice: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  optionList: {
    gap: space.sm,
  },
  pressed: {
    opacity: 0.75,
  },
  coffeeMenuList: {
    gap: 10,
  },
  coffeeMenuRow: {
    alignItems: 'center',
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 74,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  coffeeMenuRowAdded: {
    backgroundColor: colors.borderSoft,
    opacity: 0.72,
  },
  menuSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: space.md,
    maxHeight: '78%',
    padding: space.lg,
    shadowColor: colors.textPrimary,
    shadowOffset: {width: 0, height: -8},
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  menuSheetClose: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  menuSheetEmpty: {
    gap: space.md,
  },
  menuSheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: space.md,
    justifyContent: 'space-between',
  },
  menuSheetScroll: {
    maxHeight: 430,
  },
  menuSheetScrollContent: {
    gap: 10,
    paddingBottom: space.md,
  },
  modalScrim: {
    backgroundColor: 'rgba(25, 31, 40, 0.32)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  dateTimeInput: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 25,
    margin: 0,
    padding: 0,
  },
  dateTimeSelectCard: {
    backgroundColor: colors.borderSoft,
    borderRadius: 18,
    gap: 6,
    minHeight: 82,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateTimeSelectHint: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  dateTimeSelectLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  dateTimeSelectValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 25,
  },
  deletePreviewBox: {
    backgroundColor: colors.borderSoft,
    borderRadius: 14,
    gap: 4,
    padding: space.md,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    justifyContent: 'space-between',
  },
  pollCreateActionDisabled: {
    opacity: 0.48,
  },
  pollCreateAddOption: {
    alignItems: 'center',
    backgroundColor: '#E8F3FF',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  pollCreateAddOptionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  pollCreateCtaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pollCreateDescription: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  pollCreateHeader: {
    gap: 6,
  },
  pollCreateOptionField: {
    flex: 1,
    minWidth: 0,
  },
  pollCreateOptionList: {
    gap: 12,
  },
  pollCreateOptionNumber: {
    alignItems: 'center',
    backgroundColor: '#E8F3FF',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  pollCreateOptionNumberText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  pollCreateOptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  pollCreatePrimaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
  },
  pollCreatePrimaryActionText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '800',
  },
  pollCreateSecondaryAction: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
  },
  pollCreateSecondaryActionText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '800',
  },
  pollCreateRemoveOption: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  pollCreateRemoveOptionText: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  pollCreateSelectPill: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  pollCreateSelectPillAdded: {
    backgroundColor: colors.surface,
  },
  pollCreateSelectPillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  pollCreateSelectPillTextAdded: {
    color: colors.textMuted,
  },
  pollCreateShell: {
    gap: 16,
    paddingBottom: 8,
  },
  pollCreateTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
  },
  pollCreateToggle: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  pollCreateToggleActive: {
    backgroundColor: '#E8F3FF',
  },
  pollCreateToggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
  },
  pollCreateToggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  pollCreateToggleTextActive: {
    color: colors.primary,
  },
  pollCreateTypeCardSelected: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.faith,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 88,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pollCreateTypeDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  pollCreateTypeIconMint: {
    alignItems: 'center',
    backgroundColor: '#E8F6F7',
    borderRadius: 15,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pollCreateTypeIconTextMint: {
    color: colors.faith,
    fontSize: 16,
    fontWeight: '700',
  },
  pollCreateTypeTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  pollManageRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.borderSoft,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    justifyContent: 'space-between',
    padding: space.md,
  },
  pollManageText: {
    flex: 1,
    gap: 4,
  },
  respondentChip: {
    backgroundColor: colors.borderSoft,
    borderRadius: 8,
    maxWidth: '48%',
    paddingHorizontal: space.sm,
    paddingVertical: 6,
  },
  respondentText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  respondentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  resultButton: {
    backgroundColor: colors.borderSoft,
    borderRadius: 8,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  resultButtonActive: {
    backgroundColor: colors.primary,
  },
  resultButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  resultButtonTextActive: {
    color: colors.surface,
  },
  resultOption: {
    borderTopColor: colors.borderSoft,
    borderTopWidth: 1,
    gap: space.sm,
    paddingTop: space.md,
  },
  resultOptionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultPanel: {
    gap: space.md,
    marginTop: space.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  selectMeta: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  selectRow: {
    backgroundColor: colors.background,
    borderColor: colors.borderSoft,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    minHeight: 48,
    padding: space.md,
  },
  selectRowActive: {
    backgroundColor: '#E8F3FF',
    borderColor: colors.primary,
  },
  selectTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  segmentedButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: space.sm,
  },
  segmentedButtonActive: {
    backgroundColor: colors.primary,
  },
  segmentedButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  segmentedButtonTextActive: {
    color: colors.surface,
  },
  segmentedControl: {
    flexDirection: 'row',
    gap: space.sm,
    marginVertical: space.md,
  },
  softButton: {
    backgroundColor: colors.borderSoft,
    borderRadius: 8,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  softButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  successBox: {
    backgroundColor: colors.mint,
    borderRadius: 8,
    marginTop: space.md,
    padding: space.md,
  },
  successText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  summaryBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: space.sm,
  },
  errorBox: {
    backgroundColor: colors.borderSoft,
    borderRadius: 8,
    marginTop: space.md,
    padding: space.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.md,
    justifyContent: 'space-between',
  },
  summaryActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  summaryTitle: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
  },
  textInput: {
    backgroundColor: colors.background,
    borderColor: colors.borderSoft,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
});
