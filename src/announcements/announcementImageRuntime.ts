import {
  createAnnouncementImageCacheAdapter,
  type AnnouncementImageCacheAdapter,
} from './announcementImageCacheAdapter';
import {
  ANNOUNCEMENT_IMAGE_CACHE_DIRECTORY_NAME,
  announcementImageTemporaryFiles,
  type AnnouncementImageTemporaryFileRegistry,
} from './announcementImageTemporaryFiles';
import type {ImageCacheVariant} from './announcementImageCache';
import {ANNOUNCEMENT_IMAGE_MAX_BYTE_SIZE} from './announcementMedia';

export type AnnouncementImageSourceInput = {
  assetId: number;
  bypassCache?: boolean;
  campusId: number;
  signal?: AbortSignal;
  signedUrl: string;
  userId: number;
  variant: ImageCacheVariant;
};

export type AnnouncementImageRuntimeDependencies = {
  cache: Pick<
    AnnouncementImageCacheAdapter,
    'clearAll' | 'clearNamespacePrefix' | 'getUriForAsset' | 'putBytes'
  >;
  downloadBytes: (
    signedUrl: string,
    signal: AbortSignal | undefined,
    namespace: string,
  ) => Promise<Uint8Array>;
  sha256: (bytes: Uint8Array) => Promise<string>;
  temporaryFiles: AnnouncementImageTemporaryFileRegistry;
};

export type AnnouncementImageRuntime = {
  clearAllAnnouncementImageCaches(): Promise<void>;
  clearAnnouncementImageCacheForUser(userId: number): Promise<void>;
  resolveAnnouncementImageSource(input: AnnouncementImageSourceInput): Promise<string>;
};

let downloadIdentitySequence = 0;
let defaultRuntime: AnnouncementImageRuntime | null = null;
let defaultCache: AnnouncementImageCacheAdapter | null = null;

export class AnnouncementImagePolicyError extends Error {
  constructor(message = 'Announcement image violates the local safety policy') {
    super(message);
    this.name = 'AnnouncementImagePolicyError';
  }
}

export function buildAnnouncementImageCacheNamespace({
  campusId,
  userId,
}: {
  campusId: number;
  userId: number;
}) {
  assertPositiveId(userId);
  assertPositiveId(campusId);
  return `account-${userId}-campus-${campusId}`;
}

