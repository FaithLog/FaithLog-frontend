import type {AuthSessionGeneration} from '../api/tokenStorage';
import type {TokenPair} from '../api/types';

type RefreshHandoffEntry = {
  inFlight: number;
  latestTokens: TokenPair | null;
  settlement: Promise<void>;
  resolveSettlement: () => void;
};

const entries = new Map<AuthSessionGeneration, RefreshHandoffEntry>();

function renewSettlement(entry: RefreshHandoffEntry) {
  let resolveSettlement!: () => void;
  entry.settlement = new Promise<void>((resolve) => { resolveSettlement = resolve; });
  entry.resolveSettlement = () => resolveSettlement();
}

function getOrCreateEntry(generation: AuthSessionGeneration) {
  const current = entries.get(generation);
  if (current) return current;
  const entry: RefreshHandoffEntry = {
    inFlight: 0,
    latestTokens: null,
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
) {
  const entry = getOrCreateEntry(generation);
  if (entry.inFlight === 0) renewSettlement(entry);
  entry.inFlight += 1;
  const operation = start((tokens) => { entry.latestTokens = tokens; });
  return operation.finally(() => {
    entry.inFlight -= 1;
    if (entry.inFlight === 0) {
      entry.resolveSettlement();
      if (!entry.latestTokens) entries.delete(generation);
    }
  });
}

export async function collectRefreshTokensForLogout(generation: AuthSessionGeneration) {
  const entry = entries.get(generation);
  if (!entry) return null;
  while (entry.inFlight > 0) await entry.settlement;
  entries.delete(generation);
  return entry.latestTokens;
}

export function discardRefreshTokensAfterCommit(generation: AuthSessionGeneration) {
  entries.delete(generation);
}

export function hasRefreshLogoutHandoff(generation?: AuthSessionGeneration) {
  return generation === undefined ? entries.size > 0 : entries.has(generation);
}

export function resetRefreshLogoutHandoffForTests() {
  entries.clear();
}
