export function shouldUseShepherdAttendanceMock() {
  const environment = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  return (environment === 'development' || environment === 'local') &&
    process.env.EXPO_PUBLIC_MOCK_MODE?.trim().toLowerCase() === 'true';
}

export function isShepherdAttendanceCapabilityEnabled() {
  return shouldUseShepherdAttendanceMock();
}
