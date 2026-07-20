import type {PollDetail, PollOptionAddRequest} from '../api/types';

type PollOptionAddVisibility = Pick<PollDetail, 'pollType' | 'status'> & {
  allowUserOptionAdd?: boolean;
};

export function getPollOptionAddLabel(
  detail: PollOptionAddVisibility,
) {
  if (detail.status !== 'OPEN' || detail.allowUserOptionAdd !== true) {
    return null;
  }

  if (detail.pollType === 'COFFEE') {
    return '커피 메뉴 추가';
  }

  return '항목 추가';
}

export function createPollOptionAddRequest(
  pollType: string,
  option: {content: string; menuId?: number},
): PollOptionAddRequest {
  if (pollType === 'COFFEE') {
    const menuId = option.menuId;
    if (typeof menuId !== 'number' || !Number.isSafeInteger(menuId) || menuId <= 0) {
      throw new Error('Coffee poll option requires a menu ID.');
    }
    return {menuId};
  }

  const content = option.content.trim();
  if (!content) {
    throw new Error('Poll option requires content.');
  }
  return {content};
}
