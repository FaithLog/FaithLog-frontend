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
  autoPresentationPending: boolean;
  identityKey: string;
  recap: YearlyRecap | null;
  visible: boolean;
};

export function useYearlyRecapExperience({
  canAutoPresent,
  userId,
}: {
  canAutoPresent: boolean;
  userId: number;
}) {
  const api = useMemo(() => createYearlyRecapApi(), []);
  const coordinatorRef = useRef<ReturnType<typeof createYearlyRecapCoordinator> | null>(null);
  if (coordinatorRef.current === null) {
    coordinatorRef.current = createYearlyRecapCoordinator();
  }
  const coordinator = coordinatorRef.current;
  const generation = getAuthSessionGeneration();
  const identityKey = `${generation}:${userId}`;
  const identityKeyRef = useRef(identityKey);
  identityKeyRef.current = identityKey;
  const [state, setState] = useState<ExperienceState>({
    autoPresentationPending: false,
    identityKey,
    recap: null,
    visible: false,
  });
  const activeState = state.identityKey === identityKey ? state : null;
  const recap = activeState?.recap ?? null;

  useEffect(() => {
    coordinator.reset(identityKey);
    setState((current) => current.identityKey === identityKey ? current : {
      autoPresentationPending: false,
      identityKey,
      recap: null,
      visible: false,
    });
    let active = true;

    void resolveCurrentAccessToken(() => undefined)
      .then((accessToken) => {
        if (!accessToken || !active || !isAuthSessionRequestAllowed(generation)) return null;
        return coordinator.load({
          contextKey: identityKey,
          load: () => api.getPreviousYearRecap(accessToken, generation),
        });
      })
      .then((result) => {
        if (
          !active ||
          !result ||
          result.status === 'stale' ||
          identityKeyRef.current !== identityKey ||
          !isAuthSessionRequestAllowed(generation)
        ) return;
        const nextRecap = result.recap;
        if (!nextRecap.hasRecapData) return;
        setState((current) => current.identityKey === identityKey ? {
          ...current,
          autoPresentationPending: result.shouldAutoPresent,
          recap: nextRecap,
          visible: false,
        } : current);
      })
      .catch((error: unknown) => {
        if (error instanceof StaleAuthSessionReadError) return;
        // Recap failures are intentionally isolated from auth and the main app.
      });

    return () => {
      active = false;
    };
  }, [api, coordinator, generation, identityKey]);

  useEffect(() => {
    setState((current) => {
      if (current.identityKey !== identityKey) return current;
      if (!canAutoPresent) {
        return current.visible ? {...current, visible: false} : current;
      }
      if (!current.autoPresentationPending) return current;
      return {...current, autoPresentationPending: false, visible: true};
    });
  }, [activeState?.autoPresentationPending, canAutoPresent, identityKey]);

  const open = useCallback(() => {
    setState((current) =>
      current.identityKey === identityKey && current.recap
        ? {...current, visible: true}
        : current,
    );
  }, [identityKey]);
  const close = useCallback(() => {
    setState((current) =>
      current.identityKey === identityKey ? {...current, visible: false} : current,
    );
  }, [identityKey]);
  const markFirstFramePresented = useCallback(() => {
    if (!recap) return;
    const currentGeneration = getAuthSessionGeneration();
    const expectedIdentityKey = `${currentGeneration}:${userId}`;
    if (identityKey !== expectedIdentityKey || !isAuthSessionRequestAllowed(currentGeneration)) return;
    const presentedKey = `${identityKey}:${recap.recapYear}`;
    void coordinator.markPresentedOnce(presentedKey, async () => {
      const accessToken = await resolveCurrentAccessToken(() => undefined);
      if (
        !accessToken ||
        identityKeyRef.current !== identityKey ||
        !isAuthSessionRequestAllowed(currentGeneration)
      ) return null;
      return api.markPresented(accessToken, currentGeneration, recap.recapYear);
    }).catch(() => undefined);
  }, [api, coordinator, identityKey, recap, userId]);

  return {
    close,
    homeCardVisible:
      recap ? getYearlyRecapDisplayPolicy(recap).showHomeCard : false,
    markFirstFramePresented,
    open,
    recap,
    visible: activeState?.visible ?? false,
  };
}