export function createAnnouncementImageRuntime(
  overrides: Partial<AnnouncementImageRuntimeDependencies> = {},
): AnnouncementImageRuntime {
  const temporaryFiles = overrides.temporaryFiles ?? announcementImageTemporaryFiles;
  const dependencies: AnnouncementImageRuntimeDependencies = {
    cache: overrides.cache ?? getDefaultCache(),
    downloadBytes: overrides.downloadBytes ?? ((signedUrl, signal, namespace) =>
      downloadBytesWithExpo(signedUrl, signal, namespace, temporaryFiles)),
    sha256: overrides.sha256 ?? sha256WithExpo,
    temporaryFiles,
  };
  const accountEpochs = new Map<string, number>();
  const activeDownloads = new Map<string, Set<{
    controller: AbortController;
    promise: Promise<Uint8Array>;
  }>>();
  let globalEpoch = 0;

  return {
    async clearAllAnnouncementImageCaches() {
      globalEpoch = nextEpoch(globalEpoch);
      const preparedCleanup = dependencies.temporaryFiles.beginExplicitPreparedCleanup();
      try {
        await Promise.all([
          abortAndWaitForDownloads(activeDownloads),
          preparedCleanup.waitForPending(),
        ]);
        preparedCleanup.releasePreparedFiles();
        await dependencies.cache.clearAll();
      } finally {
        preparedCleanup.finish();
      }
    },

    async clearAnnouncementImageCacheForUser(userId) {
      if (!isPositiveId(userId)) return;
      const accountPrefix = buildAnnouncementImageCacheAccountPrefix(userId);
      accountEpochs.set(accountPrefix, nextEpoch(accountEpochs.get(accountPrefix) ?? 0));
      const preparedCleanup = dependencies.temporaryFiles.beginExplicitPreparedCleanup();
      try {
        await Promise.all([
          abortAndWaitForDownloads(activeDownloads, accountPrefix),
          preparedCleanup.waitForPending(),
        ]);
        preparedCleanup.releasePreparedFiles();
        await dependencies.cache.clearNamespacePrefix(accountPrefix);
      } finally {
        preparedCleanup.finish();
      }
    },

    async resolveAnnouncementImageSource(input) {
      try {
        const namespace = buildAnnouncementImageCacheNamespace(input);
        const accountPrefix = buildAnnouncementImageCacheAccountPrefix(input.userId);
        const accountEpoch = accountEpochs.get(accountPrefix) ?? 0;
        const resolutionGlobalEpoch = globalEpoch;
        assertPositiveId(input.assetId);
        assertImageVariant(input.variant);
        assertHttpsUrl(input.signedUrl);
        throwIfResolutionInvalid(
          input.signal,
          globalEpoch,
          resolutionGlobalEpoch,
          accountEpochs,
          accountPrefix,
          accountEpoch,
        );
        if (!input.bypassCache) {
          const cachedUri = await dependencies.cache.getUriForAsset({
            assetId: input.assetId,
            namespace,
            variant: input.variant,
          });
          throwIfResolutionInvalid(input.signal, globalEpoch, resolutionGlobalEpoch, accountEpochs, accountPrefix, accountEpoch);
          if (cachedUri) return cachedUri;
        }

        const linkedAbort = createLinkedAbortController(input.signal);
        let download: Promise<Uint8Array>;
        try {
          download = dependencies.downloadBytes(
            input.signedUrl,
            linkedAbort.controller.signal,
            namespace,
          );
        } catch (error) {
          linkedAbort.dispose();
          throw error;
        }
        const activeDownload = {controller: linkedAbort.controller, promise: download};
        const downloadsForAccount = activeDownloads.get(accountPrefix) ?? new Set();
        downloadsForAccount.add(activeDownload);
        activeDownloads.set(accountPrefix, downloadsForAccount);
        let bytes: Uint8Array;
        try {
          bytes = await download;
        } finally {
          linkedAbort.dispose();
          downloadsForAccount.delete(activeDownload);
          if (downloadsForAccount.size === 0) activeDownloads.delete(accountPrefix);
        }
        throwIfResolutionInvalid(input.signal, globalEpoch, resolutionGlobalEpoch, accountEpochs, accountPrefix, accountEpoch);
        assertDownloadedBytes(bytes);
        const sha256 = (await dependencies.sha256(bytes)).toLowerCase();
        throwIfResolutionInvalid(input.signal, globalEpoch, resolutionGlobalEpoch, accountEpochs, accountPrefix, accountEpoch);
        if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid image digest');
        return await dependencies.cache.putBytes({
          assetId: input.assetId,
          namespace,
          sha256,
          variant: input.variant,
        }, bytes);
      } catch (error) {
        if (error instanceof AnnouncementImagePolicyError) throw error;
        return input.signedUrl;
      }
    },
  };
}

export function resolveAnnouncementImageSource(
  input: AnnouncementImageSourceInput,
): Promise<string> {
  return getDefaultRuntime().resolveAnnouncementImageSource(input);
}

export function clearAnnouncementImageCacheForUser(
  userId: number,
): Promise<void> {
  return getDefaultRuntime().clearAnnouncementImageCacheForUser(userId);
}

export function clearAllAnnouncementImageCaches(): Promise<void> {
  return getDefaultRuntime().clearAllAnnouncementImageCaches();
}

function getDefaultRuntime() {
  defaultRuntime ??= createAnnouncementImageRuntime();
  return defaultRuntime;
}

function getDefaultCache() {
  defaultCache ??= createAnnouncementImageCacheAdapter({
    protectedEntryNames: () => announcementImageTemporaryFiles.getProtectedEntryNames(),
  });
  return defaultCache;
}

function assertDownloadedBytes(value: Uint8Array) {
  if (!(value instanceof Uint8Array)) throw new AnnouncementImagePolicyError('Downloaded image bytes are invalid');
  assertSafeByteLength(value.byteLength);
}

function assertSafeByteLength(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > ANNOUNCEMENT_IMAGE_MAX_BYTE_SIZE) {
    throw new AnnouncementImagePolicyError('Downloaded image byte size is invalid');
  }
}

function assertPositiveId(value: number) {
  if (!isPositiveId(value)) throw new Error('Invalid image cache identity');
}

function isPositiveId(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

function assertImageVariant(value: ImageCacheVariant) {
  if (value !== 'detail' && value !== 'thumbnail') throw new Error('Invalid image variant');
}

function assertHttpsUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Invalid signed image URL');
  }
}

