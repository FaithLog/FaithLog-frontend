import {Directory, File, Paths} from 'expo-file-system';

import {
  createPrivateDocumentCache,
  type PrivateDocumentCacheStorage,
} from './privateDocumentCacheCore';

const directoryName = 'faithlog-private-documents-v1';
let singleton: ReturnType<typeof createPrivateDocumentCache> | null = null;

export function getPrivateDocumentCache() {
  singleton ??= createPrivateDocumentCache({storage: createNativeStorage()});
  return singleton;
}

export async function clearAllPrivateDocumentCaches() {
  await getPrivateDocumentCache().clearAll();
}

function createNativeStorage(): PrivateDocumentCacheStorage {
  const directory = new Directory(Paths.cache, directoryName);
  const file = (name: string) => new File(directory, name);

  return {
    async deleteEntry(name) {
      if (!directory.exists) return;
      const entry = directory.list().find((candidate) => candidate.name === name);
      if (entry) entry.delete();
    },
    async download(name, signedUrl) {
      directory.create({idempotent: true, intermediates: true, overwrite: false});
      const temporary = file(`${name}.${Date.now()}.download`);
      const destination = file(name);
      try {
        const downloaded = await File.downloadFileAsync(signedUrl, temporary, {
          idempotent: false,
        });
        if (!Number.isSafeInteger(downloaded.size) || downloaded.size <= 0) {
          throw new Error('Invalid downloaded document size');
        }
        await downloaded.move(destination, {overwrite: true});
        return {sizeBytes: destination.size, uri: destination.uri};
      } finally {
        if (temporary.exists) temporary.delete();
      }
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
    async writeTextAtomically(name, temporaryName, text) {
      const temporary = file(temporaryName);
      temporary.create({intermediates: false, overwrite: true});
      temporary.write(text);
      await temporary.move(file(name), {overwrite: true});
    },
  };
}
