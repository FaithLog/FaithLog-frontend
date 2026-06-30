import * as SecureStore from 'expo-secure-store';
import {Platform} from 'react-native';

import type {TokenPair} from './types';

const ACCESS_TOKEN_KEY = 'faithlog.accessToken';
const REFRESH_TOKEN_KEY = 'faithlog.refreshToken';
const FCM_TOKEN_KEY = 'faithlog.fcmToken';
const FCM_TOKEN_ID_KEY = 'faithlog.fcmTokenId';
const CLIENT_INSTANCE_ID_KEY = 'faithlog.clientInstanceId';
const LAST_SELECTED_CAMPUS_ID_KEY = 'faithlog.lastSelectedCampusId';
const webStorageFallback = new Map<string, string>();

export type StoredTokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

export type StoredFcmRegistration = {
  token: string | null;
  tokenId: number | null;
};

export async function getStoredTokens(): Promise<StoredTokens> {
  const [accessToken, refreshToken] = await Promise.all([
    getStorageItem(ACCESS_TOKEN_KEY),
    getStorageItem(REFRESH_TOKEN_KEY),
  ]);

  return {accessToken, refreshToken};
}

export async function saveTokens(tokens: Pick<TokenPair, 'accessToken' | 'refreshToken'>) {
  await Promise.all([
    setStorageItem(ACCESS_TOKEN_KEY, tokens.accessToken),
    setStorageItem(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}

export async function clearTokens() {
  await Promise.all([
    deleteStorageItem(ACCESS_TOKEN_KEY),
    deleteStorageItem(REFRESH_TOKEN_KEY),
    deleteStorageItem(FCM_TOKEN_KEY),
    deleteStorageItem(FCM_TOKEN_ID_KEY),
    deleteStorageItem(LAST_SELECTED_CAMPUS_ID_KEY),
  ]);
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

export async function getStoredFcmRegistration(): Promise<StoredFcmRegistration> {
  const [token, tokenIdValue] = await Promise.all([
    getStorageItem(FCM_TOKEN_KEY),
    getStorageItem(FCM_TOKEN_ID_KEY),
  ]);
  const parsedTokenId = tokenIdValue ? Number(tokenIdValue) : null;
  const tokenId =
    parsedTokenId && Number.isInteger(parsedTokenId) && parsedTokenId > 0
      ? parsedTokenId
      : null;

  return {token, tokenId};
}

export async function saveFcmToken(token: string) {
  await setStorageItem(FCM_TOKEN_KEY, token);
}

export async function saveFcmTokenId(tokenId: number) {
  await setStorageItem(FCM_TOKEN_ID_KEY, String(tokenId));
}

export async function clearFcmRegistration() {
  await Promise.all([
    deleteStorageItem(FCM_TOKEN_KEY),
    deleteStorageItem(FCM_TOKEN_ID_KEY),
  ]);
}

export async function getOrCreateClientInstanceId() {
  const stored = await getStorageItem(CLIENT_INSTANCE_ID_KEY);

  if (stored) {
    return stored;
  }

  const clientInstanceId = createClientInstanceId();
  await setStorageItem(CLIENT_INSTANCE_ID_KEY, clientInstanceId);

  return clientInstanceId;
}

async function getStorageItem(key: string) {
  if (Platform.OS !== 'web') {
    return SecureStore.getItemAsync(key);
  }

  return getBrowserStorage()?.getItem(key) ?? webStorageFallback.get(key) ?? null;
}

async function setStorageItem(key: string, value: string) {
  if (Platform.OS !== 'web') {
    await SecureStore.setItemAsync(key, value);
    return;
  }

  const storage = getBrowserStorage();

  if (storage) {
    storage.setItem(key, value);
    return;
  }

  webStorageFallback.set(key, value);
}

async function deleteStorageItem(key: string) {
  if (Platform.OS !== 'web') {
    await SecureStore.deleteItemAsync(key);
    return;
  }

  getBrowserStorage()?.removeItem(key);
  webStorageFallback.delete(key);
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createClientInstanceId() {
  const randomPart = Math.random().toString(36).slice(2, 12);
  const timePart = Date.now().toString(36);

  return `faithlog-${timePart}-${randomPart}`;
}
