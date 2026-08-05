export function isWeeklyMaterialCapabilityEnabled() {
  const enabled = process.env.EXPO_PUBLIC_WEEKLY_MATERIALS_ENABLED?.trim().toLowerCase() === 'true';
  return enabled;
}

export function shouldUseWeeklyMaterialMockApi() {
  const environment = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  const mock = process.env.EXPO_PUBLIC_MOCK_MODE?.trim().toLowerCase() === 'true';
  return (environment === 'local' || environment === 'development') && mock;
}
