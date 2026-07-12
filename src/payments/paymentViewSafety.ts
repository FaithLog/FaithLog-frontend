export function isPaymentNavigationLocked(status: string) {
  return status === 'markingPaid';
}

export function invalidatePaymentListRequest(
  sequence: {current: number},
  key: {current: string},
) {
  sequence.current += 1;
  key.current = '';
}

export function isPaymentListRequestCurrent(
  requestSequence: number,
  currentSequence: number,
  requestKey: string,
  currentKey: string,
  requestGeneration: number,
  currentGeneration: number,
) {
  return requestSequence === currentSequence && requestKey === currentKey &&
    requestGeneration === currentGeneration;
}
