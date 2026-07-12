import * as SecureStore from 'expo-secure-store';
import {Platform} from 'react-native';

import type {TokenPair} from './types';

const AUTH_TOKENS_KEY = 'faithlog.authTokens.v2';
const AUTH_INVALIDATED_KEY = 'faithlog.authInvalidated';
const AUTH_TEARDOWN_PENDING_KEY = 'faithlog.authTeardownPending';
const LEGACY_ACCESS_TOKEN_KEY = 'faithlog.accessToken';
const LEGACY_REFRESH_TOKEN_KEY = 'faithlog.refreshToken';
const FCM_REGISTRATION_KEY = 'faithlog.fcmRegistration.v2';
const FCM_INVALIDATED_KEY = 'faithlog.fcmRegistrationInvalidated';
const FCM_OPT_OUT_KEY = 'faithlog.fcmOptOut.v1';
const FCM_REGISTRATION_ATTEMPTS_KEY = 'faithlog.fcmRegistrationAttempts.v1';
const FCM_REMOTE_CLEANUP_PENDING_KEY = 'faithlog.fcmRemoteCleanupPending.v1';
const LEGACY_FCM_TOKEN_KEY = 'faithlog.fcmToken';
const LEGACY_FCM_TOKEN_ID_KEY = 'faithlog.fcmTokenId';
const CLIENT_INSTANCE_ID_KEY = 'faithlog.clientInstanceId';
const LAST_SELECTED_CAMPUS_ID_KEY = 'faithlog.lastSelectedCampusId';
const PRAYER_SEASON_KEY_PREFIX = 'faithlog.prayerSeason.';
const INVALIDATED_VALUE = '1';

declare const authSessionGenerationBrand: unique symbol;

export type AuthSessionGeneration = number & {
  readonly [authSessionGenerationBrand]: true;
};

export type StoredTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

export type StoredAuthSession = StoredTokens & {
  generation: AuthSessionGeneration;
};

export class StaleAuthSessionReadError extends Error {
  constructor(readonly expectedGeneration: AuthSessionGeneration, options?: {cause?: unknown}) {
    super('Authentication session changed while reading secure storage.');
    this.cause = options?.cause;
  }
}

export class StoredSessionTeardownPreparationError extends Error {
  constructor(
    readonly markerPersisted: boolean,
    options?: {cause?: unknown},
  ) {
    super('Unable to prepare the stored session for durable teardown.');
    this.cause = options?.cause;
  }
}

export class CorruptFcmPrivacyStateError extends Error {
  constructor(readonly storageKey: 'optOut' | 'registrationAttempts' | 'remoteCleanup') {
    super(`Stored FCM ${storageKey} privacy state is corrupt.`);
  }
}

export type StoredFcmRegistration = {
  token: string | null;
  tokenId: number | null;
  userId: number | null;
  clientInstanceId: string | null;
};

export type StoredFcmRegistrationAttempt = {
  token: string;
  userId: number;
  clientInstanceId: string;
};

export type StoredFcmRemoteCleanupObligation = {
  accessToken: string;
  refreshToken?: string | null;
  userId: number | null;
  clientInstanceId: string | null;
  kind: 'registration' | 'deactivation' | 'clientLogout' | 'clientRetirement';
  token: string | null;
  tokenId: number | null;
};

type StoredFcmAccountDeletionClaim = {
  phase: 'cleanupRequired' | 'cascadeConfirmed';
  claimedReceipts: StoredFcmRemoteCleanupObligation[];
  cleanupReceipts: StoredFcmRemoteCleanupObligation[];
};

type StoredFcmRemoteCleanupState = {
  obligations: StoredFcmRemoteCleanupObligation[];
  accountDeletionClaim: StoredFcmAccountDeletionClaim | null;
};

export type StoredPrayerSeason = {
  seasonId: number;
  name: string;
  startDate: string;
};

type StoredTokenRecord = {
  version: 1;
  accessToken: string;
  refreshToken: string;
};

type StoredFcmRegistrationRecord = {
  version: 2;
  token: string;
  tokenId: number;
  userId: number;
  clientInstanceId: string;
};

type LegacyStoredFcmRegistrationRecord = {
  version: 1;
  token: string;
  tokenId: number;
  userId: number;
};

type StoredFcmOptOutEntry = {
  userId: number;
  clientInstanceId: string;
  status: 'confirmed' | 'pending';
  tokenId: number | null;
};

type StoredFcmOptOutRecord = {
  version: 2;
  entries: StoredFcmOptOutEntry[];
};

export type StoredFcmOptOutState = Pick<
  StoredFcmOptOutEntry,
  'clientInstanceId' | 'status' | 'tokenId'
>;

let authSessionGeneration = 0 as AuthSessionGeneration;
const closingAuthSessionGenerations = new Set<number>();
let cachedAccessToken: string | null | undefined;
const currentSessionAccessTokens = new Set<string>();
let secureStorageQueue: Promise<void> = Promise.resolve();

export function getAuthSessionGeneration() {
  return authSessionGeneration;
}

export function isAuthSessionGenerationCurrent(
  generation: AuthSessionGeneration | number,
) {
  return generation === authSessionGeneration;
}

export function markAuthSessionClosing(generation: AuthSessionGeneration | number) {
  if (!isAuthSessionGenerationCurrent(generation)) return false;
  closingAuthSessionGenerations.add(generation);
  return true;
}

export function isAuthSessionRequestAllowed(
  generation: AuthSessionGeneration | number,
) {
  return isAuthSessionGenerationCurrent(generation) &&
    !closingAuthSessionGenerations.has(generation);
}

export async function beginAuthSession() {
  const generation = advanceAuthSessionGeneration();
  await withSecureStorageLock(invalidateStoredAuthData);
  return generation;
}

