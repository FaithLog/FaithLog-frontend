import type {PollSummary} from '../api/types';
import {isEndedPoll} from '../polls/pollListVisibility';

export type AdminPollStatusTab = 'ongoing' | 'closed';

const ADMIN_POLL_LIST_LIMIT = 10;

export function getAdminPollsForStatusTab(
  polls: PollSummary[],
  statusTab: AdminPollStatusTab,
  now = new Date(),
  focusPollId: number | null = null,
) {
  const matchingPolls =
    statusTab === 'ongoing'
      ? polls.filter((poll) => !isEndedPoll(poll, now))
      : polls.filter((poll) => isEndedPoll(poll, now));

  const sortedPolls = matchingPolls
    .slice()
    .sort((left, right) =>
      statusTab === 'ongoing'
        ? getSortableEndTime(left) - getSortableEndTime(right)
        : getSortableEndTime(right) - getSortableEndTime(left),
    );

  return includeFocusedPoll(sortedPolls, focusPollId);
}

function getSortableEndTime(poll: PollSummary) {
  const time = new Date(poll.endsAt).getTime();

  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function includeFocusedPoll(polls: PollSummary[], focusPollId: number | null) {
  const limitedPolls = polls.slice(0, ADMIN_POLL_LIST_LIMIT);

  if (focusPollId === null || limitedPolls.some((poll) => poll.id === focusPollId)) {
    return limitedPolls;
  }

  const focusedPoll = polls.find((poll) => poll.id === focusPollId);

  if (!focusedPoll) {
    return limitedPolls;
  }

  return [focusedPoll, ...limitedPolls].slice(0, ADMIN_POLL_LIST_LIMIT);
}
