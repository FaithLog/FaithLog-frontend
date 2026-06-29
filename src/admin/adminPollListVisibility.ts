import type {PollSummary} from '../api/types';
import {isEndedPoll} from '../polls/pollListVisibility';

export type AdminPollStatusTab = 'ongoing' | 'closed';

const ADMIN_POLL_LIST_LIMIT = 10;

export function getAdminPollsForStatusTab(
  polls: PollSummary[],
  statusTab: AdminPollStatusTab,
  now = new Date(),
) {
  const matchingPolls =
    statusTab === 'ongoing'
      ? polls.filter((poll) => !isEndedPoll(poll, now))
      : polls.filter((poll) => isEndedPoll(poll, now));

  return matchingPolls
    .slice()
    .sort((left, right) =>
      statusTab === 'ongoing'
        ? getSortableEndTime(left) - getSortableEndTime(right)
        : getSortableEndTime(right) - getSortableEndTime(left),
    )
    .slice(0, ADMIN_POLL_LIST_LIMIT);
}

function getSortableEndTime(poll: PollSummary) {
  const time = new Date(poll.endsAt).getTime();

  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}
