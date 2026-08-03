export function isAnnouncementMockModeEnabled() {
  const requested = process.env.EXPO_PUBLIC_MOCK_MODE?.trim().toLowerCase() === 'true';
  if (!requested) return false;
  const environment = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase() || 'local';
  return environment === 'local' || environment === 'development';
}