export async function getStoredAuthSession(
  expectedGeneration: AuthSessionGeneration = authSessionGeneration,
): Promise<StoredAuthSession> {
  try {
    return await withSecureStorageLock(async () => {
    const generation = expectedGeneration;
    assertExpectedGeneration(generation);
    const invalidated = await getStorageItem(AUTH_INVALIDATED_KEY);
    assertExpectedGeneration(generation);

    if (invalidated === INVALIDATED_VALUE) {
      cachedAccessToken = null;
      currentSessionAccessTokens.clear();
      return {generation, accessToken: null, refreshToken: null};
    }

    const serialized = await getStorageItem(AUTH_TOKENS_KEY);
    assertExpectedGeneration(generation);
    const stored = parseStoredTokenRecord(serialized);

    if (serialized && !stored) {
      cachedAccessToken = null;
      currentSessionAccessTokens.clear();
      await setStorageItem(AUTH_INVALIDATED_KEY, INVALIDATED_VALUE);
      await deleteStorageItem(AUTH_TOKENS_KEY).catch(() => undefined);
      assertExpectedGeneration(generation);
      return {generation, accessToken: null, refreshToken: null};
    }

    if (stored) {
      if (isAuthSessionGenerationCurrent(generation)) {
        cachedAccessToken = stored.accessToken;
        currentSessionAccessTokens.add(stored.accessToken);
        return {
          generation,
          accessToken: stored.accessToken,
          refreshToken: stored.refreshToken,
        };
      }

      throw new StaleAuthSessionReadError(generation);
    }

    const [legacyAccessToken, legacyRefreshToken] = await Promise.all([
      getStorageItem(LEGACY_ACCESS_TOKEN_KEY),
      getStorageItem(LEGACY_REFRESH_TOKEN_KEY),
    ]);

    if (!isAuthSessionGenerationCurrent(generation)) {
      throw new StaleAuthSessionReadError(generation);
    }

    if (!legacyAccessToken || !legacyRefreshToken) {
      cachedAccessToken = null;
      currentSessionAccessTokens.clear();
      return {generation, accessToken: null, refreshToken: null};
    }

    const migrated: StoredTokenRecord = {
      version: 1,
      accessToken: legacyAccessToken,
      refreshToken: legacyRefreshToken,
    };
    await setStorageItem(AUTH_INVALIDATED_KEY, INVALIDATED_VALUE);
    assertExpectedGeneration(generation);
    await setStorageItem(AUTH_TOKENS_KEY, JSON.stringify(migrated));
    await Promise.allSettled([
      deleteStorageItem(LEGACY_ACCESS_TOKEN_KEY),
      deleteStorageItem(LEGACY_REFRESH_TOKEN_KEY),
    ]);

    assertExpectedGeneration(generation);
    await deleteStorageItem(AUTH_INVALIDATED_KEY);
    if (!isAuthSessionGenerationCurrent(generation)) {
      await setStorageItem(AUTH_INVALIDATED_KEY, INVALIDATED_VALUE);
      throw new StaleAuthSessionReadError(generation);
    }

    cachedAccessToken = legacyAccessToken;
    currentSessionAccessTokens.add(legacyAccessToken);

    return {generation, accessToken: legacyAccessToken, refreshToken: legacyRefreshToken};
    });
  } catch (error) {
    if (!isAuthSessionGenerationCurrent(expectedGeneration)) {
      throw new StaleAuthSessionReadError(expectedGeneration, {cause: error});
    }
    throw error;
  }
}

export async function isAccessTokenOwnedByAuthSession(
  accessToken: string,
  generation: AuthSessionGeneration,
) {
  if (!isAuthSessionGenerationCurrent(generation)) {
    return false;
  }

  if (cachedAccessToken !== undefined) {
    return currentSessionAccessTokens.has(accessToken);
  }

  const stored = await getStoredAuthSession(generation);
  return (
    stored.generation === generation &&
    isAuthSessionGenerationCurrent(generation) &&
    currentSessionAccessTokens.has(accessToken)
  );
}

export async function getStoredTokens(
  expectedGeneration: AuthSessionGeneration = authSessionGeneration,
): Promise<StoredTokens> {
  const {accessToken, refreshToken} = await getStoredAuthSession(expectedGeneration);
  return {accessToken, refreshToken};
}

export async function saveTokens(
  tokens: Pick<TokenPair, 'accessToken' | 'refreshToken'>,
  generation: AuthSessionGeneration = authSessionGeneration,
) {
  return withSecureStorageLock(async () => {
    if (!isAuthSessionRequestAllowed(generation)) {
      return false;
    }

    const record: StoredTokenRecord = {
      version: 1,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    await setStorageItem(AUTH_INVALIDATED_KEY, INVALIDATED_VALUE);
    if (!isAuthSessionRequestAllowed(generation)) return false;
    await setStorageItem(AUTH_TOKENS_KEY, JSON.stringify(record));

    if (!isAuthSessionRequestAllowed(generation)) {
      return false;
    }

    await Promise.allSettled([
      deleteStorageItem(LEGACY_ACCESS_TOKEN_KEY),
      deleteStorageItem(LEGACY_REFRESH_TOKEN_KEY),
    ]);
    if (!isAuthSessionRequestAllowed(generation)) return false;
    await deleteStorageItem(AUTH_INVALIDATED_KEY);

    if (!isAuthSessionRequestAllowed(generation)) {
      await setStorageItem(AUTH_INVALIDATED_KEY, INVALIDATED_VALUE);
      return false;
    }

    cachedAccessToken = record.accessToken;
    currentSessionAccessTokens.add(record.accessToken);

    return isAuthSessionRequestAllowed(generation);
  });
}

export async function clearTokens(
  expectedGeneration?: AuthSessionGeneration | number,
) {
  const transition = startAuthSessionClear(expectedGeneration);
  await transition.completion;
  return transition.cleared && isAuthSessionGenerationCurrent(transition.currentGeneration);
}

export function startAuthSessionClear(
  expectedGeneration?: AuthSessionGeneration | number,
) {
  const previousGeneration = authSessionGeneration;
  if (
    expectedGeneration !== undefined &&
    !isAuthSessionGenerationCurrent(expectedGeneration)
  ) {
    return {
      cleared: false as const,
      previousGeneration,
      currentGeneration: authSessionGeneration,
      completion: Promise.resolve(),
    };
  }

  const currentGeneration = advanceAuthSessionGeneration();
  return {
    cleared: true as const,
    previousGeneration,
    currentGeneration,
    completion: withSecureStorageLock(invalidateStoredAuthData),
  };
}

export async function getStoredSelectedCampusId(): Promise<number | null> {
  const value = await getStorageItem(LAST_SELECTED_CAMPUS_ID_KEY);
  const campusId = value ? Number(value) : null;

  return campusId && Number.isInteger(campusId) && campusId > 0 ? campusId : null;
}

export async function saveSelectedCampusId(campusId: number) {
  if (!Number.isInteger(campusId) || campusId <= 0) {
    await deleteStorageItem(LAST_SELECTED_CAMPUS_ID_KEY);
    return;
  }

  await setStorageItem(LAST_SELECTED_CAMPUS_ID_KEY, String(campusId));
}

export async function getStoredPrayerSeason(campusId: number): Promise<StoredPrayerSeason | null> {
  if (!Number.isInteger(campusId) || campusId <= 0) {
    return null;
  }

  const value = await getStorageItem(getPrayerSeasonStorageKey(campusId));

  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredPrayerSeason>;
    const seasonId = Number(parsed.seasonId);

    if (!Number.isInteger(seasonId) || seasonId <= 0) {
      return null;
    }

    return {
      seasonId,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      startDate: typeof parsed.startDate === 'string' ? parsed.startDate : '',
    };
  } catch {
    return null;
  }
}

export async function saveStoredPrayerSeason(campusId: number, season: StoredPrayerSeason) {
  if (!Number.isInteger(campusId) || campusId <= 0 || season.seasonId <= 0) {
    return;
  }

  await setStorageItem(getPrayerSeasonStorageKey(campusId), JSON.stringify(season));
}

export async function clearStoredPrayerSeason(campusId: number) {
  if (!Number.isInteger(campusId) || campusId <= 0) {
    return;
  }

  await deleteStorageItem(getPrayerSeasonStorageKey(campusId));
}

