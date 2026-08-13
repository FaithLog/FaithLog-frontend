import {afterEach, describe, expect, it} from 'vitest';
import {isShepherdAttendanceCapabilityEnabled, shouldUseShepherdAttendanceMock} from './shepherdAttendanceEnvironment';

const originalEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
const originalMock = process.env.EXPO_PUBLIC_MOCK_MODE;
afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.EXPO_PUBLIC_APP_ENV; else process.env.EXPO_PUBLIC_APP_ENV = originalEnvironment;
  if (originalMock === undefined) delete process.env.EXPO_PUBLIC_MOCK_MODE; else process.env.EXPO_PUBLIC_MOCK_MODE = originalMock;
});
describe('shepherd attendance environment', () => {
  it('enables the confirmed feature in production and keeps mock selection development-only', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development'; process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
    expect(shouldUseShepherdAttendanceMock()).toBe(true); expect(isShepherdAttendanceCapabilityEnabled()).toBe(true);
    process.env.EXPO_PUBLIC_APP_ENV = 'production'; process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
    expect(shouldUseShepherdAttendanceMock()).toBe(false); expect(isShepherdAttendanceCapabilityEnabled()).toBe(true);
  });
});
