export type DutySettlementFilter = 'ALL' | 'UNPAID' | 'PAID';

export function filterDutySettlementMembers<
  Member extends {paidAmount: number; unpaidAmount: number},
>(members: Member[], filter: DutySettlementFilter): Member[] {
  if (filter === 'UNPAID') {
    return members.filter((member) => member.unpaidAmount > 0);
  }
  if (filter === 'PAID') {
    return members.filter((member) => member.paidAmount > 0);
  }
  return members;
}
