import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {YearlyRecap} from './yearlyRecapTypes';

const mocks = vi.hoisted(() => ({
  generation: 7,
  getPreviousYearRecap: vi.fn(),
  markPresented: vi.fn(),
}));

vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: vi.fn(() => mocks.generation),
  isAuthSessionRequestAllowed: vi.fn((generation: number) => generation === mocks.generation),
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {},
}));
vi.mock('../auth/accessTokenResolver', () => ({
  resolveCurrentAccessToken: vi.fn(async () => 'access-token'),
}));
vi.mock('./yearlyRecapApi', () => ({
  createYearlyRecapApi: vi.fn(() => ({
    getPreviousYearRecap: mocks.getPreviousYearRecap,
    markPresented: mocks.markPresented,
  })),
}));

import {useYearlyRecapExperience} from './useYearlyRecapExperience';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const RECAP: YearlyRecap = {
  recapYear: 2026,
  hasRecapData: true,
  presentation: {
    shouldAutoPresent: true,
    homeCardVisible: true,
    homeCardVisibleUntil: '2027-01-14T23:59:59+09:00',
    firstPresentedAt: null,
  },
  campusJourney: {campuses: []},
  devotion: {
    quietTimeCount: 10,
    bibleReadingCount: 8,
    prayerCount: 12,
    allCompletedDayCount: 5,
    submittedWeekCount: 4,
    longestStreakDays: 3,
    mostActiveMonth: 8,
  },
  prayerActivity: {submittedWeekCount: 0, participatedSeasonCount: 0},
  commentActivity: {writtenCount: 0},
  penaltySummary: {
    totalCount: 0,
    totalAmount: 0,
    paidCount: 0,
    paidAmount: 0,
    unpaidCount: 0,
    unpaidAmount: 0,
  },
};

type Experience = ReturnType<typeof useYearlyRecapExperience>;
let latest: Experience | null = null;
const mounted: ReactTestRenderer[] = [];

function ExperienceProbe({
  campusId,
  entryTarget,
  userId = 42,
}: {
  campusId: number;
  entryTarget: null | 'campusSelect';
  userId?: number;
}) {
  const experience = useYearlyRecapExperience({
    canAutoPresent: entryTarget === null,
    userId,
  });
  latest = experience;
  return React.createElement('Probe', {campusId, visible: experience.visible});
}

describe('yearly recap boot lifecycle', () => {
  beforeEach(() => {
    latest = null;
    mocks.generation = 7;
    mocks.getPreviousYearRecap.mockReset().mockResolvedValue(RECAP);
    mocks.markPresented.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    act(() => mounted.splice(0).forEach((renderer) => renderer.unmount()));
  });

  it('keeps one GET, auto modal claim, and presented POST across campus/entryTarget A to B to A', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<ExperienceProbe campusId={1} entryTarget={null} />);
    });
    mounted.push(renderer);

    expect(mocks.getPreviousYearRecap).toHaveBeenCalledOnce();
    expect(latest?.visible).toBe(true);

    await act(async () => {
      latest?.markFirstFramePresented();
      latest?.markFirstFramePresented();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.markPresented).toHaveBeenCalledOnce();

    act(() => latest?.close());
    act(() => renderer.update(<ExperienceProbe campusId={2} entryTarget="campusSelect" />));
    expect(latest?.recap).toBe(RECAP);
    expect(latest?.visible).toBe(false);
    act(() => renderer.update(<ExperienceProbe campusId={2} entryTarget={null} />));
    act(() => renderer.update(<ExperienceProbe campusId={1} entryTarget={null} />));

    expect(mocks.getPreviousYearRecap).toHaveBeenCalledOnce();
    expect(mocks.markPresented).toHaveBeenCalledOnce();
    expect(latest?.visible).toBe(false);
  });

  it('fails closed immediately on account identity change and ignores the old user response', async () => {
    const nextRecap = {...RECAP, recapYear: 2025};
    let resolveOld!: (value: YearlyRecap) => void;
    let resolveNext!: (value: YearlyRecap) => void;
    mocks.getPreviousYearRecap
      .mockImplementationOnce(() => new Promise<YearlyRecap>((resolve) => {
        resolveOld = resolve;
      }))
      .mockImplementationOnce(() => new Promise<YearlyRecap>((resolve) => {
        resolveNext = resolve;
      }));
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<ExperienceProbe campusId={1} entryTarget={null} userId={42} />);
      await Promise.resolve();
    });
    mounted.push(renderer);
    expect(mocks.getPreviousYearRecap).toHaveBeenCalledOnce();
    expect(latest?.recap).toBeNull();

    mocks.generation = 8;
    await act(async () => {
      renderer.update(<ExperienceProbe campusId={1} entryTarget={null} userId={99} />);
      await Promise.resolve();
    });
    expect(latest?.recap).toBeNull();
    expect(latest?.visible).toBe(false);
    expect(mocks.getPreviousYearRecap).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveOld(RECAP);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latest?.recap).toBeNull();
    expect(latest?.visible).toBe(false);

    await act(async () => {
      resolveNext(nextRecap);
      await Promise.resolve();
    });
    expect(latest?.recap).toBe(nextRecap);
  });
});
