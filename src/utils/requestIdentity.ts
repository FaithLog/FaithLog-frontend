export function isCurrentRequest(
  requestSequence: number,
  currentSequence: number,
  requestKey: string,
  currentKey: string,
) {
  return requestSequence === currentSequence && requestKey === currentKey;
}

export function settleIndependently<T>(
  promise: Promise<T>,
  onSettled: (result: PromiseSettledResult<T>) => void,
) {
  return promise.then(
    (value) => onSettled({status: 'fulfilled', value}),
    (reason) => onSettled({status: 'rejected', reason}),
  );
}

export function isCurrentDetailEpoch(
  pollId: number,
  currentPollId: number | null,
  epoch: number,
  currentEpoch: number,
  generation: number,
  currentGeneration: number,
) {
  return pollId === currentPollId && epoch === currentEpoch && generation === currentGeneration;
}

export function isMountedGenerationCurrent(
  mounted: boolean,
  generation: number,
  currentGeneration: number,
) {
  return mounted && generation === currentGeneration;
}
