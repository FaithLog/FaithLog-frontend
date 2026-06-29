import type {PollSummary} from '../api/types';

const CLOSED_POLL_VISIBLE_MS = 24 * 60 * 60 * 1000;

export type UserPollListGroups = {
  activePolls: PollSummary[];
  scheduledPolls: PollSummary[];
  respondedPolls: PollSummary[];
  recentlyClosedPolls: PollSummary[];
};

function getPollEndTime(poll: Pick<PollSummary, 'endsAt'>) {
  const endedAt = new Date(poll.endsAt).getTime();

  return Number.isNaN(endedAt) ? null : endedAt;
}

export function isEndedPoll(poll: Pick<PollSummary, 'endsAt' | 'status'>, now = new Date()) {
  if (poll.status === 'CLOSED') {
    return true;
  }

  const endedAt = getPollEndTime(poll);
  if (endedAt === null) {
    return true;
  }

  return endedAt <= now.getTime();
}

export function isPollActionable(poll: Pick<PollSummary, 'endsAt' | 'status'>, now = new Date()) {
  return poll.status === 'OPEN' && !isEndedPoll(poll, now);
}

export function isRecentlyEndedPoll(poll: Pick<PollSummary, 'endsAt' | 'status'>, now = new Date()) {
  const endedAt = getPollEndTime(poll);
  if (endedAt === null) {
    return false;
  }

  const elapsedMs = now.getTime() - endedAt;
  return elapsedMs >= 0 && elapsedMs <= CLOSED_POLL_VISIBLE_MS;
}

export function getUserPollListGroups(
  polls: PollSummary[],
  now = new Date(),
): UserPollListGroups {
  return {
    activePolls: polls.filter((poll) => isPollActionable(poll, now) && !poll.responded),
    scheduledPolls: polls.filter((poll) => poll.status === 'SCHEDULED' && !isEndedPoll(poll, now)),
    respondedPolls: polls.filter((poll) => isPollActionable(poll, now) && poll.responded),
    recentlyClosedPolls: polls.filter((poll) => isEndedPoll(poll, now) && isRecentlyEndedPoll(poll, now)),
  };
}

export function getUserVisiblePollCount(groups: UserPollListGroups) {
  return (
    groups.activePolls.length +
    groups.scheduledPolls.length +
    groups.respondedPolls.length +
    groups.recentlyClosedPolls.length
  );
}
