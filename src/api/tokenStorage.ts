import * as SecureStore from 'expo-secure-store';

import type {TokenPair} from './types';

const ACCESS_TOKEN_KEY = 'faithlog.accessToken';
const REFRESH_TOKEN_KEY = 'faithlog.refreshToken';
const FCM_TOKEN_KEY = 'faithlog.fcmToken';
const FCM_TOKEN_ID_KEY = 'faithlog.fcmTokenId';
const CLIENT_INSTANCE_ID_KEY = 'faithlog.clientInstanceId';

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
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);

  return {accessToken, refreshToken};
}

export async function saveTokens(tokens: Pick<TokenPair, 'accessToken' | 'refreshToken'>) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(FCM_TOKEN_KEY),
    SecureStore.deleteItemAsync(FCM_TOKEN_ID_KEY),
  ]);
}

export async function getStoredFcmRegistration(): Promise<StoredFcmRegistration> {
  const [token, tokenIdValue] = await Promise.all([
    SecureStore.getItemAsync(FCM_TOKEN_KEY),
    SecureStore.getItemAsync(FCM_TOKEN_ID_KEY),
  ]);
  const parsedTokenId = tokenIdValue ? Number(tokenIdValue) : null;
  const tokenId =
    parsedTokenId && Number.isInteger(parsedTokenId) && parsedTokenId > 0
      ? parsedTokenId
      : null;

  return {token, tokenId};
}

export async function saveFcmToken(token: string) {
  await SecureStore.setItemAsync(FCM_TOKEN_KEY, token);
}

export async function saveFcmTokenId(tokenId: number) {
  await SecureStore.setItemAsync(FCM_TOKEN_ID_KEY, String(tokenId));
}

export async function clearFcmRegistration() {
  await Promise.all([
    SecureStore.deleteItemAsync(FCM_TOKEN_KEY),
    SecureStore.deleteItemAsync(FCM_TOKEN_ID_KEY),
  ]);
}

export async function getOrCreateClientInstanceId() {
  const stored = await SecureStore.getItemAsync(CLIENT_INSTANCE_ID_KEY);

  if (stored) {
    return stored;
  }

  const clientInstanceId = createClientInstanceId();
  await SecureStore.setItemAsync(CLIENT_INSTANCE_ID_KEY, clientInstanceId);

  return clientInstanceId;
}

function createClientInstanceId() {
  const randomPart = Math.random().toString(36).slice(2, 12);
  const timePart = Date.now().toString(36);

  return `faithlog-${timePart}-${randomPart}`;
}
