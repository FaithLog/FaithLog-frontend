import type {PrivateDocumentCache} from './privateDocumentCacheCore';

const unavailableCache: PrivateDocumentCache = {
  async clearAll() {},
  async download() {
    throw new Error('Private document cache is only available in a native build');
  },
  async exists() {
    return false;
  },
  resolveUri() {
    throw new Error('Private document cache is only available in a native build');
  },
  async touch() {},
};

export function getPrivateDocumentCache() {
  return unavailableCache;
}

export async function clearAllPrivateDocumentCaches() {
  await unavailableCache.clearAll();
}
