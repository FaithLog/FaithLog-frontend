import type {BibleFriendDesignId} from '../characters/bibleFriendDesignCatalog';

export type GardenExpedition = {
  state: 'AVAILABLE' | 'EXPLORING' | 'READY' | 'CLAIMED';
  id: string | null;
  designId: BibleFriendDesignId | null;
  readyAt: string | null;
  reward: number;
};

export type GardenExpeditionApi = {
  load: () => Promise<GardenExpedition>;
  start: (instanceId: string) => Promise<GardenExpedition>;
  claim: (id: string) => Promise<GardenExpedition>;
};
