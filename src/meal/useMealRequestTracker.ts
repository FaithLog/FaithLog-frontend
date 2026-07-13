import {useEffect, useLayoutEffect, useRef, useState} from 'react';

import {createMealRequestTracker} from './mealRequestLifecycle';

export function useMealRequestTracker(scope: string) {
  const trackerRef = useRef<ReturnType<typeof createMealRequestTracker> | null>(null);
  if (trackerRef.current === null) {
    trackerRef.current = createMealRequestTracker(scope);
  }
  const tracker = trackerRef.current;
  const [committedScope, setCommittedScope] = useState(scope);

  useLayoutEffect(() => {
    tracker.syncScope(scope);
    setCommittedScope(scope);
  }, [scope, tracker]);

  useEffect(() => {
    tracker.mount();
    return () => tracker.unmount();
  }, [tracker]);

  return {scopeIsCommitted: committedScope === scope, tracker};
}
