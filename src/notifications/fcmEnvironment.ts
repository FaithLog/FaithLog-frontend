const FCM_ENABLED_APP_ENVS = new Set(['preview', 'prod', 'production']);

export type FcmRuntimeDisabledReason = 'localEnvironment' | 'mockMode';

export type FcmRuntimeAvailability =
  | {enabled: true}
  | {
      enabled: false;
      reason: FcmRuntimeDisabledReason;
      message: string;
    };

export function getFcmRuntimeAvailability(): FcmRuntimeAvailability {
  if (process.env.EXPO_PUBLIC_MOCK_MODE?.trim().toLowerCase() === 'true') {
    return {
      enabled: false,
      reason: 'mockMode',
      message: '목업 데이터 모드에서는 기기 알림 연결을 사용하지 않습니다.',
    };
  }

  const appEnv = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase() || 'local';

  if (!FCM_ENABLED_APP_ENVS.has(appEnv)) {
    return {
      enabled: false,
      reason: 'localEnvironment',
      message: '로컬 실행에서는 기기 알림 연결을 건너뜁니다.',
    };
  }

  return {enabled: true};
}

export function isFcmRuntimeEnabled() {
  return getFcmRuntimeAvailability().enabled;
}
