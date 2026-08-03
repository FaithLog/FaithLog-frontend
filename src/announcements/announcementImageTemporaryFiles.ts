export const ANNOUNCEMENT_IMAGE_CACHE_DIRECTORY_NAME = 'faithlog-announcement-images-v1';

type PreparedSession = {
  accepted: boolean;
  epoch: number;
};

type PreparedOperation = {
  assertValid(): void;
  finish(): void;
};

type ExplicitPreparedCleanup = {
  finish(): void;
  releasePreparedFiles(): string[];
  waitForPending(): Promise<void>;
};

export type AnnouncementImageTemporaryFileRegistry = {
  beginExplicitPreparedCleanup(): ExplicitPreparedCleanup;
  beginPreparedOperation(session: PreparedSession): PreparedOperation;
  createPreparedSession(): PreparedSession;
  getProtectedEntryNames(): ReadonlySet<string>;
  protectDownload(name: string): void;
  protectPreparedFile(uri: string, name: string): void;
  unprotectDownload(name: string): void;
  unprotectPreparedFile(uri: string): void;
};

export function createAnnouncementImageTemporaryFileRegistry(): AnnouncementImageTemporaryFileRegistry {
  const activeDownloads = new Set<string>();
  const activePreparedFiles = new Map<string, string>();
  const pendingPreparations = new Set<Promise<void>>();
  let cleanupDepth = 0;
  let epoch = 0;

  return {
    beginExplicitPreparedCleanup() {
      epoch = nextEpoch(epoch);
      cleanupDepth += 1;
      const pendingAtStart = [...pendingPreparations];
      let finished = false;
      return {
        finish() {
          if (finished) return;
          finished = true;
          cleanupDepth = Math.max(0, cleanupDepth - 1);
        },
        releasePreparedFiles() {
          const names = [...activePreparedFiles.values()].sort();
          activePreparedFiles.clear();
          return names;
        },
        async waitForPending() {
          await Promise.allSettled(pendingAtStart);
        },
      };
    },

    beginPreparedOperation(session) {
      if (!session.accepted || cleanupDepth > 0 || session.epoch !== epoch) {
        throw new Error('Announcement prepared image session was invalidated');
      }
      let settle!: () => void;
      const settled = new Promise<void>((resolve) => {
        settle = resolve;
      });
      pendingPreparations.add(settled);
      let finished = false;
      return {
        assertValid() {
          if (cleanupDepth > 0 || session.epoch !== epoch) {
            throw new Error('Announcement prepared image session was invalidated');
          }
        },
        finish() {
          if (finished) return;
          finished = true;
          pendingPreparations.delete(settled);
          settle();
        },
      };
    },

    createPreparedSession() {
      return {accepted: cleanupDepth === 0, epoch};
    },

    getProtectedEntryNames() {
      return new Set([...activeDownloads, ...activePreparedFiles.values()]);
    },

    protectDownload(name) {
      assertOwnedEntryName(name, '.image-download');
      activeDownloads.add(name);
    },

    protectPreparedFile(uri, name) {
      if (!uri.startsWith('file://')) throw new TypeError('Invalid prepared image URI');
      assertOwnedEntryName(name, '.image-upload');
      activePreparedFiles.set(uri, name);
    },

    unprotectDownload(name) {
      activeDownloads.delete(name);
    },

    unprotectPreparedFile(uri) {
      activePreparedFiles.delete(uri);
    },
  };
}

export const announcementImageTemporaryFiles = createAnnouncementImageTemporaryFileRegistry();

function assertOwnedEntryName(name: string, suffix: string) {
  if (!name.endsWith(suffix) || name.includes('/') || name.includes('\\') || name.length > 240) {
    throw new TypeError('Invalid announcement temporary file name');
  }
}

function nextEpoch(current: number) {
  return current >= Number.MAX_SAFE_INTEGER ? 1 : current + 1;
}
