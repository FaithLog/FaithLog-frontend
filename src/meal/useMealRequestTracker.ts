import {useEffect, useRef} from 'react';

import {createMealRequestTracker} from './mealRequestLifecycle';

export function useMealRequestTracker(scope: string) {
  const trackerRef = useRef<ReturnType<typeof createMealRequestTracker> | null>(null);
  if (trackerRef.current === null) {
    trackerRef.current = createMealRequestTracker(scope);
  }
  trackerRef.current.syncScope(scope);

  useEffect(() => {
    const tracker = trackerRef.current;
    tracker?.mount();
    return () => tracker?.unmount();
  }, []);

  return trackerRef.current;
}
