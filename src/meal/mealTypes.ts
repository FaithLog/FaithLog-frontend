export type MealDutyAssignment = {
  assignmentId: number;
  campusId: number;
  userId: number;
  name?: string;
  email?: string;
  dutyType: 'MEAL';
  isActive: boolean;
  assignedAt?: string;
};

export type MealMyDutyAssignment = {
  campusId: number;
  userId: number;
  dutyType: 'MEAL';
  isActive: boolean;
};

export type MealDutyAssignRequest = {
  userId: number;
};

export type MealPaymentAccount = {
  id: number;
  campusId: number;
  ownerUserId: number;
  accountType: 'MEAL';
  nickname: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isActive: boolean;
  createdAt: string;
  deactivatedAt: string | null;
};

export type MealPaymentAccountCreateRequest = Pick<
  MealPaymentAccount,
  'accountHolder' | 'accountNumber' | 'bankName' | 'nickname'
>;

export type MealPollStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED';
export type MealSettlementStatus = 'NOT_CHARGED' | 'CHARGED';
export type MealCalculationType = 'PER_MEMBER' | 'GROUP_TOTAL';

export type MealPollSummary = {
  id: number;
  title: string;
  startsAt: string;
  endsAt: string;
  status: MealPollStatus;
  settlementStatus: MealSettlementStatus;
};

export type MealPollList = {
  content: MealPollSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type MealNotCharged = {
  chargeStatus: 'NOT_CHARGED';
  calculationType: null;
  enteredAmount: null;
  amountPerMember: null;
  requestedTotalAmount: null;
  actualTotalAmount: null;
  roundingAdjustment: null;
  paymentAccountId: null;
  chargedByMe: false;
  chargedAt: null;
};

export type MealCharged = {
  chargeStatus: 'CHARGED';
  calculationType: MealCalculationType;
  enteredAmount: number;
  amountPerMember: number;
  requestedTotalAmount: number;
  actualTotalAmount: number;
  roundingAdjustment: number;
  paymentAccountId: number | null;
  chargedByMe: boolean;
  chargedAt: string;
};

export type MealOptionCharge = MealNotCharged | MealCharged;

export type MealPollOptionDetail = {
  optionId: number;
  content: string;
  responseCount: number;
  userAdded: boolean;
  charge: MealOptionCharge;
};

export type MealPollDetail = {
  id: number;
  campusId: number;
  title: string;
  pollType: 'MEAL';
  selectionType: 'SINGLE';
  isAnonymous: boolean;
  allowUserOptionAdd: boolean;
  startsAt: string;
  endsAt: string;
  status: MealPollStatus;
  options: MealPollOptionDetail[];
};

export type MealPollCreateRequest = {
  title: string;
  isAnonymous: boolean;
  endsAt: string;
  options: Array<{content: string; sortOrder: number}>;
  allowUserOptionAdd: boolean;
};

export type MealPollCreateDraft = {
  title: string;
  isAnonymous: boolean;
  endsAt: string;
  options: string[];
  allowUserOptionAdd: boolean;
};

export type MealPollMutationOption = {
  id: number;
  content: string;
  sortOrder: number;
  userAdded: boolean;
};

export type MealPollMutationResponse = {
  id: number;
  campusId: number;
  title: string;
  pollType: 'MEAL';
  selectionType: 'SINGLE';
  isAnonymous: boolean;
  allowUserOptionAdd: boolean;
  startsAt: string;
  endsAt: string;
  status: MealPollStatus;
  options: MealPollMutationOption[];
};

export type MealChargeGroupRequest = {
  optionId: number;
  calculationType: MealCalculationType;
  enteredAmount: number;
};

export type MealChargeRequest = {
  paymentAccountId: number;
  groups: MealChargeGroupRequest[];
};

export type MealChargeCalculation = {
  enteredAmount: number;
  amountPerMember: number;
  requestedTotalAmount: number;
  actualTotalAmount: number;
  roundingAdjustment: number;
};

export type MealChargeGroupResult = MealChargeCalculation & {
  optionId: number;
  calculationType: MealCalculationType;
  responseCount: number;
};

export type MealChargeResult = {
  pollId: number;
  paymentAccountId: number;
  chargedMemberCount: number;
  requestedTotalAmount: number;
  actualTotalAmount: number;
  roundingAdjustment: number;
  chargedAt: string;
  groups: MealChargeGroupResult[];
};

export type MealSettlementCharge = {
  chargeId: number;
  pollId: number;
  pollTitle: string;
  optionContent: string;
  memberName: string;
  amount: number;
  status: 'UNPAID' | 'PAID' | 'WAIVED' | 'CANCELED';
  chargedAt: string;
};

export type MealSettlementSummary = {
  chargedMemberCount: number;
  requestedTotalAmount: number;
  actualTotalAmount: number;
  roundingAdjustment: number;
};

export type MealAccountSettlement = {
  account: MealPaymentAccount;
  summary: MealSettlementSummary;
  charges: MealSettlementCharge[];
};

export type MealSettlementLedger = {
  accounts: MealAccountSettlement[];
  summary: MealSettlementSummary;
};

export type MealSettlementMember = {
  userId: number;
  name: string;
  email: string;
  totalAmount: number;
  unpaidAmount: number;
  paidAmount: number;
  waivedAmount: number;
  canceledAmount: number;
};

export type MealSettlement = {
  campusId: number;
  campusName: string;
  region: string;
  summary: {
    totalAmount: number;
    unpaidAmount: number;
    paidAmount: number;
    waivedAmount: number;
    canceledAmount: number;
  };
  members: MealSettlementMember[];
};
