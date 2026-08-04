export type PollNoticeCapabilities = Readonly<{
  canAccessMedia: boolean;
  canEditPublishedNotice: boolean;
  canReadNotice: boolean;
}>;

type PollNoticeCapabilityInput = Readonly<{
  mockMode: boolean;
  productionContractConfirmed?: boolean;
  productionFileCacheReady?: boolean;
}>;

// Backend #238 REST Docs and the shared #244 native picker/upload/cache boundary
// are both present in the integrated app.
const PRODUCTION_CONTRACT_CONFIRMED = true;
const PRODUCTION_FILE_CACHE_READY = true;
const MOCK_ALLOWED_APP_ENVIRONMENTS = new Set(['local', 'development']);

export function resolvePollNoticeCapabilities({
  mockMode,
  productionContractConfirmed = PRODUCTION_CONTRACT_CONFIRMED,
  productionFileCacheReady = false,
}: PollNoticeCapabilityInput): PollNoticeCapabilities {
  const canUseNoticeContract = mockMode || productionContractConfirmed;

  return {
    canAccessMedia:
      mockMode || (productionContractConfirmed && productionFileCacheReady),
    canEditPublishedNotice: canUseNoticeContract,
    canReadNotice: canUseNoticeContract,
  };
}

export function getPollNoticeCapabilities(): PollNoticeCapabilities {
  return resolvePollNoticeCapabilities({
    mockMode: isPollNoticeMockModeEnabled(),
    productionContractConfirmed: PRODUCTION_CONTRACT_CONFIRMED,
    productionFileCacheReady: PRODUCTION_FILE_CACHE_READY,
  });
}

function isPollNoticeMockModeEnabled() {
  const mockRequested =
    process.env.EXPO_PUBLIC_MOCK_MODE?.trim().toLowerCase() === 'true';
  if (!mockRequested) return false;

  const appEnvironment =
    process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase() || 'local';
  return MOCK_ALLOWED_APP_ENVIRONMENTS.has(appEnvironment);
}