export async function getStoredFcmRegistration(): Promise<StoredFcmRegistration> {
  return withSecureStorageLock(async () => {
    const invalidated = await getStorageItem(FCM_INVALIDATED_KEY);

    if (invalidated === INVALIDATED_VALUE) {
      return {token: null, tokenId: null, userId: null, clientInstanceId: null};
    }

    const record = parseStoredFcmRegistrationRecord(
      await getStorageItem(FCM_REGISTRATION_KEY),
    );

    if (record) {
      return record;
    }

    const [token, tokenIdValue] = await Promise.all([
      getStorageItem(LEGACY_FCM_TOKEN_KEY),
      getStorageItem(LEGACY_FCM_TOKEN_ID_KEY),
    ]);
    const parsedTokenId = tokenIdValue ? Number(tokenIdValue) : null;
    const tokenId =
      parsedTokenId && Number.isInteger(parsedTokenId) && parsedTokenId > 0
        ? parsedTokenId
        : null;

    return {token, tokenId, userId: null, clientInstanceId: null};
  });
}

export async function saveFcmRegistration(
  registration: {
    token: string;
    tokenId: number;
    userId: number;
    clientInstanceId: string;
  },
  generation: AuthSessionGeneration,
) {
  return withSecureStorageLock(async () => {
    if (
      !isAuthSessionRequestAllowed(generation) ||
      !registration.token.trim() ||
      !Number.isInteger(registration.tokenId) ||
      registration.tokenId <= 0 ||
      !Number.isInteger(registration.userId) ||
      registration.userId <= 0 ||
      !registration.clientInstanceId.trim()
    ) {
      return false;
    }

    const record: StoredFcmRegistrationRecord = {
      version: 2,
      token: registration.token.trim(),
      tokenId: registration.tokenId,
      userId: registration.userId,
      clientInstanceId: registration.clientInstanceId.trim(),
    };
    await setStorageItem(FCM_INVALIDATED_KEY, INVALIDATED_VALUE);
    if (!isAuthSessionRequestAllowed(generation)) return false;
    await setStorageItem(FCM_REGISTRATION_KEY, JSON.stringify(record));

    if (!isAuthSessionRequestAllowed(generation)) {
      return false;
    }

    await Promise.allSettled([
      deleteStorageItem(LEGACY_FCM_TOKEN_KEY),
      deleteStorageItem(LEGACY_FCM_TOKEN_ID_KEY),
    ]);
    if (!isAuthSessionRequestAllowed(generation)) return false;
    await deleteStorageItem(FCM_INVALIDATED_KEY);
    if (!isAuthSessionRequestAllowed(generation)) {
      await setStorageItem(FCM_INVALIDATED_KEY, INVALIDATED_VALUE);
      return false;
    }
    return true;
  });
}

export async function clearFcmRegistration(
  expectedGeneration?: AuthSessionGeneration | number,
) {
  if (
    expectedGeneration !== undefined &&
    !isAuthSessionGenerationCurrent(expectedGeneration)
  ) {
    return false;
  }

  return withSecureStorageLock(async () => {
    if (
      expectedGeneration !== undefined &&
      !isAuthSessionGenerationCurrent(expectedGeneration)
    ) {
      return false;
    }

    const [tombstoneResult, ...deleteResults] = await Promise.allSettled([
      setStorageItem(FCM_INVALIDATED_KEY, INVALIDATED_VALUE),
      deleteStorageItem(FCM_REGISTRATION_KEY),
      deleteStorageItem(LEGACY_FCM_TOKEN_KEY),
      deleteStorageItem(LEGACY_FCM_TOKEN_ID_KEY),
    ]);

    if (
      tombstoneResult.status !== 'fulfilled' &&
      !deleteResults.every((result) => result.status === 'fulfilled')
    ) {
      throw new Error('Unable to invalidate stored FCM registration.');
    }

    return true;
  });
}

export async function getFcmRegistrationAttempts(
  userId: number,
  generation: AuthSessionGeneration,
): Promise<StoredFcmRegistrationAttempt[]> {
  return withSecureStorageLock(async () => {
    assertExpectedGeneration(generation);
    const entries = parseStoredFcmRegistrationAttempts(
      await getStorageItem(FCM_REGISTRATION_ATTEMPTS_KEY),
    );
    assertExpectedGeneration(generation);
    return entries.filter((entry) => entry.userId === userId);
  });
}

export async function saveFcmRegistrationAttempt(
  attempt: StoredFcmRegistrationAttempt,
  generation: AuthSessionGeneration,
) {
  return withSecureStorageLock(async () => {
    assertExpectedGeneration(generation);
    if (!isAuthSessionRequestAllowed(generation)) return false;
    const normalized = normalizeFcmRegistrationAttempt(attempt);
    if (!normalized) return false;
    const current = parseStoredFcmRegistrationAttempts(
      await getStorageItem(FCM_REGISTRATION_ATTEMPTS_KEY),
    );
    assertExpectedGeneration(generation);
    if (!isAuthSessionRequestAllowed(generation)) return false;
    const otherEntries = current.filter((entry) =>
      entry.userId !== normalized.userId ||
      entry.clientInstanceId !== normalized.clientInstanceId ||
      entry.token !== normalized.token,
    );
    if (otherEntries.length >= 20) {
      throw new Error('Too many unresolved FCM registration attempts.');
    }
    await setStorageItem(
      FCM_REGISTRATION_ATTEMPTS_KEY,
      JSON.stringify({version: 1, entries: [...otherEntries, normalized]}),
    );
    assertExpectedGeneration(generation);
    if (!isAuthSessionRequestAllowed(generation)) return false;
    return true;
  });
}

export async function clearFcmRegistrationAttempt(
  attempt: StoredFcmRegistrationAttempt,
  generation: AuthSessionGeneration,
) {
  return withSecureStorageLock(async () => {
    assertExpectedGeneration(generation);
    const current = parseStoredFcmRegistrationAttempts(
      await getStorageItem(FCM_REGISTRATION_ATTEMPTS_KEY),
    );
    assertExpectedGeneration(generation);
    const normalized = normalizeFcmRegistrationAttempt(attempt);
    if (!normalized) return;
    const remaining = current.filter((entry) =>
      entry.userId !== normalized.userId ||
      entry.clientInstanceId !== normalized.clientInstanceId ||
      entry.token !== normalized.token,
    );
    if (remaining.length === current.length) return;
    if (remaining.length === 0) {
      await deleteStorageItem(FCM_REGISTRATION_ATTEMPTS_KEY);
    } else {
      await setStorageItem(
        FCM_REGISTRATION_ATTEMPTS_KEY,
        JSON.stringify({version: 1, entries: remaining}),
      );
    }
    assertExpectedGeneration(generation);
  });
}

export async function clearFcmRegistrationAttemptsForClientInstance(
  clientInstanceId: string,
) {
  const normalizedClientInstanceId = clientInstanceId.trim();
  if (!normalizedClientInstanceId) return;
  return withSecureStorageLock(async () => {
    const current = parseStoredFcmRegistrationAttempts(
      await getStorageItem(FCM_REGISTRATION_ATTEMPTS_KEY),
    );
    const remaining = current.filter(
      (entry) => entry.clientInstanceId !== normalizedClientInstanceId,
    );
    if (remaining.length === current.length) return;
    if (remaining.length === 0) {
      await deleteStorageItem(FCM_REGISTRATION_ATTEMPTS_KEY);
    } else {
      await setStorageItem(
        FCM_REGISTRATION_ATTEMPTS_KEY,
        JSON.stringify({version: 1, entries: remaining}),
      );
    }
  });
}

