import {afterEach, describe, expect, it} from 'vitest';

import {getFcmRuntimeAvailability, isFcmRuntimeEnabled} from './fcmEnvironment';

const originalAppEnv = process.env.EXPO_PUBLIC_APP_ENV;
const originalMockMode = process.env.EXPO_PUBLIC_MOCK_MODE;

afterEach(() => {
  process.env.EXPO_PUBLIC_APP_ENV = originalAppEnv;
  process.env.EXPO_PUBLIC_MOCK_MODE = originalMockMode;
});

describe('FCM runtime environment', () => {
  it('keeps local Expo runs disabled', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'local';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';

    expect(getFcmRuntimeAvailability()).toMatchObject({
      enabled: false,
      reason: 'localEnvironment',
    });
    expect(isFcmRuntimeEnabled()).toBe(false);
  });

  it.each(['preview', 'prod', 'production'])(
    'enables FCM in %s builds',
    (appEnv) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnv;
      process.env.EXPO_PUBLIC_MOCK_MODE = 'false';

      expect(getFcmRuntimeAvailability()).toEqual({enabled: true});
      expect(isFcmRuntimeEnabled()).toBe(true);
    },
  );

  it('keeps mock mode disabled even in preview', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    expect(getFcmRuntimeAvailability()).toMatchObject({
      enabled: false,
      reason: 'mockMode',
    });
  });
});
