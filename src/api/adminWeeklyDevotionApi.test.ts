import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('./client', () => ({
  DEFAULT_REQUEST_TIMEOUT_MS: 15_000,
  getApiBaseUrl: vi.fn(() => 'https://configured-api.example.test'),
  authenticatedTransportRequest: vi.fn(
    async <T,>({
      accessToken,
      execute,
    }: {
      accessToken: string;
      execute: (effectiveAccessToken: string) => Promise<T>;
    }) => execute(accessToken),
  ),
}));

import {FaithLogApiError} from './apiError';
import {authenticatedTransportRequest} from './client';
import {
  ADMIN_WEEKLY_DEVOTION_CONTRACT_STATUS,
  createAdminWeeklyDevotionTransport,
  createMockAdminWeeklyDevotionAdapter,
  createProductionAdminWeeklyDevotionAdapter,
  parseAdminWeeklyDevotion,
  parseAdminWeeklyDevotionEnvelope,
} from './adminWeeklyDevotionApi';

function createDailyChecks() {
  return Array.from({length: 7}, (_, index) => ({
    bibleReading: index < 4,
    prayer: index < 6,
    quietTime: index < 5,
    recordDate: `2026-07-${String(13 + index).padStart(2, '0')}`,
  }));
}

const VALID_WEEK = {
  activeMemberCount: 3,
  missingCount: 1,
  missingMembers: [
    {email: 'missing@example.test', name: '김미제출', userId: 3},
  ],
  submittedCount: 2,
  submittedMembers: [
    {
      bibleReadingCount: 4,
      dailyChecks: createDailyChecks(),
      email: 'member@example.test',
      name: '홍제출',
      penalty: {amount: 2500, chargeItemId: 10, status: 'UNPAID'},
      prayerCount: 6,
      quietTimeCount: 5,
      saturdayLateMinutes: 15,
      submittedAt: '2026-07-19T10:00:00+09:00',
      userId: 1,
    },
    {
      bibleReadingCount: 7,
      dailyChecks: createDailyChecks().map((check) => ({
        ...check,
        bibleReading: true,
        prayer: true,
        quietTime: true,
      })),
      email: 'paid@example.test',
      name: '박납부',
      penalty: {amount: 0, chargeItemId: 11, status: 'PAID'},
      prayerCount: 7,
      quietTimeCount: 7,
      saturdayLateMinutes: 0,
      submittedAt: '2026-07-19T09:00:00+09:00',
      userId: 2,
    },
  ],
  totalPenaltyAmount: 2500,
  weekEndDate: '2026-07-19',
  weekStartDate: '2026-07-13',
};

function toRestDocsEnvelope(data = VALID_WEEK) {
  return {
    success: true,
    code: 'SUCCESS',
    message: '요청이 성공했습니다.',
    data: {
      ...data,
      submittedMembers: data.submittedMembers.map((member) => ({
        ...member,
        dailyChecks: member.dailyChecks.map((check, index) => {
          const wireCheck: {
            bibleReadingChecked: boolean;
            id: number | null;
            prayerChecked: boolean;
            quietTimeChecked: boolean;
            recordDate: string;
          } = {
            bibleReadingChecked: check.bibleReading,
            id: index + 1,
            prayerChecked: check.prayer,
            quietTimeChecked: check.quietTime,
            recordDate: check.recordDate,
          };
          return wireCheck;
        }),
      })),
    },
    timestamp: '2026-07-13T23:02:35.598003Z',
  };
}

const REQUEST = {
  accessToken: 'admin-access-token',
  authGeneration: 4,
  campusId: 33,
  weekStartDate: '2026-07-13',
};

