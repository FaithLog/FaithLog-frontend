import type {AnnouncementImageCacheStorage} from './announcementImageCacheAdapter';

export async function createAnnouncementImageFileSystemStorage(): Promise<AnnouncementImageCacheStorage> {
  throw new Error('Announcement image cache storage is unavailable on this platform.');
}