export async function clearFcmRegistrationAttemptAfterRemoteCleanup(
  attempt: StoredFcmRegistrationAttempt,
) {
  const normalized = normalizeFcmRegistrationAttempt(attempt);
  if (!normalized) return;
  return withSecureStorageLock(async () => {
    const current = parseStoredFcmRegistrationAttempts(
      await getStorageItem(FCM_REGISTRATION_ATTEMPTS_KEY),
    );
    const remaining = current.filter((entry) =>
      entry.userId !== normalized.userId ||
      entry.clientInstanceId !== normalized.clientInstanceId ||
      entry.token !== normalized.token,
    );
    if (remaining.length === current.length) return;
    if (remaining.length === 0) {
      await deleteStorageItem(FCM_REGISTRATION_ATTEMPTS_KEY);
    } else {
      await setStorageItem(
        FCM_REGISTRATION_ATTEMPTS_KEY,
        JSON.stringify({version: 1, entries: remaining}),
      );
    }
  });
}

export async function markFcmRemoteCleanupPending(
  obligations: StoredFcmRemoteCleanupObligation[] = [],
) {
  if (obligations.length === 0) return;
  await withSecureStorageLock(async () => {
    const state = await readFcmRemoteCleanupState();
    const claim = state.accountDeletionClaim;
    const claimed = new Set(
      claim?.claimedReceipts.map(getFcmRemoteCleanupIdentity) ?? [],
    );
    const byIdentity = new Map<string, StoredFcmRemoteCleanupObligation>();
    for (const entry of state.obligations) {
      const identity = getFcmRemoteCleanupIdentity(entry);
      byIdentity.set(identity, entry);
    }
    const claimedCleanup = new Map<string, StoredFcmRemoteCleanupObligation>();
    for (const entry of claim?.cleanupReceipts ?? []) {
      claimedCleanup.set(getFcmRemoteCleanupIdentity(entry), entry);
    }
    for (const entry of obligations) {
      const identity = getFcmRemoteCleanupIdentity(entry);
      if (claimed.has(identity)) {
        const liveState = (entry as StoredFcmRemoteCleanupObligation & {state?: string}).state;
        if (liveState !== 'prepared' && liveState !== 'cleaned') {
          claimedCleanup.set(identity, entry);
        }
      } else {
        byIdentity.set(identity, entry);
      }
    }
    const merged = [...byIdentity.values()];
    await writeFcmRemoteCleanupState({
      obligations: merged,
      accountDeletionClaim: claim
        ? {...claim, cleanupReceipts: [...claimedCleanup.values()]}
        : null,
    });
  });
}

export async function markAuthTeardownPending() {
  await withSecureStorageLock(() =>
    setStorageItem(AUTH_TEARDOWN_PENDING_KEY, INVALIDATED_VALUE));
}

export async function hasAuthTeardownPending() {
  return withSecureStorageLock(async () =>
    (await getStorageItem(AUTH_TEARDOWN_PENDING_KEY)) === INVALIDATED_VALUE);
}

export async function clearAuthTeardownPending() {
  await withSecureStorageLock(() => deleteStorageItem(AUTH_TEARDOWN_PENDING_KEY));
}

export async function materializeStoredSessionLogoutObligation(
  expectedGeneration: AuthSessionGeneration = getAuthSessionGeneration(),
) {
  return withSecureStorageLock(async () => {
    assertExpectedGeneration(expectedGeneration);
    const record = await readStoredTokenRecordForTeardown();
    assertExpectedGeneration(expectedGeneration);
    const durable = await upsertStoredSessionLogoutObligation(record);
    assertExpectedGeneration(expectedGeneration);
    return durable.tokens;
  });
}

export async function prepareDurableStoredSessionTeardown(
  expectedGeneration: AuthSessionGeneration = getAuthSessionGeneration(),
) {
  return withSecureStorageLock(async () => {
    assertExpectedGeneration(expectedGeneration);
    let markerAlreadyPending: boolean | 'unknown' = 'unknown';
    try {
      markerAlreadyPending =
        (await getStorageItem(AUTH_TEARDOWN_PENDING_KEY)) === INVALIDATED_VALUE;
    } catch {
      // Continue with both durable recovery mechanisms. If lineage changes,
      // the unknown prior marker ownership is retained fail-closed.
    }
    assertExpectedGeneration(expectedGeneration);
    let markerPersisted = false;
    let insertedSessionLogout = false;
    let record: StoredTokenRecord | null = null;
    try {
      await setStorageItem(AUTH_TEARDOWN_PENDING_KEY, INVALIDATED_VALUE);
      markerPersisted = true;
    } catch {
      // The session receipt below is an equivalent durable recovery gate.
    }
    try {
      assertExpectedGeneration(expectedGeneration);
      record = await readStoredTokenRecordForTeardown();
      assertExpectedGeneration(expectedGeneration);
      const durable = await upsertStoredSessionLogoutObligation(record);
      insertedSessionLogout = durable.inserted;
      assertExpectedGeneration(expectedGeneration);
      return {
        markerPersisted,
        tokens: durable.tokens,
      };
    } catch (cause) {
      if (cause instanceof StaleAuthSessionReadError) {
        if (markerAlreadyPending === 'unknown' && markerPersisted) {
          throw new StoredSessionTeardownPreparationError(true, {cause});
        }
        try {
          if (insertedSessionLogout && record) {
            await removeStoredSessionLogoutObligation(record);
          }
          if (markerPersisted && markerAlreadyPending === false) {
            await deleteStorageItem(AUTH_TEARDOWN_PENDING_KEY);
          }
        } catch (rollbackCause) {
          throw new StoredSessionTeardownPreparationError(markerPersisted, {
            cause: rollbackCause,
          });
        }
        throw cause;
      }
      throw new StoredSessionTeardownPreparationError(markerPersisted, {cause});
    }
  });
}

async function readStoredTokenRecordForTeardown(): Promise<StoredTokenRecord | null> {
  let record = parseStoredTokenRecord(await getStorageItem(AUTH_TOKENS_KEY));
  if (record) return record;
  const [legacyAccessToken, legacyRefreshToken] = await Promise.all([
    getStorageItem(LEGACY_ACCESS_TOKEN_KEY),
    getStorageItem(LEGACY_REFRESH_TOKEN_KEY),
  ]);
  if (!legacyAccessToken?.trim() || !legacyRefreshToken?.trim()) return null;
  return {
    version: 1,
    accessToken: legacyAccessToken,
    refreshToken: legacyRefreshToken,
  };
}