describe('admin weekly devotion validator', () => {
  it('keeps submitted counts, actual penalty state, daily detail, and missing members', () => {
    expect(parseAdminWeeklyDevotion(VALID_WEEK)).toEqual(VALID_WEEK);
  });

  it.each([
    {...VALID_WEEK, weekStartDate: '2026-07-14'},
    {...VALID_WEEK, submittedCount: -1},
    {...VALID_WEEK, submittedMembers: [{...VALID_WEEK.submittedMembers[0], penalty: {}}]},
    {...VALID_WEEK, missingMembers: [{userId: 3, name: '이름'}]},
  ])('fails closed for an invalid response', (value) => {
    expect(() => parseAdminWeeklyDevotion(value)).toThrow(FaithLogApiError);
  });

  it.each([
    {
      ...VALID_WEEK,
      submittedMembers: [VALID_WEEK.submittedMembers[0], VALID_WEEK.submittedMembers[0]],
      submittedCount: 2,
      activeMemberCount: 3,
    },
    {
      ...VALID_WEEK,
      missingMembers: [{email: 'duplicate@example.test', name: '중복', userId: 1}],
    },
    {
      ...VALID_WEEK,
      submittedMembers: [
        {...VALID_WEEK.submittedMembers[0], quietTimeCount: 8},
        VALID_WEEK.submittedMembers[1],
      ],
    },
    {
      ...VALID_WEEK,
      submittedMembers: [
        {
          ...VALID_WEEK.submittedMembers[0],
          dailyChecks: Array.from({length: 8}, (_, index) => ({
            bibleReading: false,
            prayer: false,
            quietTime: false,
            recordDate: `2026-07-${String(13 + Math.min(index, 6)).padStart(2, '0')}`,
          })),
        },
        VALID_WEEK.submittedMembers[1],
      ],
    },
    {
      ...VALID_WEEK,
      submittedMembers: [
        {
          ...VALID_WEEK.submittedMembers[0],
          dailyChecks: [
            VALID_WEEK.submittedMembers[0]!.dailyChecks[0],
            VALID_WEEK.submittedMembers[0]!.dailyChecks[0],
          ],
        },
        VALID_WEEK.submittedMembers[1],
      ],
    },
  ])('fails closed for duplicate identities, invalid weekly counts, or duplicate days', (value) => {
    expect(() => parseAdminWeeklyDevotion(value)).toThrow(FaithLogApiError);
  });

  it('parses the exact REST Docs envelope and normalizes checked wire fields', () => {
    expect(parseAdminWeeklyDevotionEnvelope(toRestDocsEnvelope(), REQUEST.weekStartDate))
      .toEqual(VALID_WEEK);
  });

  it.each([
    VALID_WEEK,
    {...toRestDocsEnvelope(), success: false},
    {...toRestDocsEnvelope(), code: ''},
    {...toRestDocsEnvelope(), data: null},
    {...toRestDocsEnvelope(), timestamp: 'not-a-date'},
  ])('rejects a bare or malformed production envelope', (value) => {
    expect(() => parseAdminWeeklyDevotionEnvelope(value, REQUEST.weekStartDate))
      .toThrow(FaithLogApiError);
  });

  it.each([
    createDailyChecks().slice(0, 6),
    createDailyChecks().map((check, index) =>
      index === 6 ? {...check, recordDate: '2026-07-18'} : check),
    createDailyChecks().map((check, index) =>
      index === 6 ? {...check, recordDate: '2026-07-20'} : check),
  ])('requires exactly Monday through Sunday daily rows', (dailyChecks) => {
    const invalid = {
      ...VALID_WEEK,
      submittedMembers: [
        {...VALID_WEEK.submittedMembers[0], dailyChecks},
        VALID_WEEK.submittedMembers[1],
      ],
    };
    expect(() => parseAdminWeeklyDevotion(invalid)).toThrow(FaithLogApiError);
  });

  it('accepts a nullable REST Docs daily row id without exposing it to the UI model', () => {
    const envelope = toRestDocsEnvelope();
    envelope.data.submittedMembers[0]!.dailyChecks[0]!.id = null;

    expect(parseAdminWeeklyDevotionEnvelope(envelope, REQUEST.weekStartDate)
      .submittedMembers[0]!.dailyChecks[0]).toEqual({
      bibleReading: true,
      prayer: true,
      quietTime: true,
      recordDate: '2026-07-13',
    });
  });
});

