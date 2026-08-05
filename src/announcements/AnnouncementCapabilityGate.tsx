import type {PropsWithChildren} from 'react';

import {isAnnouncementCapabilityEnabled} from './announcementEnvironment';

export function AnnouncementCapabilityGate({children}: PropsWithChildren) {
  return isAnnouncementCapabilityEnabled() ? children : null;
}
