import {Directory, File, Paths} from 'expo-file-system';

import type {AnnouncementImageCacheStorage} from './announcementImageCacheAdapter';
import {ANNOUNCEMENT_IMAGE_CACHE_DIRECTORY_NAME} from './announcementImageTemporaryFiles';

export async function createAnnouncementImageFileSystemStorage(): Promise<AnnouncementImageCacheStorage> {
  const directory = new Directory(Paths.cache, ANNOUNCEMENT_IMAGE_CACHE_DIRECTORY_NAME);
  const file = (name: string) => new File(directory, name);

  return {
    async deleteEntry(name) {
      if (!directory.exists) return;
      const entry = directory.list().find((candidate) => candidate.name === name);
      if (entry) entry.delete();
    },
    async ensureDirectory() {
      directory.create({idempotent: true, intermediates: true, overwrite: false});
    },
    async fileInfo(name) {
      const target = file(name);
      return {exists: target.exists, sizeBytes: target.size, uri: target.uri};
    },
    async listEntryNames() {
      return directory.exists ? directory.list().map((entry) => entry.name) : [];
    },
    async readText(name) {
      return file(name).text();
    },
    async writeBytes(name, bytes) {
      const target = file(name);
      target.create({intermediates: false, overwrite: true});
      target.write(bytes);
    },
    async writeTextAtomically(name, temporaryName, text) {
      const temporary = file(temporaryName);
      temporary.create({intermediates: false, overwrite: true});
      temporary.write(text);
      await temporary.move(file(name), {overwrite: true});
    },
  };
}
