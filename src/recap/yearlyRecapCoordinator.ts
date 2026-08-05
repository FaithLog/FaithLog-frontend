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
  let cachedRecap: RecapCandidate | null = null;
  let autoPresentedKey: string | null = null;
  const presentedRequests = new Map<string, Promise<unknown>>();

  const activateContext = (contextKey: string | null) => {
    if (currentContextKey === contextKey) return;
    currentContextKey = contextKey;
    operation += 1;
    inFlight = null;
    cachedRecap = null;
    autoPresentedKey = null;
    presentedRequests.clear();
  };

  const successResult = <T extends RecapCandidate>(contextKey: string, recap: T): LoadResult<T> => {
    const autoKey = `${contextKey}:${recap.recapYear}`;
    const shouldAutoPresent =
      recap.hasRecapData &&
      recap.presentation.shouldAutoPresent &&
      autoPresentedKey !== autoKey;
    if (shouldAutoPresent) autoPresentedKey = autoKey;
    return {status: 'success', recap, shouldAutoPresent};
  };

  return {
    async load<T extends RecapCandidate>({contextKey, load}: {
      contextKey: string;
      load: () => Promise<T>;
    }): Promise<LoadResult<T>> {
      activateContext(contextKey);
      if (cachedRecap) return successResult(contextKey, cachedRecap as T);
      const requestOperation = operation;
      const shared = (inFlight ??= load()) as Promise<T>;
      try {
        const recap = await shared;
        if (currentContextKey !== contextKey || operation !== requestOperation) {
          return {status: 'stale'};
        }
        cachedRecap = recap;
        return successResult(contextKey, recap);
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
      activateContext(nextContextKey);
    },
  };
}
