import * as SecureStore from 'expo-secure-store';
import {Platform} from 'react-native';

import type {TokenPair} from './types';

const AUTH_TOKENS_KEY = 'faithlog.authTokens.v2';
const AUTH_INVALIDATED_KEY = 'faithlog.authInvalidated';
const LEGACY_ACCESS_TOKEN_KEY = 'faithlog.accessToken';
const LEGACY_REFRESH_TOKEN_KEY = 'faithlog.refreshToken';
const FCM_REGISTRATION_KEY = 'faithlog.fcmRegistration.v2';
const FCM_INVALIDATED_KEY = 'faithlog.fcmRegistrationInvalidated';
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

export type StoredFcmRegistration = {
  token: string | null;
  tokenId: number | null;
  userId: number | null;
  clientInstanceId: string | null;
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

let authSessionGeneration = 0 as AuthSessionGeneration;
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

  const stored = await getStoredAuthSession();
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
    if (!isAuthSessionGenerationCurrent(generation)) {
      return false;
    }

    const record: StoredTokenRecord = {
      version: 1,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    await setStorageItem(AUTH_INVALIDATED_KEY, INVALIDATED_VALUE);
    if (!isAuthSessionGenerationCurrent(generation)) return false;
    await setStorageItem(AUTH_TOKENS_KEY, JSON.stringify(record));

    if (!isAuthSessionGenerationCurrent(generation)) {
      return false;
    }

    await Promise.allSettled([
      deleteStorageItem(LEGACY_ACCESS_TOKEN_KEY),
      deleteStorageItem(LEGACY_REFRESH_TOKEN_KEY),
    ]);
    if (!isAuthSessionGenerationCurrent(generation)) return false;
    await deleteStorageItem(AUTH_INVALIDATED_KEY);

    if (!isAuthSessionGenerationCurrent(generation)) {
      await setStorageItem(AUTH_INVALIDATED_KEY, INVALIDATED_VALUE);
      return false;
    }

    if (isAuthSessionGenerationCurrent(generation)) {
      cachedAccessToken = record.accessToken;
      currentSessionAccessTokens.add(record.accessToken);
    }

    return isAuthSessionGenerationCurrent(generation);
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
      !isAuthSessionGenerationCurrent(generation) ||
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
    await setStorageItem(FCM_REGISTRATION_KEY, JSON.stringify(record));

    if (!isAuthSessionGenerationCurrent(generation)) {
      return false;
    }

    await deleteStorageItem(FCM_INVALIDATED_KEY);
    await Promise.allSettled([
      deleteStorageItem(LEGACY_FCM_TOKEN_KEY),
      deleteStorageItem(LEGACY_FCM_TOKEN_ID_KEY),
    ]);

    return isAuthSessionGenerationCurrent(generation);
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
