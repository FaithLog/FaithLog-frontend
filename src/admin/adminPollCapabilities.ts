import type {PollSummary} from '../api/types';

export function canManageAdminPoll(
  poll: Pick<PollSummary, 'manageableByMe' | 'pollType'> | null,
) {
  return poll !== null &&
    (poll.pollType !== 'COFFEE' || poll.manageableByMe === true);
}
