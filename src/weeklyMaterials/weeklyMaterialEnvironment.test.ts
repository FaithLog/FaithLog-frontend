import {afterEach, describe, expect, it} from 'vitest';

import {isWeeklyMaterialCapabilityEnabled} from './weeklyMaterialEnvironment';

const originalAppEnv = process.env.EXPO_PUBLIC_APP_ENV;
const originalMock = process.env.EXPO_PUBLIC_MOCK_MODE;
const originalFeature = process.env.EXPO_PUBLIC_WEEKLY_MATERIALS_ENABLED;

afterEach(() => {
  restore('EXPO_PUBLIC_APP_ENV', originalAppEnv);
  restore('EXPO_PUBLIC_MOCK_MODE', originalMock);
  restore('EXPO_PUBLIC_WEEKLY_MATERIALS_ENABLED', originalFeature);
});

describe('weekly material capability', () => {
  it('is available when the confirmed production feature flag is enabled', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
    process.env.EXPO_PUBLIC_WEEKLY_MATERIALS_ENABLED = 'true';
    expect(isWeeklyMaterialCapabilityEnabled()).toBe(true);

    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    expect(isWeeklyMaterialCapabilityEnabled()).toBe(true);
    process.env.EXPO_PUBLIC_WEEKLY_MATERIALS_ENABLED = 'false';
    expect(isWeeklyMaterialCapabilityEnabled()).toBe(false);
  });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