async function upsertStoredSessionLogoutObligation(record: StoredTokenRecord | null) {
  const state = await readFcmRemoteCleanupState();
  const canonical = [...state.obligations, ...(state.accountDeletionClaim?.cleanupReceipts ?? [])]
    .find((entry) =>
    entry.kind === 'clientLogout' && entry.clientInstanceId === null);
  if (canonical) {
    return {
      inserted: false,
      tokens: {
        accessToken: canonical.accessToken,
        refreshToken: canonical.refreshToken ?? null,
      },
    };
  }
  if (!record) return {inserted: false, tokens: null};
  const sessionLogout: StoredFcmRemoteCleanupObligation = {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    userId: null,
    clientInstanceId: null,
    kind: 'clientLogout',
    token: null,
    tokenId: null,
  };
  const byIdentity = new Map<string, StoredFcmRemoteCleanupObligation>();
  const identity = getFcmRemoteCleanupIdentity(sessionLogout);
  const inserted = !state.obligations.some(
    (entry) => getFcmRemoteCleanupIdentity(entry) === identity);
  for (const entry of [...state.obligations, sessionLogout]) {
    byIdentity.set(getFcmRemoteCleanupIdentity(entry), entry);
  }
  await writeFcmRemoteCleanupState({...state, obligations: [...byIdentity.values()]});
  return {
    inserted,
    tokens: {accessToken: record.accessToken, refreshToken: record.refreshToken},
  };
}

async function removeStoredSessionLogoutObligation(record: StoredTokenRecord) {
  const state = await readFcmRemoteCleanupState();
  const identity = getFcmRemoteCleanupIdentity({
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    userId: null,
    clientInstanceId: null,
    kind: 'clientLogout',
    token: null,
    tokenId: null,
  });
  const remaining = state.obligations.filter(
    (entry) => getFcmRemoteCleanupIdentity(entry) !== identity,
  );
  await writeFcmRemoteCleanupState({...state, obligations: remaining});
}

export async function clearFcmRemoteCleanupPending() {
  await withSecureStorageLock(() => deleteStorageItem(FCM_REMOTE_CLEANUP_PENDING_KEY));
}

export async function clearFcmRemoteCleanupObligations(
  obligations: StoredFcmRemoteCleanupObligation[],
) {
  if (obligations.length === 0) return;
  await withSecureStorageLock(async () => {
    const state = await readFcmRemoteCleanupState();
    const cleared = new Set(obligations.map(getFcmRemoteCleanupIdentity));
    const remaining = state.obligations.filter(
      (entry) => !cleared.has(getFcmRemoteCleanupIdentity(entry)),
    );
    const claim = state.accountDeletionClaim;
    const remainingClaimedReceipts = claim?.claimedReceipts.filter(
      (entry) => !cleared.has(getFcmRemoteCleanupIdentity(entry)),
    ) ?? [];
    await writeFcmRemoteCleanupState({
      obligations: remaining,
      accountDeletionClaim: claim && remainingClaimedReceipts.length > 0
        ? {
            ...claim,
            claimedReceipts: remainingClaimedReceipts,
            cleanupReceipts: claim.cleanupReceipts.filter(
              (entry) => !cleared.has(getFcmRemoteCleanupIdentity(entry))),
          }
        : null,
    });
  });
}

export async function claimFcmRemoteCleanupForAccountDeletion(
  claimedObligations: StoredFcmRemoteCleanupObligation[],
  cleanupReceipts: StoredFcmRemoteCleanupObligation[],
) {
  if (claimedObligations.length === 0) return;
  await withSecureStorageLock(async () => {
    const state = await readFcmRemoteCleanupState();
    if (state.accountDeletionClaim) {
      throw new Error('An account deletion cleanup claim is already pending.');
    }
    const claimedByIdentity = new Map<string, StoredFcmRemoteCleanupObligation>();
    for (const receipt of claimedObligations) {
      claimedByIdentity.set(getFcmRemoteCleanupIdentity(receipt), receipt);
    }
    const cleanupByIdentity = new Map<string, StoredFcmRemoteCleanupObligation>();
    for (const receipt of cleanupReceipts) {
      cleanupByIdentity.set(getFcmRemoteCleanupIdentity(receipt), receipt);
    }
    const moved = new Set(claimedByIdentity.keys());
    await writeFcmRemoteCleanupState({
      obligations: state.obligations.filter(
        (entry) => !moved.has(getFcmRemoteCleanupIdentity(entry))),
      accountDeletionClaim: {
        phase: 'cleanupRequired',
        claimedReceipts: [...claimedByIdentity.values()],
        cleanupReceipts: [...cleanupByIdentity.values()],
      },
    });
  });
}

export async function restoreFcmAccountDeletionClaim() {
  await withSecureStorageLock(async () => {
    const state = await readFcmRemoteCleanupState();
    if (!state.accountDeletionClaim) return;
    const restored = new Map<string, StoredFcmRemoteCleanupObligation>();
    for (const entry of [
      ...state.obligations,
      ...state.accountDeletionClaim.cleanupReceipts,
    ]) {
      restored.set(getFcmRemoteCleanupIdentity(entry), entry);
    }
    await writeFcmRemoteCleanupState({
      obligations: [...restored.values()],
      accountDeletionClaim: null,
    });
  });
}

export async function completeFcmAccountDeletionClaim() {
  await withSecureStorageLock(async () => {
    const state = await readFcmRemoteCleanupState();
    await writeFcmRemoteCleanupState({...state, accountDeletionClaim: null});
  });
}

export async function markFcmAccountDeletionClaimCascadeConfirmed() {
  await withSecureStorageLock(async () => {
    const state = await readFcmRemoteCleanupState();
    if (!state.accountDeletionClaim) {
      throw new Error('No account deletion cleanup claim is pending.');
    }
    await writeFcmRemoteCleanupState({
      ...state,
      accountDeletionClaim: {...state.accountDeletionClaim, phase: 'cascadeConfirmed'},
    });
  });
}

export async function completeFcmAccountDeletionClaimAfterCleanup(
  processed: StoredFcmRemoteCleanupObligation[],
) {
  await withSecureStorageLock(async () => {
    const state = await readFcmRemoteCleanupState();
    const completed = new Set(processed.map(getFcmRemoteCleanupIdentity));
    await writeFcmRemoteCleanupState({
      obligations: state.obligations.filter(
        (entry) => !completed.has(getFcmRemoteCleanupIdentity(entry))),
      accountDeletionClaim: null,
    });
  });
}

export async function hasUnclaimedFcmRemoteCleanupPending() {
  return withSecureStorageLock(async () => {
    const value = await getStorageItem(FCM_REMOTE_CLEANUP_PENDING_KEY);
    if (!value) return false;
    return parseStoredFcmRemoteCleanupState(value).obligations.length > 0;
  });
}

export async function replaceFcmRemoteCleanupObligations(
  completed: StoredFcmRemoteCleanupObligation[],
  replacements: StoredFcmRemoteCleanupObligation[],
) {
  await withSecureStorageLock(async () => {
    const state = await readFcmRemoteCleanupState();
    const removed = new Set(completed.map(getFcmRemoteCleanupIdentity));
    const byIdentity = new Map<string, StoredFcmRemoteCleanupObligation>();
    for (const entry of state.obligations) {
      if (!removed.has(getFcmRemoteCleanupIdentity(entry))) {
        byIdentity.set(getFcmRemoteCleanupIdentity(entry), entry);
      }
    }
    for (const entry of replacements) {
      byIdentity.set(getFcmRemoteCleanupIdentity(entry), entry);
    }
    const next = [...byIdentity.values()];
    const claim = state.accountDeletionClaim;
    await writeFcmRemoteCleanupState({
      obligations: next,
      accountDeletionClaim: claim
        ? {
            ...claim,
            cleanupReceipts: claim.cleanupReceipts.filter(
              (entry) => !removed.has(getFcmRemoteCleanupIdentity(entry))),
          }
        : null,
    });
  });
}

