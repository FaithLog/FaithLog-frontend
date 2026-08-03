export function isAnnouncementMockModeEnabled() {
  const requested = process.env.EXPO_PUBLIC_MOCK_MODE?.trim().toLowerCase() === 'true';
  if (!requested) return false;
  return isLocalAnnouncementEnvironment();
}

/**
 * Single exposure gate for the announcement experience.
 *
 * Production and preview builds remain fail-closed even when either public
 * environment flag is accidentally set. Local/development integration builds
 * may explicitly enable the surface without enabling the mock transport so
 * the native media pipeline can be exercised against an approved dev backend.
 */
export function isAnnouncementCapabilityEnabled() {
  if (!isLocalAnnouncementEnvironment()) return false;
  const integrationRequested =
    process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED?.trim().toLowerCase() === 'true';
  return integrationRequested || isAnnouncementMockModeEnabled();
}

function isLocalAnnouncementEnvironment() {
  const environment = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  return environment === 'local' || environment === 'development';
}
