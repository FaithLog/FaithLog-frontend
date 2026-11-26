import type {BibleFriendDesignId} from '../characters/bibleFriendDesignCatalog';
import type {GardenBackgroundId} from './gardenBackgrounds';

export type FriendGardenPage = {
  visible: boolean;
  items: {userId: number; name: string}[];
  nextCursor: number | null;
};
export type FriendGardenVisit = {
  name: string;
  backgroundId: GardenBackgroundId;
  animals: {slot: number; designId: BibleFriendDesignId; x: number; y: number; stage: 0 | 1 | 2}[];
};
export type FriendGardenApi = {
  list: (after?: number) => Promise<FriendGardenPage>;
  setVisibility: (visible: boolean) => Promise<boolean>;
  help: (ownerId: number, slot: number, action: 'FEED' | 'CLEAN') => Promise<void>;
  visit: (ownerId: number) => Promise<FriendGardenVisit>;
};
