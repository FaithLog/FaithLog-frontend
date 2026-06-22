import * as SecureStore from 'expo-secure-store';

import type {TokenPair} from './types';

const ACCESS_TOKEN_KEY = 'faithlog.accessToken';
const REFRESH_TOKEN_KEY = 'faithlog.refreshToken';

export type StoredTokens = {
  accessToken: string | null;
  refreshToken: string | null;
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
  ]);
}
