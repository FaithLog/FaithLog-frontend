export function isAnnouncementMockModeEnabled() {
  const requested = process.env.EXPO_PUBLIC_MOCK_MODE?.trim().toLowerCase() === 'true';
  if (!requested) return false;
  return isLocalAnnouncementEnvironment();
}

/**
 * Single exposure gate for the announcement experience.
 *
 * The production contract is confirmed against backend #237 REST Docs.
 * Shipped preview/production builds expose the live transport, while
 * local/development builds still require an explicit integration or mock flag.
 */
export function isAnnouncementCapabilityEnabled() {
  const environment = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (environment === 'preview' || environment === 'production') return true;
  if (!isLocalAnnouncementEnvironment()) return false;
  const integrationRequested =
    process.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED?.trim().toLowerCase() === 'true';
  return integrationRequested || isAnnouncementMockModeEnabled();
}

/**
 * PDF remains mock-only until backend #242 REST Docs are merged and the native
 * document picker is approved. This prevents provisional fields from leaking
 * into the production announcement contract.
 */
export function isAnnouncementPdfCapabilityEnabled() {
  return isAnnouncementMockModeEnabled() &&
    process.env.EXPO_PUBLIC_ANNOUNCEMENT_PDF_ENABLED?.trim().toLowerCase() === 'true';
}

function isLocalAnnouncementEnvironment() {
  const environment = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  return environment === 'local' || environment === 'development';
}
