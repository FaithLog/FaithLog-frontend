import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {
  getAuthSessionGeneration,
  isAuthSessionRequestAllowed,
  StaleAuthSessionReadError,
} from '../api/tokenStorage';
import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {createYearlyRecapApi} from './yearlyRecapApi';
import {createYearlyRecapCoordinator} from './yearlyRecapCoordinator';
import {getYearlyRecapDisplayPolicy} from './yearlyRecapPolicy';
import type {YearlyRecap} from './yearlyRecapTypes';

type ExperienceState = {
  recap: YearlyRecap | null;
  visible: boolean;
};

export function useYearlyRecapExperience({
  campusId,
  enabled,
  userId,
}: {
  campusId: number;
  enabled: boolean;
  userId: number;
}) {
  const api = useMemo(() => createYearlyRecapApi(), []);
  const coordinatorRef = useRef<ReturnType<typeof createYearlyRecapCoordinator> | null>(null);
  if (coordinatorRef.current === null) {
    coordinatorRef.current = createYearlyRecapCoordinator();
  }
  const coordinator = coordinatorRef.current;
  const [state, setState] = useState<ExperienceState>({recap: null, visible: false});
  const contextKeyRef = useRef('');

  useEffect(() => {
    if (!enabled) {
      coordinator.reset(null);
      contextKeyRef.current = '';
      setState({recap: null, visible: false});
      return undefined;
    }
    const generation = getAuthSessionGeneration();
    const contextKey = `${generation}:${userId}:${campusId}`;
    contextKeyRef.current = contextKey;
    coordinator.reset(contextKey);
    setState({recap: null, visible: false});
    let active = true;

    void resolveCurrentAccessToken(() => undefined)
      .then((accessToken) => {
        if (!accessToken || !active || !isAuthSessionRequestAllowed(generation)) return null;
        return coordinator.load({
          contextKey,
          load: () => api.getPreviousYearRecap(accessToken, generation),
        });
      })
      .then((result) => {
        if (
          !active ||
          !result ||
          result.status === 'stale' ||
          contextKeyRef.current !== contextKey ||
          !isAuthSessionRequestAllowed(generation)
        ) return;
        const recap = result.recap;
        if (!recap.hasRecapData) return;
        setState({recap, visible: result.shouldAutoPresent});
      })
      .catch((error: unknown) => {
        if (error instanceof StaleAuthSessionReadError) return;
        // Recap failures are intentionally isolated from auth and the main app.
      });

    return () => {
      active = false;
      coordinator.reset(null);
    };
  }, [api, campusId, coordinator, enabled, userId]);

  const open = useCallback(() => {
    setState((current) => current.recap ? {...current, visible: true} : current);
  }, []);
  const close = useCallback(() => {
    setState((current) => ({...current, visible: false}));
  }, []);
  const markFirstFramePresented = useCallback(() => {
    const recap = state.recap;
    if (!recap) return;
    const contextKey = contextKeyRef.current;
    const generation = getAuthSessionGeneration();
    const expectedContextKey = `${generation}:${userId}:${campusId}`;
    if (contextKey !== expectedContextKey || !isAuthSessionRequestAllowed(generation)) return;
    const presentedKey = `${contextKey}:${recap.recapYear}`;
    void coordinator.markPresentedOnce(presentedKey, async () => {
      const accessToken = await resolveCurrentAccessToken(() => undefined);
      if (
        !accessToken ||
        contextKeyRef.current !== contextKey ||
        !isAuthSessionRequestAllowed(generation)
      ) return null;
      return api.markPresented(accessToken, generation, recap.recapYear);
    }).catch(() => undefined);
  }, [api, campusId, coordinator, state.recap, userId]);

  return {
    close,
    homeCardVisible:
      state.recap ? getYearlyRecapDisplayPolicy(state.recap).showHomeCard : false,
    markFirstFramePresented,
    open,
    recap: state.recap,
    visible: state.visible,
  };
}
