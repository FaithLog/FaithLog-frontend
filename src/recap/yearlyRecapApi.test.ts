import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => ({
  apiRequest: vi.fn(),
  isMockModeEnabled: vi.fn(() => false),
}));

import {
  applyYearlyRecapSectionCapabilities,
  createYearlyRecapApi,
  type YearlyRecapRequestDispatcher,
  YEARLY_RECAP_CONTRACT_STATUS,
  YEARLY_RECAP_PRODUCTION_CAPABILITIES,
} from './yearlyRecapApi';
import {getMockYearlyRecap} from './yearlyRecapMock';
import type {AuthSessionGeneration} from '../api/tokenStorage';
import {apiRequest} from '../api/client';

const AUTH_GENERATION = 3 as AuthSessionGeneration;

describe('yearly recap API boundary', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  it('enables the final production contract and dispatches through the authenticated client', async () => {
    const recap = getMockYearlyRecap('recap-default');
    vi.mocked(apiRequest).mockResolvedValue(recap as never);
    const api = createYearlyRecapApi({isMockMode: () => false});

    await expect(api.getPreviousYearRecap('access-token', AUTH_GENERATION)).resolves.toEqual(recap);

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/users/me/yearly-recaps/previous',
      expect.objectContaining({
        accessToken: 'access-token',
        authSessionGeneration: AUTH_GENERATION,
      }),
    );
    expect(YEARLY_RECAP_CONTRACT_STATUS).toBe('final');
    expect(YEARLY_RECAP_PRODUCTION_CAPABILITIES).toEqual({
      commentActivity: true,
      endpoint: true,
      penaltySummary: true,
    });
  });

  it('requires final comment and penalty sections in production responses', async () => {
    const recap = getMockYearlyRecap('recap-partial');
    const request: YearlyRecapRequestDispatcher = async (_path, options) =>
      options.responseParser(recap);
    const api = createYearlyRecapApi({isMockMode: () => false, request});

    await expect(api.getPreviousYearRecap('access-token', AUTH_GENERATION)).rejects.toMatchObject({
      detail: {code: 'INVALID_SERVER_RESPONSE'},
    });
  });

  it('uses the personal-only presented path with auth lineage and no request body', async () => {
    const requestSpy = vi.fn();
    const request: YearlyRecapRequestDispatcher = async (path, options) => {
      requestSpy(path, options);
      return options.responseParser(null);
    };
    const api = createYearlyRecapApi({isMockMode: () => false, request});

    await api.markPresented('access-token', AUTH_GENERATION, 2026);

    expect(requestSpy).toHaveBeenCalledWith(
      '/api/v1/users/me/yearly-recaps/2026/presented',
      expect.objectContaining({
        accessToken: 'access-token',
        authSessionGeneration: AUTH_GENERATION,
        method: 'POST',
      }),
    );
    expect(requestSpy.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('filters exact sections when their explicit production capabilities are closed', () => {
    const recap = getMockYearlyRecap('recap-default');
    const filtered = applyYearlyRecapSectionCapabilities(recap, {
      commentActivity: false,
      penaltySummary: false,
    });

    expect(filtered).not.toHaveProperty('commentActivity');
    expect(filtered).not.toHaveProperty('penaltySummary');
    expect(filtered.devotion).toEqual(recap.devotion);
  });

  it('uses a bodyless idempotent presented request in mock mode', async () => {
    const requestSpy = vi.fn();
    const request: YearlyRecapRequestDispatcher = async (path, options) => {
      requestSpy(path, options);
      return options.responseParser(null);
    };
    const api = createYearlyRecapApi({isMockMode: () => true, request});

    await api.markPresented('access-token', AUTH_GENERATION, 2026);

    expect(requestSpy).toHaveBeenCalledWith(
      '/api/v1/users/me/yearly-recaps/2026/presented',
      expect.objectContaining({method: 'POST'}),
    );
    expect(requestSpy.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });
});
