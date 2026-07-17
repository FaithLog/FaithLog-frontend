import type {PollSummary} from '../api/types';
import type {AdminPollType} from '../api/adminPollApi';

export type AdminPollTypeFilter = AdminPollType | 'ALL' | 'COFFEE_MEAL';

export function filterAdminPollsByType(
  polls: PollSummary[],
  filter: AdminPollTypeFilter,
) {
  if (filter === 'ALL') return polls;
  if (filter === 'COFFEE_MEAL') {
    return polls.filter(
      (poll) => poll.pollType === 'COFFEE' || poll.pollType === 'MEAL',
    );
  }
  return polls.filter((poll) => poll.pollType === filter);
}
