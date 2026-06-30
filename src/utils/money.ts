export function formatWon(amount: number) {
  return `${Math.max(0, amount).toLocaleString('ko-KR')}원`;
}

export function formatCompactWon(amount: number) {
  const safeAmount = Math.max(0, amount);

  if (safeAmount >= 1000) {
    return `${Number((safeAmount / 1000).toFixed(1)).toLocaleString('ko-KR')}k원`;
  }

  return formatWon(safeAmount);
}