describe('admin weekly devotion adapters', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_ADMIN_WEEKLY_DEVOTION_MOCK_SCENARIO = 'success';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_ADMIN_WEEKLY_DEVOTION_MOCK_SCENARIO;
  });

  it('keeps mock and production adapters on one interface shape', async () => {
    const mock = createMockAdminWeeklyDevotionAdapter();
    const production = createProductionAdminWeeklyDevotionAdapter();

    expect(Object.keys(mock).sort()).toEqual(Object.keys(production).sort());
    await expect(mock.fetchWeek(REQUEST)).resolves.toMatchObject({
      missingCount: 1,
      submittedCount: 2,
    });
  });

  it('provides separate success and empty mock data states', async () => {
    const mock = createMockAdminWeeklyDevotionAdapter();

    await expect(mock.fetchWeek(REQUEST)).resolves.toMatchObject({
      activeMemberCount: 3,
      missingCount: 1,
      submittedCount: 2,
    });
    process.env.EXPO_PUBLIC_ADMIN_WEEKLY_DEVOTION_MOCK_SCENARIO = 'empty';
    await expect(mock.fetchWeek(REQUEST)).resolves.toMatchObject({
      activeMemberCount: 0,
      missingMembers: [],
      submittedMembers: [],
    });
  });

  it.each([
    ['401', 'sessionExpired', 401],
    ['403', 'permissionDenied', 403],
    ['offline', 'offline', undefined],
    ['error', 'error', 500],
  ] as const)('provides a distinct %s mock state', async (scenario, kind, status) => {
    process.env.EXPO_PUBLIC_ADMIN_WEEKLY_DEVOTION_MOCK_SCENARIO = scenario;
    const mock = createMockAdminWeeklyDevotionAdapter();

    await expect(mock.fetchWeek(REQUEST)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(FaithLogApiError);
      expect((error as FaithLogApiError).detail).toMatchObject({
        kind,
        ...(status === undefined ? {} : {status}),
        ...((scenario === '401' || scenario === '403')
          ? {authSessionGeneration: REQUEST.authGeneration}
          : {}),
      });
      return true;
    });
  });

  it('routes the mock 401 through the shared authenticated transport lineage', async () => {
    process.env.EXPO_PUBLIC_ADMIN_WEEKLY_DEVOTION_MOCK_SCENARIO = '401';
    const mock = createMockAdminWeeklyDevotionAdapter();

    await expect(mock.fetchWeek(REQUEST)).rejects.toBeInstanceOf(FaithLogApiError);
    expect(authenticatedTransportRequest).toHaveBeenCalledWith({
      accessToken: REQUEST.accessToken,
      authSessionGeneration: REQUEST.authGeneration,
      execute: expect.any(Function),
    });
  });

  it('uses the configured production origin and the confirmed REST Docs envelope', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) =>
      new Response(JSON.stringify(toRestDocsEnvelope()), {
        headers: {'Content-Type': 'application/json;charset=UTF-8'},
        status: 200,
      }));
    const adapter = createProductionAdminWeeklyDevotionAdapter({fetchImpl});

    expect(ADMIN_WEEKLY_DEVOTION_CONTRACT_STATUS).toBe('confirmed');
    await expect(adapter.fetchWeek(REQUEST)).resolves.toEqual(VALID_WEEK);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://configured-api.example.test/api/v1/admin/campuses/33/devotions/weeks/2026-07-13/members',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer admin-access-token',
        }),
        method: 'GET',
      }),
    );
  });
});