export async function hasFcmRemoteCleanupPending() {
  return withSecureStorageLock(async () => {
    try {
      const state = await readFcmRemoteCleanupState();
      return state.obligations.length > 0 || state.accountDeletionClaim !== null;
    } catch {
      return true;
    }
  });
}

export async function getFcmRemoteCleanupObligations() {
  return withSecureStorageLock(async () => {
    const value = await getStorageItem(FCM_REMOTE_CLEANUP_PENDING_KEY);
    if (!value) return null;
    try {
      const state = parseStoredFcmRemoteCleanupState(value);
      if (state.obligations.length === 0 && !state.accountDeletionClaim) {
        await deleteStorageItem(FCM_REMOTE_CLEANUP_PENDING_KEY);
        return null;
      }
      return state.obligations.length > 0 ? state.obligations : null;
    } catch {
      return [];
    }
  });
}

export async function getFcmAccountDeletionClaim() {
  return withSecureStorageLock(async () => {
    const state = await readFcmRemoteCleanupState();
    return state.accountDeletionClaim;
  });
}

export async function getFcmAccountDeletionClaimCleanupReceipts() {
  return (await getFcmAccountDeletionClaim())?.cleanupReceipts ?? null;
}

export async function isFcmOptedOut(
  userId: number,
  _clientInstanceId: string,
  generation: AuthSessionGeneration,
) {
  return (await getFcmOptOutState(userId, generation)) !== null;
}

export async function getFcmOptOutState(
  userId: number,
  generation: AuthSessionGeneration,
): Promise<StoredFcmOptOutState | null> {
  return withSecureStorageLock(async () => {
    assertExpectedGeneration(generation);
    const serialized = await getStorageItem(FCM_OPT_OUT_KEY);
    assertExpectedGeneration(generation);
    const record = parseStoredFcmOptOutRecord(serialized);
    const entry = record.entries.find((candidate) => candidate.userId === userId);
    return entry
      ? {clientInstanceId: entry.clientInstanceId, status: entry.status, tokenId: entry.tokenId}
      : null;
  });
}

export async function saveFcmOptOut(
  userId: number,
  clientInstanceId: string,
  generation: AuthSessionGeneration,
  state: {status: 'confirmed' | 'pending'; tokenId?: number | null} = {status: 'pending'},
) {
  return withSecureStorageLock(async () => {
    assertExpectedGeneration(generation);
    if (!Number.isInteger(userId) || userId <= 0 || !clientInstanceId.trim()) return false;
    const current = parseStoredFcmOptOutRecord(await getStorageItem(FCM_OPT_OUT_KEY));
    assertExpectedGeneration(generation);
    const entry: StoredFcmOptOutEntry = {
      userId,
      clientInstanceId: clientInstanceId.trim(),
      status: state.status,
      tokenId: state.tokenId && Number.isInteger(state.tokenId) && state.tokenId > 0
        ? state.tokenId
        : null,
    };
    const retainedPending = current.entries.filter(
      (candidate) => candidate.userId !== userId && candidate.status === 'pending',
    );
    const retainedConfirmed = current.entries.filter(
      (candidate) => candidate.userId !== userId && candidate.status === 'confirmed',
    );
    const nextPending = entry.status === 'pending'
      ? [...retainedPending, entry]
      : retainedPending;
    const nextConfirmed = entry.status === 'confirmed'
      ? [...retainedConfirmed, entry].slice(-20)
      : retainedConfirmed.slice(-20);
    const record: StoredFcmOptOutRecord = {
      version: 2,
      entries: [
        ...nextPending,
        ...nextConfirmed,
      ],
    };
    await setStorageItem(FCM_OPT_OUT_KEY, JSON.stringify(record));
    assertExpectedGeneration(generation);
    return true;
  });
}

export async function clearFcmOptOut(
  userId: number,
  _clientInstanceId: string,
  generation: AuthSessionGeneration,
) {
  return withSecureStorageLock(async () => {
    assertExpectedGeneration(generation);
    const record = parseStoredFcmOptOutRecord(await getStorageItem(FCM_OPT_OUT_KEY));
    assertExpectedGeneration(generation);
    const remaining = record.entries.filter((entry) => entry.userId !== userId);
    if (remaining.length !== record.entries.length) {
      if (remaining.length > 0) {
        await setStorageItem(FCM_OPT_OUT_KEY, JSON.stringify({version: 2, entries: remaining}));
      } else {
        await deleteStorageItem(FCM_OPT_OUT_KEY);
      }
      assertExpectedGeneration(generation);
    }
  });
}

export async function getOrCreateClientInstanceId() {
  return withSecureStorageLock(async () => {
    const stored = await getStorageItem(CLIENT_INSTANCE_ID_KEY);

    if (stored) {
      return stored;
    }

    const clientInstanceId = createClientInstanceId();
    await setStorageItem(CLIENT_INSTANCE_ID_KEY, clientInstanceId);

    return clientInstanceId;
  });
}

export async function getStoredClientInstanceId() {
  return withSecureStorageLock(() => getStorageItem(CLIENT_INSTANCE_ID_KEY));
}

export async function rotateClientInstanceId(expectedClientInstanceId: string) {
  const expected = expectedClientInstanceId.trim();

  if (!expected) {
    return false;
  }

  return withSecureStorageLock(async () => {
    const stored = await getStorageItem(CLIENT_INSTANCE_ID_KEY);

    if (stored !== expected) {
      return false;
    }

    let replacement = createClientInstanceId();

    while (replacement === expected) {
      replacement = createClientInstanceId();
    }

    await setStorageItem(CLIENT_INSTANCE_ID_KEY, replacement);
    return true;
  });
}

function advanceAuthSessionGeneration() {
  closingAuthSessionGenerations.delete(authSessionGeneration);
  authSessionGeneration = (authSessionGeneration + 1) as AuthSessionGeneration;
  cachedAccessToken = null;
  currentSessionAccessTokens.clear();
  return authSessionGeneration;
}

function assertExpectedGeneration(generation: AuthSessionGeneration) {
  if (!isAuthSessionGenerationCurrent(generation)) {
    throw new StaleAuthSessionReadError(generation);
  }
}

