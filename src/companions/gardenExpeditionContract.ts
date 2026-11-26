import type {BibleFriendDesignId} from '../characters/bibleFriendDesignCatalog';

export type GardenSeason = {
  name: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';
  startsOn: string;
  endsOn: string;
  completed: number;
  target: number;
  reward: number;
  claimed: boolean;
};

export type GardenExpedition = {
  state: 'AVAILABLE' | 'EXPLORING' | 'READY' | 'CLAIMED';
  id: string | null;
  designId: BibleFriendDesignId | null;
  season?: GardenSeason;
  readyAt: string | null;
  reward: number;
};

export type GardenExpeditionApi = {
  load: () => Promise<GardenExpedition>;
  start: (instanceId: string) => Promise<GardenExpedition>;
  claimSeason: (seasonStart: string) => Promise<GardenExpedition>;
  claim: (id: string) => Promise<GardenExpedition>;
};
