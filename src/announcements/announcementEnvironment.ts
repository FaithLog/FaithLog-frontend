export function isAnnouncementMockModeEnabled() {
  const requested = process.env.EXPO_PUBLIC_MOCK_MODE?.trim().toLowerCase() === 'true';
  if (!requested) return false;
  return isLocalAnnouncementEnvironment();
}

/**
 * Single exposure gate for the announcement experience.
 *
 * The production contract is confirmed against backend #237 REST Docs.
 * The confirmed contract is enabled by default in every supported app
 * environment. Local builds may still use an explicit false value as a
 * troubleshooting kill switch; builds no longer need to inject true.
 */
export function isAnnouncementCapabilityEnabled() {
  const environment = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (environment === 'preview' || environment === 'production') return true;
  if (!isLocalAnnouncementEnvironment()) return false;
  const configured = process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED?.trim().toLowerCase();
  if (configured === 'false') return isAnnouncementMockModeEnabled();
  return true;
}

export function isAnnouncementPdfCapabilityEnabled() {
  return isAnnouncementCapabilityEnabled();
}

function isLocalAnnouncementEnvironment() {
  const environment = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  return environment === 'local' || environment === 'development';
}
