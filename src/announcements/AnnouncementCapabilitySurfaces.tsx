import type {ComponentProps} from 'react';

import {AdminAnnouncementScreen} from './AdminAnnouncementScreen';
import {AnnouncementCapabilityGate} from './AnnouncementCapabilityGate';
import {AnnouncementRouteScreen} from './AnnouncementRouteScreen';
import {HomeAnnouncementSection} from './HomeAnnouncementSection';

export function HomeAnnouncementCapabilitySection(
  props: ComponentProps<typeof HomeAnnouncementSection>,
) {
  return (
    <AnnouncementCapabilityGate>
      <HomeAnnouncementSection {...props} />
    </AnnouncementCapabilityGate>
  );
}

export function MemberAnnouncementCapabilityRoute(
  props: ComponentProps<typeof AnnouncementRouteScreen>,
) {
  return (
    <AnnouncementCapabilityGate>
      <AnnouncementRouteScreen {...props} />
    </AnnouncementCapabilityGate>
  );
}

export function AdminAnnouncementCapabilityRoute(
  props: ComponentProps<typeof AdminAnnouncementScreen>,
) {
  return (
    <AnnouncementCapabilityGate>
      <AdminAnnouncementScreen {...props} />
    </AnnouncementCapabilityGate>
  );
}
