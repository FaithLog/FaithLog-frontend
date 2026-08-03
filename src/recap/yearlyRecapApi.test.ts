import {describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => ({
  apiRequest: vi.fn(),
  isMockModeEnabled: vi.fn(() => false),
}));

import {
  createYearlyRecapApi,
  type YearlyRecapRequestDispatcher,
} from './yearlyRecapApi';
import type {AuthSessionGeneration} from '../api/tokenStorage';

const AUTH_GENERATION = 3 as AuthSessionGeneration;

describe('yearly recap API boundary', () => {
  it('fails closed before production network dispatch while REST Docs are pending', async () => {
    const request = vi.fn();
    const api = createYearlyRecapApi({isMockMode: () => false, request});

    await expect(api.getPreviousYearRecap('access-token', AUTH_GENERATION)).rejects.toMatchObject({
      detail: {code: 'API_CONTRACT_PENDING'},
    });
    expect(request).not.toHaveBeenCalled();
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
