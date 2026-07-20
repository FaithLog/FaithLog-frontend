import {useEffect} from 'react';

import type {AnalyticsScreenName} from './analyticsContract';
import {trackScreenView} from './appAnalytics';

export function useAnalyticsScreen(screenName: AnalyticsScreenName | null) {
  useEffect(() => {
    if (screenName) trackScreenView(screenName);
  }, [screenName]);
}