async function invalidateStoredAuthData() {
  const [
    authTombstoneResult,
    tokenResult,
    legacyAccessResult,
    legacyRefreshResult,
    fcmTombstoneResult,
    fcmRegistrationResult,
    legacyFcmTokenResult,
    legacyFcmTokenIdResult,
  ] = await Promise.allSettled([
    setStorageItem(AUTH_INVALIDATED_KEY, INVALIDATED_VALUE),
    deleteStorageItem(AUTH_TOKENS_KEY),
    deleteStorageItem(LEGACY_ACCESS_TOKEN_KEY),
    deleteStorageItem(LEGACY_REFRESH_TOKEN_KEY),
    setStorageItem(FCM_INVALIDATED_KEY, INVALIDATED_VALUE),
    deleteStorageItem(FCM_REGISTRATION_KEY),
    deleteStorageItem(LEGACY_FCM_TOKEN_KEY),
    deleteStorageItem(LEGACY_FCM_TOKEN_ID_KEY),
    deleteStorageItem(LAST_SELECTED_CAMPUS_ID_KEY),
  ]);

  const authTombstoneWritten = authTombstoneResult.status === 'fulfilled';
  const everyAuthRecordDeleted = [
    tokenResult,
    legacyAccessResult,
    legacyRefreshResult,
  ].every((result) => result.status === 'fulfilled');
  const fcmTombstoneWritten = fcmTombstoneResult.status === 'fulfilled';
  const everyFcmRecordDeleted = [
    fcmRegistrationResult,
    legacyFcmTokenResult,
    legacyFcmTokenIdResult,
  ].every((result) => result.status === 'fulfilled');

  if (
    (!authTombstoneWritten && !everyAuthRecordDeleted) ||
    (!fcmTombstoneWritten && !everyFcmRecordDeleted)
  ) {
    throw new Error('Unable to invalidate stored authentication data.');
  }
}

function parseStoredTokenRecord(value: string | null): StoredTokenRecord | null {
  const parsed = parseJsonRecord(value);

  if (
    parsed?.version !== 1 ||
    typeof parsed.accessToken !== 'string' ||
    !parsed.accessToken.trim() ||
    typeof parsed.refreshToken !== 'string' ||
    !parsed.refreshToken.trim()
  ) {
    return null;
  }

  return {
    version: 1,
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
  };
}

function parseStoredFcmRegistrationRecord(
  value: string | null,
): StoredFcmRegistration | null {
  const parsed = parseJsonRecord(value);

  if (
    (parsed?.version !== 1 && parsed?.version !== 2) ||
    typeof parsed.token !== 'string' ||
    !parsed.token.trim() ||
    typeof parsed.tokenId !== 'number' ||
    !Number.isInteger(parsed.tokenId) ||
    parsed.tokenId <= 0 ||
    typeof parsed.userId !== 'number' ||
    !Number.isInteger(parsed.userId) ||
    parsed.userId <= 0
  ) {
    return null;
  }

  if (
    parsed.version === 2 &&
    (typeof parsed.clientInstanceId !== 'string' ||
      !parsed.clientInstanceId.trim())
  ) {
    return null;
  }

  const legacy = parsed as LegacyStoredFcmRegistrationRecord;

  return {
    token: legacy.token,
    tokenId: legacy.tokenId,
    userId: legacy.userId,
    clientInstanceId:
      parsed.version === 2
        ? (parsed.clientInstanceId as string).trim()
        : null,
  };
}

function parseStoredFcmOptOutRecord(value: string | null): StoredFcmOptOutRecord {
  const empty: StoredFcmOptOutRecord = {version: 2, entries: []};
  if (!value) return empty;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const rawEntries = parsed.version === 2 && Array.isArray(parsed.entries)
      ? parsed.entries
      : parsed.version === 1
        ? [parsed]
        : null;
    if (!rawEntries) throw new CorruptFcmPrivacyStateError('optOut');
    const entries = rawEntries.map((value): StoredFcmOptOutEntry => {
      if (!value || typeof value !== 'object') throw new CorruptFcmPrivacyStateError('optOut');
      const entry = value as Record<string, unknown>;
      if (!Number.isInteger(entry.userId) || Number(entry.userId) <= 0 ||
          typeof entry.clientInstanceId !== 'string' || !entry.clientInstanceId.trim()) {
        throw new CorruptFcmPrivacyStateError('optOut');
      }
      const isV2 = parsed.version === 2;
      if (isV2 && entry.status !== 'pending' && entry.status !== 'confirmed') {
        throw new CorruptFcmPrivacyStateError('optOut');
      }
      if (isV2 && entry.tokenId !== null &&
          (!Number.isInteger(entry.tokenId) || Number(entry.tokenId) <= 0)) {
        throw new CorruptFcmPrivacyStateError('optOut');
      }
      if (isV2 && entry.status === 'confirmed' && entry.tokenId !== null) {
        throw new CorruptFcmPrivacyStateError('optOut');
      }
      const tokenId = Number.isInteger(entry.tokenId) && Number(entry.tokenId) > 0
        ? Number(entry.tokenId)
        : null;
      return {
        userId: Number(entry.userId),
        clientInstanceId: entry.clientInstanceId.trim(),
        status: entry.status === 'confirmed' ? 'confirmed' : 'pending',
        tokenId,
      };
    });
    if (new Set(entries.map((entry) => entry.userId)).size !== entries.length) {
      throw new CorruptFcmPrivacyStateError('optOut');
    }
    return {version: 2, entries};
  } catch (error) {
    if (error instanceof CorruptFcmPrivacyStateError) throw error;
    throw new CorruptFcmPrivacyStateError('optOut');
  }
}

function parseStoredFcmRegistrationAttempts(value: string | null): StoredFcmRegistrationAttempt[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as {version?: unknown; entries?: unknown};
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      throw new CorruptFcmPrivacyStateError('registrationAttempts');
    }
    return parsed.entries.map((entry): StoredFcmRegistrationAttempt => {
      const normalized = normalizeFcmRegistrationAttempt(entry);
      if (!normalized) throw new CorruptFcmPrivacyStateError('registrationAttempts');
      return normalized;
    });
  } catch (error) {
    if (error instanceof CorruptFcmPrivacyStateError) throw error;
    throw new CorruptFcmPrivacyStateError('registrationAttempts');
  }
}

function normalizeFcmRegistrationAttempt(value: unknown): StoredFcmRegistrationAttempt | null {
  if (!value || typeof value !== 'object') return null;
  const attempt = value as Record<string, unknown>;
  if (!Number.isInteger(attempt.userId) || Number(attempt.userId) <= 0 ||
      typeof attempt.clientInstanceId !== 'string' || !attempt.clientInstanceId.trim() ||
      typeof attempt.token !== 'string' || !attempt.token.trim()) return null;
  return {
    userId: Number(attempt.userId),
    clientInstanceId: attempt.clientInstanceId.trim(),
    token: attempt.token.trim(),
  };
}

async function readFcmRemoteCleanupState() {
  return parseStoredFcmRemoteCleanupState(
    await getStorageItem(FCM_REMOTE_CLEANUP_PENDING_KEY),
  );
}

async function writeFcmRemoteCleanupState(state: StoredFcmRemoteCleanupState) {
  const claim = state.accountDeletionClaim;
  if (state.obligations.length === 0 && !claim) {
    await deleteStorageItem(FCM_REMOTE_CLEANUP_PENDING_KEY);
    return;
  }
  await setStorageItem(FCM_REMOTE_CLEANUP_PENDING_KEY, JSON.stringify({
    version: 2,
    obligations: state.obligations,
    accountDeletionClaim: claim,
  }));
}

