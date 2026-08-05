import {describe, expect, it, vi} from 'vitest';

import {FaithLogApiError} from '../api/apiError';

vi.mock('../api/client', () => ({
  apiRequest: vi.fn(),
  toPositiveIntegerPathSegment: (value: number) => {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('invalid id');
    return String(value);
  },
}));

import {createWeeklyMaterialApi, type WeeklyMaterialRequest} from './weeklyMaterialApi';

const weekPayload = {
  weekStartDate: '2026-08-03',
  shepherdGuide: {
    assetId: 31,
    materialType: 'SHEPHERD_GUIDE',
    originalFileName: '목자지침.pdf',
    byteSize: 2048,
    sha256: 'a'.repeat(64),
    updatedAt: '2026-08-03T01:00:00Z',
  },
  sundaySharingSheet: null,
  saturdayLeaderSharingSheet: null,
};

describe('weekly material provisional API boundary', () => {
  it('uses the exact week paths and normalized PUT body', async () => {
    const request = vi.fn(async (_path: string, options: {responseParser?: (value: unknown) => unknown}) =>
      options.responseParser?.(weekPayload));
    const api = createWeeklyMaterialApi({contractStatus: 'confirmed-test', request: request as unknown as WeeklyMaterialRequest});

    await api.getWeek('token', 7, '2026-08-03');
    await api.putMaterial('token', 7, '2026-08-03', 'SUNDAY_SHARING_SHEET', 99);

    expect(request.mock.calls[0]?.[0]).toBe(
      '/api/v1/campuses/7/weekly-materials/2026-08-03',
    );
    expect(request.mock.calls[1]?.[0]).toBe(
      '/api/v1/admin/campuses/7/weekly-materials/2026-08-03/SUNDAY_SHARING_SHEET',
    );
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      body: {mediaAssetId: 99},
      method: 'PUT',
    });
  });

  it('parses the three independent weekly material response slots', async () => {
    const response = {
      ...weekPayload,
      sundaySharingSheet: {
        assetId: 32,
        materialType: 'SUNDAY_SHARING_SHEET',
        originalFileName: '주일 나눔지.pdf',
        byteSize: 4096,
        sha256: 'b'.repeat(64),
        updatedAt: '2026-08-03T02:00:00Z',
      },
      saturdayLeaderSharingSheet: {
        assetId: 33,
        materialType: 'SATURDAY_LEADER_SHARING_SHEET',
        originalFileName: '토목모 나눔지.pdf',
        byteSize: 8192,
        sha256: 'c'.repeat(64),
        updatedAt: '2026-08-03T03:00:00Z',
      },
    };
    const request = vi.fn(async (_path: string, options: {responseParser?: (value: unknown) => unknown}) =>
      options.responseParser?.(response));
    const api = createWeeklyMaterialApi({contractStatus: 'confirmed-test', request: request as unknown as WeeklyMaterialRequest});

    await expect(api.getWeek('token', 7, '2026-08-03')).resolves.toMatchObject({
      materials: [
        {materialType: 'SHEPHERD_GUIDE'},
        {materialType: 'SUNDAY_SHARING_SHEET'},
        {materialType: 'SATURDAY_LEADER_SHARING_SHEET'},
      ],
    });
  });

  it('does not parse a 204 delete body', async () => {
    const request = vi.fn(async () => undefined);
    const api = createWeeklyMaterialApi({contractStatus: 'confirmed-test', request: request as unknown as WeeklyMaterialRequest});
    await api.deleteMaterial('token', 7, '2026-08-03', 'SHEPHERD_GUIDE');
    expect(request).toHaveBeenCalledWith(
      '/api/v1/admin/campuses/7/weekly-materials/2026-08-03/SHEPHERD_GUIDE',
      expect.objectContaining({expectedStatuses: [204], method: 'DELETE'}),
    );
    expect((request.mock.calls[0] as unknown[] | undefined)?.[1]).not.toHaveProperty('responseParser');
  });

  it('uses the documented current and paged year paths', async () => {
    const yearPayload = {
      content: [weekPayload], page: 0, size: 20, totalElements: 1, totalPages: 1,
    };
    const request = vi.fn(async (path: string, options: {responseParser: (value: unknown) => unknown}) =>
      options.responseParser(path.endsWith('/current') ? weekPayload : yearPayload));
    const api = createWeeklyMaterialApi({contractStatus: 'confirmed', request: request as unknown as WeeklyMaterialRequest});

    const current = await api.getCurrentWeek('token', 7);
    const page = await api.listYear('token', 7, 2026);

    expect(current.materials[0]).toMatchObject({mediaAssetId: 31, fileName: '목자지침.pdf'});
    expect(page.content[0]?.materials[0]).toMatchObject({materialType: 'SHEPHERD_GUIDE'});
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/campuses/7/weekly-materials/current',
      '/api/v1/campuses/7/weekly-materials?year=2026&page=0&size=20',
    ]);
  });

  it('rejects a response for a different requested week', async () => {
    const request = vi.fn(async (_path: string, options: {responseParser: (value: unknown) => unknown}) =>
      options.responseParser({...weekPayload, weekStartDate: '2026-08-10'}));
    const api = createWeeklyMaterialApi({contractStatus: 'confirmed-test', request: request as unknown as WeeklyMaterialRequest});
    await expect(api.getWeek('token', 7, '2026-08-03')).rejects.toMatchObject({
      detail: {code: 'INVALID_SERVER_RESPONSE'},
    });
  });

  it('fails closed before authentication or network while REST Docs are pending', async () => {
    const request = vi.fn();
    const api = createWeeklyMaterialApi({contractStatus: 'pending', request: request as unknown as WeeklyMaterialRequest});
    await expect(api.getWeek('token', 7, '2026-08-03')).rejects.toBeInstanceOf(
      FaithLogApiError,
    );
    expect(request).not.toHaveBeenCalled();
  });
});
