import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('./tokenStorage', () => ({
  clearTokens: vi.fn(),
  getAuthSessionGeneration: vi.fn(() => 0),
  getStoredAuthSession: vi.fn(),
  getStoredTokens: vi.fn(),
  isAccessTokenOwnedByAuthSession: vi.fn(async () => true),
  isAuthSessionGenerationCurrent: vi.fn(() => true),
  saveTokens: vi.fn(),
}));

import {
  closeAdminPoll,
  createAdminPoll,
  createAdminPollTemplate,
  type AdminPollCreateRequest,
  type AdminPoll,
  type AdminPollTemplate,
  type AdminPollTemplateRequest,
} from './adminPollApi';
import {FaithLogApiError} from './client';
import {getApiErrorPresentation} from './errorPolicy';
import type {ApiEnvelope} from './types';

const API_BASE_URL = 'https://api.faithlog.test/root/';

function envelope<T>(data: T, patch: Partial<ApiEnvelope<T>> = {}): ApiEnvelope<T> {
  return {
    success: true,
    code: 'SUCCESS',
    message: '요청이 성공했습니다.',
    data,
    timestamp: '2026-06-25T00:00:00.000Z',
    ...patch,
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

const baseRequest: AdminPollCreateRequest = {
  templateId: null,
  title: '토요 목자모임',
  pollType: 'SATURDAY',
  selectionType: 'SINGLE',
  isAnonymous: false,
  chargeGenerationType: 'NONE',
  paymentCategory: null,
  paymentAccountId: null,
  startsAt: '2026-06-28T04:00:00.000Z',
  endsAt: '2026-06-28T05:00:00.000Z',
  options: [
    {content: '참석', menuId: null, priceAmount: null, sortOrder: 1},
    {content: '불참', menuId: null, priceAmount: null, sortOrder: 2},
    {content: '지각', menuId: null, priceAmount: null, sortOrder: 3},
    {content: '미정', menuId: null, priceAmount: null, sortOrder: 4},
  ],
};

const pollResponse: AdminPoll = {
  id: 1001,
  campusId: 1,
  templateId: null,
  title: '토요 목자모임',
  pollType: 'SATURDAY',
  selectionType: 'SINGLE',
  isAnonymous: false,
  chargeGenerationType: 'NONE',
  paymentCategory: null,
  paymentAccountId: null,
  startsAt: baseRequest.startsAt,
  endsAt: baseRequest.endsAt,
  status: 'OPEN',
  options: [],
};

const templateRequest: AdminPollTemplateRequest = {
  title: '토요 목자모임 반복투표',
  pollType: 'SATURDAY',
  selectionType: 'SINGLE',
  chargeGenerationType: 'NONE',
  paymentCategory: null,
  paymentAccountId: null,
  autoCreateEnabled: true,
  startDayOfWeek: 6,
  startTime: '09:00:00',
  endDayOfWeek: 6,
  endTime: '11:00:00',
  options: baseRequest.options.slice(0, 2),
};

const templateResponse: AdminPollTemplate = {
  id: 801,
  campusId: 1,
  title: templateRequest.title,
  pollType: 'CUSTOM',
  selectionType: 'SINGLE',
  chargeGenerationType: 'NONE',
  paymentCategory: null,
  paymentAccountId: null,
  autoCreateEnabled: true,
  startDayOfWeek: 6,
  startTime: '09:00:00',
  endDayOfWeek: 6,
  endTime: '11:00:00',
  isDefault: false,
  isActive: true,
  options: [],
};

describe('admin poll API', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = API_BASE_URL;
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_MOCK_MODE;
  });

  it.each([
    ['SATURDAY', '토요 목자모임'],
    ['WEDNESDAY', '수요예배 참석'],
  ] as const)('serializes %s direct poll create as backend CUSTOM payload', async (pollType, title) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, envelope({...pollResponse, pollType, title})));

    await createAdminPoll('access-token', 1, {
      ...baseRequest,
      pollType,
      title,
    });

    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    expect(fetchCall).toBeDefined();
    const [, init] = fetchCall;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body).toEqual({
      title,
      pollType: 'CUSTOM',
      selectionType: 'SINGLE',
      isAnonymous: false,
      allowUserOptionAdd: false,
      chargeGenerationType: 'NONE',
      startsAt: baseRequest.startsAt,
      endsAt: baseRequest.endsAt,
      options: [
        {content: '참석', priceAmount: 0, sortOrder: 1},
        {content: '불참', priceAmount: 0, sortOrder: 2},
        {content: '지각', priceAmount: 0, sortOrder: 3},
        {content: '미정', priceAmount: 0, sortOrder: 4},
      ],
    });
    expect(body).not.toHaveProperty('templateId');
    expect(body).not.toHaveProperty('paymentCategory');
    expect(body).not.toHaveProperty('paymentAccountId');
  });

  it('serializes template based poll create with templateId', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, envelope({...pollResponse, templateId: 77})),
    );

    await createAdminPoll('access-token', 1, {
      ...baseRequest,
      templateId: 77,
    });

    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    expect(fetchCall).toBeDefined();
    const [, init] = fetchCall;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body).toMatchObject({
      templateId: 77,
      title: baseRequest.title,
      pollType: 'CUSTOM',
      selectionType: 'SINGLE',
      isAnonymous: false,
      allowUserOptionAdd: false,
      chargeGenerationType: 'NONE',
      startsAt: baseRequest.startsAt,
      endsAt: baseRequest.endsAt,
      options: [],
    });
    expect(body).not.toHaveProperty('paymentCategory');
    expect(body).not.toHaveProperty('paymentAccountId');
  });

  it('serializes user option add setting for custom direct poll create', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        200,
        envelope({...pollResponse, allowUserOptionAdd: true, pollType: 'CUSTOM'}),
      ),
    );

    await createAdminPoll('access-token', 1, {
      ...baseRequest,
      allowUserOptionAdd: true,
      pollType: 'CUSTOM',
      title: '사용자 항목 추가 투표',
    });

    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    expect(fetchCall).toBeDefined();
    const [, init] = fetchCall;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body).toMatchObject({
      allowUserOptionAdd: true,
      pollType: 'CUSTOM',
      title: '사용자 항목 추가 투표',
    });
  });

  it('exposes backend validation messages for admin poll create failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        422,
        envelope(null, {
          success: false,
          code: 'INVALID_POLL_OPTION',
          message: '선택지 형식이 올바르지 않습니다.',
        }),
      ),
    );

    await expect(createAdminPoll('access-token', 1, baseRequest)).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(FaithLogApiError);
      expect((error as FaithLogApiError).detail).toMatchObject({
        kind: 'error',
        status: 422,
        code: 'INVALID_POLL_OPTION',
        message: '선택지 형식이 올바르지 않습니다. (INVALID_POLL_OPTION)',
      });
      expect(
        getApiErrorPresentation((error as FaithLogApiError).detail, {
          exposeValidationMessage: true,
        }).message,
      ).toBe('선택지 형식이 올바르지 않습니다. (INVALID_POLL_OPTION)');
      return true;
    });
  });

  it('serializes coffee poll create with user option additions enabled', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, envelope({...pollResponse, pollType: 'COFFEE'})),
    );

    await createAdminPoll('access-token', 1, {
      ...baseRequest,
      allowUserOptionAdd: true,
      chargeGenerationType: 'OPTION_PRICE',
      paymentAccountId: 3,
      paymentCategory: 'COFFEE',
      pollType: 'COFFEE',
      options: [{content: null, menuId: 4, priceAmount: null, sortOrder: 1}],
    });

    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    expect(fetchCall).toBeDefined();
    const [, init] = fetchCall;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body).toMatchObject({
      allowUserOptionAdd: true,
      chargeGenerationType: 'OPTION_PRICE',
      paymentAccountId: 3,
      paymentCategory: 'COFFEE',
      pollType: 'COFFEE',
    });
  });

  it('closes an admin poll through the close endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, envelope({...pollResponse, status: 'CLOSED'})),
    );

    await closeAdminPoll('access-token', 1, 1001);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.faithlog.test/root/api/v1/admin/campuses/1/polls/1001/close',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );
  });

  it('serializes repeat poll template create without null payment fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, envelope(templateResponse)));

    await createAdminPollTemplate('access-token', 1, templateRequest);

    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    expect(fetchCall).toBeDefined();
    const [, init] = fetchCall;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body).toMatchObject({
      title: '토요 목자모임 반복투표',
      pollType: 'CUSTOM',
      selectionType: 'SINGLE',
      chargeGenerationType: 'NONE',
      autoCreateEnabled: true,
      startDayOfWeek: 6,
      startTime: '09:00:00',
      endDayOfWeek: 6,
      endTime: '11:00:00',
      options: [
        {content: '참석', menuId: null, priceAmount: null, sortOrder: 1},
        {content: '불참', menuId: null, priceAmount: null, sortOrder: 2},
      ],
    });
    expect(body).not.toHaveProperty('paymentCategory');
    expect(body).not.toHaveProperty('paymentAccountId');
  });

  it('exposes backend validation messages for repeat poll template failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        422,
        envelope(null, {
          success: false,
          code: 'INVALID_POLL_TEMPLATE',
          message: '반복투표 설정을 저장할 수 없습니다.',
        }),
      ),
    );

    await expect(
      createAdminPollTemplate('access-token', 1, templateRequest),
    ).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(FaithLogApiError);
      expect((error as FaithLogApiError).detail).toMatchObject({
        kind: 'error',
        status: 422,
        code: 'INVALID_POLL_TEMPLATE',
        message: '반복투표 설정을 저장할 수 없습니다. (INVALID_POLL_TEMPLATE)',
      });
      return true;
    });
  });

  it.each([
    ['negative ID', {...pollResponse, id: -1}],
    ['negative price', {
      ...pollResponse,
      options: [
        {
          id: 9,
          content: '잘못된 선택지',
          composeMenuCode: null,
          priceAmount: -1,
          sortOrder: 1,
        },
      ],
    }],
    ['malformed date', {...pollResponse, startsAt: 'not-a-date'}],
  ] as const)(
    'rejects a malformed admin poll response with %s',
    async (_label, responseData) => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(200, envelope(responseData)),
      );

      await expect(createAdminPoll('access-token', 1, baseRequest)).rejects.toSatisfy(
        (error) => {
          expect(error).toBeInstanceOf(FaithLogApiError);
          expect((error as FaithLogApiError).detail).toMatchObject({
            kind: 'error',
            code: 'INVALID_SERVER_RESPONSE',
          });
          return true;
        },
      );
    },
  );
});