function parseStoredFcmRemoteCleanupState(value: string | null): StoredFcmRemoteCleanupState {
  if (!value) return {obligations: [], accountDeletionClaim: null};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.version === 1) {
      return {
        obligations: parseStoredFcmRemoteCleanupObligations(value),
        accountDeletionClaim: null,
      };
    }
    if (parsed.version !== 2 || !Array.isArray(parsed.obligations)) {
      throw new CorruptFcmPrivacyStateError('remoteCleanup');
    }
    const obligations = parseStoredFcmRemoteCleanupObligations(JSON.stringify({
      version: 1,
      obligations: parsed.obligations,
    }));
    if (parsed.accountDeletionClaim === null) {
      return {obligations, accountDeletionClaim: null};
    }
    if (!parsed.accountDeletionClaim || typeof parsed.accountDeletionClaim !== 'object') {
      throw new CorruptFcmPrivacyStateError('remoteCleanup');
    }
    const claim = parsed.accountDeletionClaim as Record<string, unknown>;
    if ((claim.phase !== 'cleanupRequired' && claim.phase !== 'cascadeConfirmed') ||
        !Array.isArray(claim.claimedReceipts) ||
        claim.claimedReceipts.length === 0 ||
        !Array.isArray(claim.cleanupReceipts)) {
      throw new CorruptFcmPrivacyStateError('remoteCleanup');
    }
    const claimedReceipts = parseStoredFcmRemoteCleanupObligations(JSON.stringify({
      version: 1,
      obligations: claim.claimedReceipts,
    }));
    const claimedIdentities = claimedReceipts.map(getFcmRemoteCleanupIdentity);
    const obligationIdentities = new Set(obligations.map(getFcmRemoteCleanupIdentity));
    if (new Set(claimedIdentities).size !== claimedIdentities.length ||
        claimedIdentities.some((identity) => obligationIdentities.has(identity))) {
      throw new CorruptFcmPrivacyStateError('remoteCleanup');
    }
    const cleanupReceipts = parseStoredFcmRemoteCleanupObligations(JSON.stringify({
      version: 1,
      obligations: claim.cleanupReceipts,
    }));
    const claimed = new Set(claimedIdentities);
    if (cleanupReceipts.some(
      (entry) => !claimed.has(getFcmRemoteCleanupIdentity(entry)),
    )) {
      throw new CorruptFcmPrivacyStateError('remoteCleanup');
    }
    return {
      obligations,
      accountDeletionClaim: {
        phase: claim.phase,
        claimedReceipts,
        cleanupReceipts,
      },
    };
  } catch (error) {
    if (error instanceof CorruptFcmPrivacyStateError) throw error;
    throw new CorruptFcmPrivacyStateError('remoteCleanup');
  }
}

function parseStoredFcmRemoteCleanupObligations(
  value: string | null,
): StoredFcmRemoteCleanupObligation[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as {version?: unknown; obligations?: unknown};
    if (parsed.version !== 1 || !Array.isArray(parsed.obligations)) {
      throw new CorruptFcmPrivacyStateError('remoteCleanup');
    }
    const obligations = parsed.obligations.map((value): StoredFcmRemoteCleanupObligation => {
      if (!value || typeof value !== 'object') {
        throw new CorruptFcmPrivacyStateError('remoteCleanup');
      }
      const entry = value as Record<string, unknown>;
      if (typeof entry.accessToken !== 'string' || !entry.accessToken.trim() ||
          (entry.refreshToken !== undefined && entry.refreshToken !== null &&
           (typeof entry.refreshToken !== 'string' || !entry.refreshToken.trim())) ||
          (entry.userId !== null && (!Number.isInteger(entry.userId) || Number(entry.userId) <= 0)) ||
          (entry.clientInstanceId !== null &&
           (typeof entry.clientInstanceId !== 'string' || !entry.clientInstanceId.trim())) ||
          (entry.kind !== 'registration' && entry.kind !== 'deactivation' &&
           entry.kind !== 'clientLogout' && entry.kind !== 'clientRetirement') ||
          (entry.token !== null && typeof entry.token !== 'string') ||
          (entry.tokenId !== null && (!Number.isInteger(entry.tokenId) || Number(entry.tokenId) <= 0))) {
        throw new CorruptFcmPrivacyStateError('remoteCleanup');
      }
      const kind = entry.kind as StoredFcmRemoteCleanupObligation['kind'];
      const token = entry.token as string | null;
      const tokenId = entry.tokenId === null ? null : Number(entry.tokenId);
      const userId = entry.userId === null ? null : Number(entry.userId);
      const normalizedClientId = typeof entry.clientInstanceId === 'string'
        ? entry.clientInstanceId.trim()
        : null;
      const validKindShape = kind === 'registration'
        ? userId !== null && normalizedClientId !== null &&
          ((typeof token === 'string' && Boolean(token.trim())) || tokenId !== null)
        : kind === 'deactivation'
          ? userId !== null && normalizedClientId !== null && token === null && tokenId !== null
          : kind === 'clientLogout'
            ? userId === null && token === null && tokenId === null
            : userId === null && normalizedClientId !== null && token === null && tokenId === null;
      if (!validKindShape) throw new CorruptFcmPrivacyStateError('remoteCleanup');
      return {
        accessToken: entry.accessToken.trim(),
        ...(typeof entry.refreshToken === 'string' ? {refreshToken: entry.refreshToken.trim()} : {}),
        userId,
        clientInstanceId: normalizedClientId,
        kind,
        token: typeof token === 'string' ? token.trim() : null,
        tokenId,
      };
    });
    const identities = obligations.map(getFcmRemoteCleanupIdentity);
    if (new Set(identities).size !== identities.length) {
      throw new CorruptFcmPrivacyStateError('remoteCleanup');
    }
    return obligations;
  } catch (error) {
    if (error instanceof CorruptFcmPrivacyStateError) throw error;
    throw new CorruptFcmPrivacyStateError('remoteCleanup');
  }
}

function getFcmRemoteCleanupIdentity(entry: StoredFcmRemoteCleanupObligation) {
  return JSON.stringify([
    entry.userId,
    entry.clientInstanceId,
    entry.kind,
    entry.token,
    entry.kind === 'registration' && entry.token ? null : entry.tokenId,
  ]);
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getPrayerSeasonStorageKey(campusId: number) {
  return `${PRAYER_SEASON_KEY_PREFIX}${campusId}`;
}

function withSecureStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = secureStorageQueue.then(operation, operation);
  secureStorageQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function getStorageItem(key: string) {
  assertNativeStoragePlatform();
  return SecureStore.getItemAsync(key);
}

async function setStorageItem(key: string, value: string) {
  assertNativeStoragePlatform();
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function deleteStorageItem(key: string) {
  assertNativeStoragePlatform();
  await SecureStore.deleteItemAsync(key);
}

function assertNativeStoragePlatform() {
  if (Platform.OS === 'web') {
    throw new Error('FaithLog web builds are not supported.');
  }
}

function createClientInstanceId() {
  const randomPart = Math.random().toString(36).slice(2, 12);
  const timePart = Date.now().toString(36);

  return `faithlog-${timePart}-${randomPart}`;
}
