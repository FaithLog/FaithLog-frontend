type RecapCandidate = {
  hasRecapData: boolean;
  presentation: {shouldAutoPresent: boolean};
  recapYear: number;
};

type LoadResult<T> =
  | {status: 'success'; recap: T; shouldAutoPresent: boolean}
  | {status: 'stale'};

export function createYearlyRecapCoordinator() {
  let currentContextKey: string | null = null;
  let operation = 0;
  let inFlight: Promise<RecapCandidate> | null = null;
  let autoPresentedKey: string | null = null;
  const presentedRequests = new Map<string, Promise<unknown>>();

  return {
    async load<T extends RecapCandidate>({contextKey, load}: {
      contextKey: string;
      load: () => Promise<T>;
    }): Promise<LoadResult<T>> {
      if (currentContextKey !== contextKey) {
        currentContextKey = contextKey;
        operation += 1;
        inFlight = null;
        autoPresentedKey = null;
      }
      const requestOperation = operation;
      const shared = (inFlight ??= load()) as Promise<T>;
      try {
        const recap = await shared;
        if (currentContextKey !== contextKey || operation !== requestOperation) {
          return {status: 'stale'};
        }
        const autoKey = `${contextKey}:${recap.recapYear}`;
        const shouldAutoPresent =
          recap.hasRecapData &&
          recap.presentation.shouldAutoPresent &&
          autoPresentedKey !== autoKey;
        if (shouldAutoPresent) autoPresentedKey = autoKey;
        return {status: 'success', recap, shouldAutoPresent};
      } finally {
        if (inFlight === shared) inFlight = null;
      }
    },
    markPresentedOnce(key: string, request: () => Promise<unknown>) {
      const existing = presentedRequests.get(key);
      if (existing) return existing;
      const next = request();
      presentedRequests.set(key, next);
      return next;
    },
    reset(nextContextKey: string | null = null) {
      currentContextKey = nextContextKey;
      operation += 1;
      inFlight = null;
      autoPresentedKey = null;
      presentedRequests.clear();
    },
  };
}