describe('confirmed admin weekly devotion transport', () => {
  it.each(['members', 'export'] as const)(
    'times out a pending %s request as retryable offline state',
    async (operation) => {
      vi.useFakeTimers();
      try {
        const fetchImpl = vi.fn(
          async (_input: string, _init?: RequestInit) =>
            new Promise<Response>(() => undefined),
        );
        const transport = createAdminWeeklyDevotionTransport({
          apiBaseUrl: 'https://api.example.test',
          fetchImpl,
          requestTimeoutMs: 1_000,
        });
        const result = operation === 'members'
          ? transport.fetchWeek(REQUEST)
          : transport.exportWeek(REQUEST);
        const rejection = expect(result).rejects.toSatisfy((error: unknown) => {
          expect(error).toBeInstanceOf(FaithLogApiError);
          expect((error as FaithLogApiError).detail).toMatchObject({
            code: 'REQUEST_TIMEOUT',
            kind: 'offline',
          });
          return true;
        });

        await vi.advanceTimersByTimeAsync(1_000);
        await rejection;
        expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
        expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    },
    1_000,
  );

  it('applies a fresh timeout to the authenticated retry attempt', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(authenticatedTransportRequest).mockImplementationOnce(
        async <T,>({execute}: {execute: (accessToken: string) => Promise<T>}) => {
          await expect(execute('expired-token')).rejects.toBeInstanceOf(FaithLogApiError);
          return execute('refreshed-token');
        },
      );
      const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) => {
        if (fetchImpl.mock.calls.length === 1) {
          return new Response(null, {status: 401});
        }
        return new Promise<Response>(() => undefined);
      });
      const transport = createAdminWeeklyDevotionTransport({
        apiBaseUrl: 'https://api.example.test',
        fetchImpl,
        requestTimeoutMs: 1_000,
      });
      const result = transport.exportWeek(REQUEST);
      const rejection = expect(result).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(FaithLogApiError);
        expect((error as FaithLogApiError).detail).toMatchObject({
          code: 'REQUEST_TIMEOUT',
          kind: 'offline',
        });
        return true;
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await rejection;
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(fetchImpl.mock.calls[1]?.[1]?.headers).toMatchObject({
        Authorization: 'Bearer refreshed-token',
      });
    } finally {
      vi.useRealTimers();
    }
  }, 1_000);

  it('keeps the timeout active while the XLSX response body is still pending', async () => {
    vi.useFakeTimers();
    try {
      const response = new Response(null, {
        headers: {'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
        status: 200,
      });
      vi.spyOn(response, 'arrayBuffer').mockImplementation(
        async () => new Promise<ArrayBuffer>(() => undefined),
      );
      const transport = createAdminWeeklyDevotionTransport({
        apiBaseUrl: 'https://api.example.test',
        fetchImpl: vi.fn(async () => response),
        requestTimeoutMs: 1_000,
      });
      const result = transport.exportWeek(REQUEST);
      const rejection = expect(result).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(FaithLogApiError);
        expect((error as FaithLogApiError).detail).toMatchObject({
          code: 'REQUEST_TIMEOUT',
          kind: 'offline',
        });
        return true;
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  }, 1_000);

  it('uses the exact export URL and Authorization while returning raw bytes', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4]);
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) =>
      new Response(bytes, {
        headers: {
          'Content-Disposition': 'attachment; filename="faithlog-devotion-33-2026-07-13.xlsx"',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        status: 200,
      }),
    );
    const transport = createAdminWeeklyDevotionTransport({
      apiBaseUrl: 'https://api.example.test',
      fetchImpl,
    });

    await expect(transport.exportWeek(REQUEST)).resolves.toEqual({
      bytes,
      fileName: 'faithlog-devotion-33-2026-07-13.xlsx',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/admin/campuses/33/devotions/weeks/2026-07-13/export',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          Authorization: 'Bearer admin-access-token',
        }),
        method: 'GET',
      }),
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Content-Type');
  });

  it.each([
    [400, 'error'],
    [401, 'sessionExpired'],
    [403, 'permissionDenied'],
  ] as const)('separates HTTP %i as %s', async (status, kind) => {
    const transport = createAdminWeeklyDevotionTransport({
      apiBaseUrl: 'https://api.example.test',
      fetchImpl: vi.fn(async (_input: string, _init?: RequestInit) =>
        new Response(null, {status}),
      ),
    });

    await expect(transport.exportWeek(REQUEST)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(FaithLogApiError);
      expect((error as FaithLogApiError).detail).toMatchObject({kind, status});
      return true;
    });
  });

  it('rejects a members payload whose week does not match the requested cache key', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(toRestDocsEnvelope({
        ...VALID_WEEK,
        weekStartDate: '2026-07-20',
        weekEndDate: '2026-07-26',
        submittedMembers: [],
        missingMembers: [],
        submittedCount: 0,
        missingCount: 0,
        activeMemberCount: 0,
        totalPenaltyAmount: 0,
      })), {
        headers: {'Content-Type': 'application/json'},
        status: 200,
      }),
    );
    const transport = createAdminWeeklyDevotionTransport({
      apiBaseUrl: 'https://api.example.test',
      fetchImpl,
    });

    await expect(transport.fetchWeek(REQUEST)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(FaithLogApiError);
      expect((error as FaithLogApiError).detail).toMatchObject({
        code: 'INVALID_SERVER_RESPONSE',
      });
      return true;
    });
  });

  it('classifies malformed success JSON as an invalid server response', async () => {
    const transport = createAdminWeeklyDevotionTransport({
      apiBaseUrl: 'https://api.example.test',
      fetchImpl: vi.fn(async () =>
        new Response('{broken-json', {
          headers: {'Content-Type': 'application/json'},
          status: 200,
        }),
      ),
    });

    await expect(transport.fetchWeek(REQUEST)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(FaithLogApiError);
      expect((error as FaithLogApiError).detail).toMatchObject({
        code: 'INVALID_SERVER_RESPONSE',
        kind: 'error',
        status: 200,
      });
      return true;
    });
  });
});
