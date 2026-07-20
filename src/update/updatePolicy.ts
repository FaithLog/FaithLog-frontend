export type NativeUpdatePlatform = 'android' | 'ios';

type UpdatePolicyInput = {
  platform: NativeUpdatePlatform | string;
  currentBuild: string | null | undefined;
  androidMinimumBuild: string | null | undefined;
  iosMinimumBuild: string | null | undefined;
};

export type UpdatePolicyResult =
  | {required: true; currentBuild: number; minimumBuild: number}
  | {
      required: false;
      reason: 'invalid-current' | 'invalid-minimum' | 'not-required' | 'unsupported-platform';
    };

export function parseNativeBuild(value: string | null | undefined) {
  const parsed = parseStrictSafeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

export function parseMinimumBuild(value: string | null | undefined) {
  return parseStrictSafeInteger(value);
}

export function evaluateUpdatePolicy(input: UpdatePolicyInput): UpdatePolicyResult {
  if (input.platform !== 'android' && input.platform !== 'ios') {
    return {required: false, reason: 'unsupported-platform'};
  }

  const currentBuild = parseNativeBuild(input.currentBuild);
  if (currentBuild === null) return {required: false, reason: 'invalid-current'};

  const minimumBuild = parseMinimumBuild(
    input.platform === 'android' ? input.androidMinimumBuild : input.iosMinimumBuild,
  );
  if (minimumBuild === null) return {required: false, reason: 'invalid-minimum'};
  if (currentBuild >= minimumBuild) return {required: false, reason: 'not-required'};

  return {required: true, currentBuild, minimumBuild};
}

export function validateStoreUrl(platform: NativeUpdatePlatform, value: string | null | undefined) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (platform === 'android' && url.hostname !== 'play.google.com') return null;
    if (platform === 'ios' && url.hostname !== 'apps.apple.com') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseStrictSafeInteger(value: string | null | undefined) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
