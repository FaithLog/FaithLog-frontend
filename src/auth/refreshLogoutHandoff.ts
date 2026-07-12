import type {AuthSessionGeneration} from '../api/tokenStorage';
import type {TokenPair} from '../api/types';

type RefreshHandoffEntry = {
  operations: Set<RefreshHandoffOperation>;
  settlement: Promise<void>;
  resolveSettlement: () => void;
};

type RefreshHandoffOperation = {
  inFlight: boolean;
  issuedSequence: number;
  tokens: TokenPair | null;
};

export type TrackedRefreshForLogout<T> = Promise<T> & {
  discardAfterCommit: () => void;
};

const entries = new Map<AuthSessionGeneration, RefreshHandoffEntry>();
let issuedSequence = 0;

function renewSettlement(entry: RefreshHandoffEntry) {
  let resolveSettlement!: () => void;
  entry.settlement = new Promise<void>((resolve) => { resolveSettlement = resolve; });
  entry.resolveSettlement = () => resolveSettlement();
}

function getOrCreateEntry(generation: AuthSessionGeneration) {
  const current = entries.get(generation);
  if (current) return current;
  const entry: RefreshHandoffEntry = {
    operations: new Set(),
    settlement: Promise.resolve(),
    resolveSettlement: () => {},
  };
  renewSettlement(entry);
  entries.set(generation, entry);
  return entry;
}

export function trackRefreshForLogout<T>(
  generation: AuthSessionGeneration,
  start: (onIssued: (tokens: TokenPair) => void) => Promise<T>,
): TrackedRefreshForLogout<T> {
  const entry = getOrCreateEntry(generation);
  if (![...entry.operations].some((operation) => operation.inFlight)) renewSettlement(entry);
  const handoffOperation: RefreshHandoffOperation = {
    inFlight: true,
    issuedSequence: 0,
    tokens: null,
  };
  entry.operations.add(handoffOperation);
  const operation = start((tokens) => {
    handoffOperation.tokens = tokens;
    handoffOperation.issuedSequence = ++issuedSequence;
  });
  const tracked = operation.finally(() => {
    handoffOperation.inFlight = false;
    if (![...entry.operations].some((candidate) => candidate.inFlight)) {
      entry.resolveSettlement();
      if (![...entry.operations].some((candidate) => candidate.tokens)) entries.delete(generation);
    }
  }) as TrackedRefreshForLogout<T>;
  tracked.discardAfterCommit = () => {
    entry.operations.delete(handoffOperation);
    if (entry.operations.size === 0 && entries.get(generation) === entry) entries.delete(generation);
  };
  return tracked;
}

export async function collectRefreshTokensForLogout(generation: AuthSessionGeneration) {
  const entry = entries.get(generation);
  if (!entry) return null;
  while ([...entry.operations].some((operation) => operation.inFlight)) await entry.settlement;
  if (entries.get(generation) === entry) entries.delete(generation);
  return [...entry.operations]
    .filter((operation): operation is RefreshHandoffOperation & {tokens: TokenPair} => operation.tokens !== null)
    .sort((a, b) => b.issuedSequence - a.issuedSequence)[0]?.tokens ?? null;
}

export function discardRefreshTokensForGeneration(generation: AuthSessionGeneration) {
  entries.delete(generation);
}

export function hasRefreshLogoutHandoff(generation?: AuthSessionGeneration) {
  return generation === undefined ? entries.size > 0 : entries.has(generation);
}

export function hasIssuedRefreshTokens(generation?: AuthSessionGeneration) {
  const candidates = generation === undefined
    ? [...entries.values()]
    : [entries.get(generation)].filter((entry): entry is RefreshHandoffEntry => Boolean(entry));
  return candidates.some((entry) => [...entry.operations].some((operation) => operation.tokens !== null));
}

export async function settleRefreshHandoffsForAuthEntry(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (entries.size > 0) {
    const pending = [...entries.values()].filter((entry) =>
      [...entry.operations].some((operation) => operation.inFlight),
    );
    if (pending.length === 0) {
      const issued = hasIssuedRefreshTokens();
      entries.clear();
      return issued ? 'issued' as const : 'clear' as const;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      entries.clear();
      return 'timeout' as const;
    }
    let timeoutId: ReturnType<typeof setTimeout>;
    const settled = await Promise.race([
      Promise.all(pending.map((entry) => entry.settlement)).then(() => true),
      new Promise<false>((resolve) => {
        timeoutId = setTimeout(() => resolve(false), remainingMs);
      }),
    ]).finally(() => clearTimeout(timeoutId!));
    if (!settled) {
      entries.clear();
      return 'timeout' as const;
    }
  }
  return 'clear' as const;
}

export function discardAllRefreshLogoutHandoffs() {
  entries.clear();
}

export function resetRefreshLogoutHandoffForTests() {
  entries.clear();
  issuedSequence = 0;
}