export function createAnnouncementImageDownloadGuard(externalSignal?: AbortSignal) {
  const controller = new AbortController();
  let validationError: Error | null = null;
  const onExternalAbort = () => controller.abort(abortReason(externalSignal));
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener('abort', onExternalAbort, {once: true});

  return {
    assertValid() {
      if (validationError) throw validationError;
      if (controller.signal.aborted) throw abortReason(controller.signal);
    },
    dispose() {
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
    onProgress({bytesWritten, totalBytes}: {bytesWritten: number; totalBytes: number}) {
      const invalid =
        !Number.isSafeInteger(bytesWritten) ||
        bytesWritten < 0 ||
        (totalBytes !== -1 && (!Number.isSafeInteger(totalBytes) || totalBytes < 0));
      if (
        invalid ||
        bytesWritten > ANNOUNCEMENT_IMAGE_MAX_BYTE_SIZE ||
        totalBytes > ANNOUNCEMENT_IMAGE_MAX_BYTE_SIZE
      ) {
        validationError = new AnnouncementImagePolicyError('Downloaded image byte size is invalid');
        controller.abort(validationError);
      }
    },
    signal: controller.signal,
  };
}

async function downloadBytesWithExpo(
  signedUrl: string,
  signal: AbortSignal | undefined,
  namespace: string,
  temporaryFiles: AnnouncementImageTemporaryFileRegistry,
) {
  const {Directory, File, Paths} = await import('expo-file-system');
  const directory = new Directory(Paths.cache, ANNOUNCEMENT_IMAGE_CACHE_DIRECTORY_NAME);
  directory.create({idempotent: true, intermediates: true, overwrite: false});
  const destinationName = nextDownloadFileName(namespace);
  const destination = new File(directory, destinationName);
  const guard = createAnnouncementImageDownloadGuard(signal);
  temporaryFiles.protectDownload(destinationName);

  try {
    let downloaded;
    try {
      downloaded = await File.downloadFileAsync(signedUrl, destination, {
        idempotent: false,
        onProgress: guard.onProgress,
        signal: guard.signal,
      });
    } catch (error) {
      guard.assertValid();
      throw error;
    }
    guard.assertValid();
    assertSafeByteLength(downloaded.size);
    const bytes = await downloaded.bytes();
    assertDownloadedBytes(bytes);
    if (bytes.byteLength !== downloaded.size) throw new Error('Downloaded image size changed');
    return bytes;
  } finally {
    guard.dispose();
    try {
      if (destination.exists) destination.delete();
    } catch {
      // Temporary-file cleanup is best-effort and must never mask a policy
      // failure, otherwise the resolver could fail open to the signed URL.
    }
    temporaryFiles.unprotectDownload(destinationName);
  }
}

async function sha256WithExpo(bytes: Uint8Array) {
  const crypto = await import('expo-crypto');
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.digest(crypto.CryptoDigestAlgorithm.SHA256, digestInput.buffer);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += byte.toString(16).padStart(2, '0');
  return value;
}

function nextDownloadFileName(namespace: string) {
  downloadIdentitySequence = downloadIdentitySequence >= Number.MAX_SAFE_INTEGER
    ? 1
    : downloadIdentitySequence + 1;
  return `${namespace}--download-${Date.now().toString(36)}-${downloadIdentitySequence.toString(36)}-${Math.random().toString(36).slice(2, 12).padEnd(10, '0')}.image-download`;
}

function createLinkedAbortController(externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(abortReason(externalSignal));
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener('abort', onExternalAbort, {once: true});
  return {
    controller,
    dispose() {
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}

async function abortAndWaitForDownloads(
  activeDownloads: ReadonlyMap<string, ReadonlySet<{
    controller: AbortController;
    promise: Promise<Uint8Array>;
  }>>,
  accountPrefix?: string,
) {
  const downloads = [...activeDownloads.entries()]
    .filter(([prefix]) => accountPrefix === undefined || prefix === accountPrefix)
    .flatMap(([, entries]) => [...entries]);
  const reason = new Error('Announcement image cache namespace was invalidated');
  for (const download of downloads) download.controller.abort(reason);
  await Promise.allSettled(downloads.map((download) => download.promise));
}

function throwIfResolutionInvalid(
  signal: AbortSignal | undefined,
  currentGlobalEpoch: number,
  expectedGlobalEpoch: number,
  accountEpochs: Map<string, number>,
  accountPrefix: string,
  expectedAccountEpoch: number,
) {
  if (signal?.aborted) throw abortReason(signal);
  if (
    currentGlobalEpoch !== expectedGlobalEpoch ||
    (accountEpochs.get(accountPrefix) ?? 0) !== expectedAccountEpoch
  ) {
    throw new Error('Announcement image cache namespace was invalidated');
  }
}

function buildAnnouncementImageCacheAccountPrefix(userId: number) {
  assertPositiveId(userId);
  return `account-${userId}-campus-`;
}

function abortReason(signal: AbortSignal | undefined) {
  return signal?.reason instanceof Error ? signal.reason : new Error('Image resolution aborted');
}

function nextEpoch(current: number) {
  return current >= Number.MAX_SAFE_INTEGER ? 1 : current + 1;
}
