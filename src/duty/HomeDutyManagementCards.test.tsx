import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {MyDutyAssignment} from '../api/types';
import {FaithLogApiError} from '../api/client';
import type {AuthGateState} from '../auth/authGate';
import type {MealMyDutyAssignment} from '../meal/mealTypes';

const access = vi.hoisted(() => ({
  authGeneration: 3,
  resolveCurrentAccessToken: vi.fn(),
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);

  return {
    Pressable: host('Pressable'),
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
    View: host('View'),
  };
});
vi.mock('../auth/accessTokenResolver', () => access);
vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: () => access.authGeneration,
  isAuthSessionRequestAllowed: (generation: number) => generation === access.authGeneration,
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {},
}));
vi.mock('../components/IconexIcon', () => ({IconexIcon: () => null}));
vi.mock('../theme', () => ({
  colors: new Proxy({}, {get: () => '#000000'}),
  radius: {pill: 999},
  typography: {cardTitle: {}},
}));

import {
  HomeDutyManagementCards,
  type HomeDutyManagementApi,
} from './HomeDutyManagementCards';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('HomeDutyManagementCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.authGeneration = 3;
    access.resolveCurrentAccessToken.mockResolvedValue('access-token');
  });

  it('shows only the meal card to an active meal duty member', async () => {
    const renderer = await renderCards(api({coffee: coffeeDuty(false), meal: mealDuty(true)}));

    expect(byLabel(renderer, '밥 정산 관리 열기')).toHaveLength(1);
    expect(byLabel(renderer, '커피 정산 관리 열기')).toHaveLength(0);
    expect(textOccurrences(renderer, '담당 관리')).toBe(1);
    await unmount(renderer);
  });

  it('shows only the coffee card to an active coffee duty member', async () => {
    const renderer = await renderCards(api({coffee: coffeeDuty(true), meal: mealDuty(false)}));

    expect(byLabel(renderer, '커피 정산 관리 열기')).toHaveLength(1);
    expect(byLabel(renderer, '밥 정산 관리 열기')).toHaveLength(0);
    await unmount(renderer);
  });

  it('shows both independent cards and opens their existing routes', async () => {
    const onOpenCoffee = vi.fn();
    const onOpenMeal = vi.fn();
    const renderer = await renderCards(
      api({coffee: coffeeDuty(true), meal: mealDuty(true)}),
      {onOpenCoffee, onOpenMeal},
    );

    await act(async () => {
      byLabel(renderer, '커피 정산 관리 열기')[0]!.props.onPress();
      byLabel(renderer, '밥 정산 관리 열기')[0]!.props.onPress();
    });
    expect(onOpenCoffee).toHaveBeenCalledOnce();
    expect(onOpenMeal).toHaveBeenCalledOnce();
    await unmount(renderer);
  });

  it('renders no block when neither duty is active regardless of user role', async () => {
    const renderer = await renderCards(api({coffee: coffeeDuty(false), meal: mealDuty(false)}));

    expect(textOccurrences(renderer, '담당 관리')).toBe(0);
    expect(byLabel(renderer, '커피 정산 관리 열기')).toHaveLength(0);
    expect(byLabel(renderer, '밥 정산 관리 열기')).toHaveLength(0);
    await unmount(renderer);
  });

  it('keeps one successful duty card when the other duty lookup fails and offers retry', async () => {
    const getMealDuty = vi.fn().mockRejectedValue(new Error('offline'));
    const renderer = await renderCards({
      getCoffeeDuty: vi.fn().mockResolvedValue(coffeeDuty(true)),
      getMealDuty,
    });

    expect(byLabel(renderer, '커피 정산 관리 열기')).toHaveLength(1);
    expect(byLabel(renderer, '담당 관리 권한 다시 확인')).toHaveLength(1);
    await act(async () => {
      byLabel(renderer, '담당 관리 권한 다시 확인')[0]!.props.onPress();
      await flushPromises();
    });
    expect(getMealDuty).toHaveBeenCalledTimes(2);
    await unmount(renderer);
  });

  it('does not expose a previous campus duty after the selected campus changes', async () => {
    const oldCoffee = deferred<MyDutyAssignment>();
    const oldMeal = deferred<MealMyDutyAssignment>();
    const dutyApi: HomeDutyManagementApi = {
      getCoffeeDuty: vi.fn((_token, campusId) =>
        campusId === 1 ? oldCoffee.promise : Promise.resolve(coffeeDuty(false, campusId))),
      getMealDuty: vi.fn((_token, campusId) =>
        campusId === 1 ? oldMeal.promise : Promise.resolve(mealDuty(true, campusId))),
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(cardElement(dutyApi, {campusId: 1}));
      await flushPromises();
      renderer.update(cardElement(dutyApi, {campusId: 2}));
      await flushPromises();
    });

    expect(byLabel(renderer, '밥 정산 관리 열기')).toHaveLength(1);
    expect(byLabel(renderer, '커피 정산 관리 열기')).toHaveLength(0);

    await act(async () => {
      oldCoffee.resolve(coffeeDuty(true, 1));
      oldMeal.resolve(mealDuty(false, 1));
      await flushPromises();
    });
    expect(byLabel(renderer, '밥 정산 관리 열기')).toHaveLength(1);
    expect(byLabel(renderer, '커피 정산 관리 열기')).toHaveLength(0);
    await unmount(renderer);
  });

  it('routes only a current-session 401 through the shared session-expired state', async () => {
    const setAuthState = vi.fn();
    const expired = new FaithLogApiError({
      kind: 'sessionExpired',
      code: 'AUTH_UNAUTHORIZED',
      message: '로그인이 만료되었습니다.',
      status: 401,
    });
    const dutyApi: HomeDutyManagementApi = {
      getCoffeeDuty: vi.fn().mockRejectedValue(expired),
      getMealDuty: vi.fn().mockResolvedValue(mealDuty(false)),
    };
    const renderer = await renderCards(dutyApi, {setAuthState});

    expect(setAuthState).toHaveBeenCalledOnce();
    expect(setAuthState).toHaveBeenCalledWith({
      status: 'sessionExpired',
      message: '로그인이 만료되었습니다.',
    });
    expect(textOccurrences(renderer, '담당 관리')).toBe(0);
    await unmount(renderer);
  });
});

