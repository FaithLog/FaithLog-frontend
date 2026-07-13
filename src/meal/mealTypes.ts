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
  campusId: number;
  title: string;
  description: string | null;
  pollType: 'MEAL';
  selectionType: 'SINGLE';
  allowUserOptionAdd: boolean;
  startsAt: string;
  endsAt: string;
  status: MealPollStatus;
  settlementStatus: MealSettlementStatus;
  totalResponseCount: number;
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
};

export type MealCharged = {
  chargeStatus: 'CHARGED';
  calculationType: MealCalculationType;
  enteredAmount: number;
  amountPerMember: number;
  requestedTotalAmount: number;
  actualTotalAmount: number;
  roundingAdjustment: number;
  chargedMemberCount: number;
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

export type MealPollDetail = MealPollSummary & {
  options: MealPollOptionDetail[];
};

export type MealPollCreateRequest = {
  title: string;
  description: string;
  endsAt: string;
  options: Array<{content: string}>;
  allowUserOptionAdd: boolean;
};

export type MealPollCreateDraft = {
  title: string;
  description: string;
  endsAt: string;
  options: string[];
  allowUserOptionAdd: boolean;
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

export type MealSettlement = {
  accounts: MealAccountSettlement[];
  summary: MealSettlementSummary;
};
