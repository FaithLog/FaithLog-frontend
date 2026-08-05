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
  campusId: 7,
  weekStartDate: '2026-08-03',
  materials: [
    {
      materialType: 'SHEPHERD_GUIDE',
      mediaAssetId: 31,
      fileName: '목자지침.pdf',
      byteSize: 2048,
      sha256: 'a'.repeat(64),
      updatedAt: '2026-08-03T01:00:00Z',
      uploadedByName: '관리자',
    },
  ],
};

describe('weekly material provisional API boundary', () => {
  it('uses the exact week paths and normalized PUT body', async () => {
    const request = vi.fn(async (_path: string, options: {responseParser?: (value: unknown) => unknown}) =>
      options.responseParser?.(weekPayload));
    const api = createWeeklyMaterialApi({contractStatus: 'confirmed-test', request: request as unknown as WeeklyMaterialRequest});

    await api.getWeek('token', 7, '2026-08-03');
    await api.putMaterial('token', 7, '2026-08-03', 'SHARING_SHEET', 99);

    expect(request.mock.calls[0]?.[0]).toBe(
      '/api/v1/campuses/7/weekly-materials/2026-08-03',
    );
    expect(request.mock.calls[1]?.[0]).toBe(
      '/api/v1/admin/campuses/7/weekly-materials/2026-08-03/SHARING_SHEET',
    );
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      body: {mediaAssetId: 99},
      method: 'PUT',
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

  it('rejects a response for a different campus or week', async () => {
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
