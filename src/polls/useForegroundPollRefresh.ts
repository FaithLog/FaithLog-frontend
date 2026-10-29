import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';

export const POLL_REFRESH_INTERVAL_MS = 5000;

// The guard also invalidates requests that finish after backgrounding or navigation.
export function useForegroundPollRefresh(scopeKey: string, refresh: (isCurrent: () => boolean) => Promise<void>) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    let mounted = true;
    let active = AppState.currentState === 'active';
    let revision = 0;
    let inFlight = false;
    let resumePending = false;
    const run = async () => {
      if (!mounted || !active || inFlight) return;
      const expected = revision;
      inFlight = true;
      try {
        await latest.current(() => mounted && active && revision === expected);
      } finally {
        inFlight = false;
        if (resumePending && mounted && active) { resumePending = false; void run(); }
      }
    };
    const timer = setInterval(() => { void run(); }, POLL_REFRESH_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      const wasActive = active;
      active = state === 'active';
      if (!active) revision += 1;
      if (active && !wasActive) {
        if (inFlight) resumePending = true;
        else void run();
      }
    });
    return () => { mounted = false; revision += 1; clearInterval(timer); subscription.remove(); };
  }, [scopeKey]);
}
