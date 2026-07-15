import type {PollSummary} from '../api/types';

export function canManageAdminPoll(
  poll: Pick<PollSummary, 'manageableByMe' | 'pollType'> | null,
) {
  return poll?.manageableByMe === true;
}