async function renderCards(
  dutyApi: HomeDutyManagementApi,
  options: {
    onOpenCoffee?: () => void;
    onOpenMeal?: () => void;
    setAuthState?: (state: AuthGateState) => void;
  } = {},
) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      cardElement(dutyApi, options),
    );
    await flushPromises();
  });
  return renderer;
}

function cardElement(
  dutyApi: HomeDutyManagementApi,
  options: {
    campusId?: number;
    onOpenCoffee?: () => void;
    onOpenMeal?: () => void;
    setAuthState?: (state: AuthGateState) => void;
  } = {},
) {
  return (
    <HomeDutyManagementCards
      api={dutyApi}
      campusId={options.campusId ?? 1}
      onOpenCoffee={options.onOpenCoffee ?? vi.fn()}
      onOpenMeal={options.onOpenMeal ?? vi.fn()}
      setAuthState={options.setAuthState ?? vi.fn()}
      userId={7}
    />
  );
}

function api({coffee, meal}: {coffee: MyDutyAssignment; meal: MealMyDutyAssignment}): HomeDutyManagementApi {
  return {
    getCoffeeDuty: vi.fn().mockResolvedValue(coffee),
    getMealDuty: vi.fn().mockResolvedValue(meal),
  };
}

function coffeeDuty(isActive: boolean, campusId = 1): MyDutyAssignment {
  return {
    campusId,
    userId: 7,
    dutyType: 'COFFEE',
    isActive,
  };
}

function mealDuty(isActive: boolean, campusId = 1): MealMyDutyAssignment {
  return {campusId, userId: 7, dutyType: 'MEAL', isActive};
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

async function flushPromises() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function byLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll((node) =>
    String(node.type) === 'Pressable' && node.props.accessibilityLabel === label);
}

function textOccurrences(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAll((node) =>
    String(node.type) === 'Text' && node.children.join('') === text).length;
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => renderer.unmount());
}
