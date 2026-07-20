import {
  type NativeUpdatePlatform,
  evaluateUpdatePolicy,
  validateStoreUrl,
} from './updatePolicy';

export const DEFAULT_UPDATE_TITLE = '업데이트가 필요합니다';
export const DEFAULT_UPDATE_MESSAGE = '안정적인 서비스 이용을 위해 최신 버전으로 업데이트해 주세요.';

export const REMOTE_UPDATE_KEYS = [
  'android_min_build',
  'ios_min_build',
  'android_store_url',
  'ios_store_url',
  'force_update_title',
  'force_update_message',
] as const;

export type RemoteUpdateKey = typeof REMOTE_UPDATE_KEYS[number];

export const DEFAULT_REMOTE_UPDATE_VALUES: Record<RemoteUpdateKey, string> = {
  android_min_build: '0',
  ios_min_build: '0',
  android_store_url: 'https://play.google.com/store/apps/details?id=com.faithlog.app',
  ios_store_url: 'https://apps.apple.com/app/id6784053598',
  force_update_title: DEFAULT_UPDATE_TITLE,
  force_update_message: DEFAULT_UPDATE_MESSAGE,
};

export type RemoteUpdateConfigSnapshot = {
  androidMinimumBuild: string | null;
  iosMinimumBuild: string | null;
  androidStoreUrl: string | null;
  iosStoreUrl: string | null;
  title: string | null;
  message: string | null;
};

export type RemoteUpdateValueReader = {
  setDefaults(values: Record<RemoteUpdateKey, string>): Promise<void>;
  fetchAndActivate(): Promise<boolean>;
  getString(key: RemoteUpdateKey): string;
};

export type UpdateRequirement =
  | {required: false}
  | {required: true; message: string; storeUrl: string | null; title: string};

export async function readRemoteUpdateConfig(
  reader: RemoteUpdateValueReader,
): Promise<RemoteUpdateConfigSnapshot> {
  try {
    await reader.setDefaults(DEFAULT_REMOTE_UPDATE_VALUES);
  } catch {
    // A native/configuration failure must not block access to the app.
  }

  try {
    await reader.fetchAndActivate();
  } catch {
    // Continue with the last activated cache or the in-app defaults.
  }

  return {
    androidMinimumBuild: readValue(reader, 'android_min_build'),
    iosMinimumBuild: readValue(reader, 'ios_min_build'),
    androidStoreUrl: readValue(reader, 'android_store_url'),
    iosStoreUrl: readValue(reader, 'ios_store_url'),
    title: readValue(reader, 'force_update_title'),
    message: readValue(reader, 'force_update_message'),
  };
}

export function resolveUpdateRequirement({
  platform,
  currentBuild,
  snapshot,
}: {
  platform: NativeUpdatePlatform | string;
  currentBuild: string | null | undefined;
  snapshot: RemoteUpdateConfigSnapshot;
}): UpdateRequirement {
  const policy = evaluateUpdatePolicy({
    platform,
    currentBuild,
    androidMinimumBuild: snapshot.androidMinimumBuild,
    iosMinimumBuild: snapshot.iosMinimumBuild,
  });
  if (!policy.required || (platform !== 'android' && platform !== 'ios')) {
    return {required: false};
  }

  return {
    required: true,
    title: safeCopy(snapshot.title, DEFAULT_UPDATE_TITLE, 120),
    message: safeCopy(snapshot.message, DEFAULT_UPDATE_MESSAGE, 500),
    storeUrl: validateStoreUrl(
      platform,
      platform === 'android' ? snapshot.androidStoreUrl : snapshot.iosStoreUrl,
    ),
  };
}

function readValue(reader: RemoteUpdateValueReader, key: RemoteUpdateKey) {
  try {
    return reader.getString(key);
  } catch {
    return null;
  }
}

function safeCopy(value: string | null, fallback: string, maxLength: number) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : fallback;
}
