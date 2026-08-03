import {validateImagePreflight} from './announcementMedia';
import {MediaBinaryUploadHttpError} from './announcementUploadFlow';
import {
  ANNOUNCEMENT_IMAGE_CACHE_DIRECTORY_NAME,
  announcementImageTemporaryFiles,
  type AnnouncementImageTemporaryFileRegistry,
} from './announcementImageTemporaryFiles';

export const ANNOUNCEMENT_NATIVE_IMAGE_MAX_DIMENSION = 4096;
export const ANNOUNCEMENT_NATIVE_IMAGE_SELECTION_LIMIT = 50;

export type AnnouncementNativeImageSource = {
  height: number;
  uri: string;
  width: number;
};

export type PreparedAnnouncementNativeImage = {
  byteSize: number;
  contentType: 'image/jpeg';
  height: number;
  sha256: string;
  sourceIndex: number;
  uri: string;
  width: number;
};

export type AnnouncementNativeMediaPreparationResult = {
  failures: Array<{sourceIndex: number; userMessage: string}>;
  prepared: PreparedAnnouncementNativeImage[];
};

export type AnnouncementNativeMediaDependencies = {
  discardUri?: (uri: string) => Promise<void>;
  pickImages: () => Promise<AnnouncementNativeImageSource[]>;
  prepareJpeg: (input: AnnouncementNativeImageSource & {maxDimension: number}) => Promise<AnnouncementNativeImageSource>;
  getByteSize: (uri: string) => Promise<number>;
  readBytes: (uri: string) => Promise<Uint8Array>;
  sha256: (bytes: Uint8Array) => Promise<string>;
  temporaryFiles?: AnnouncementImageTemporaryFileRegistry;
};

type NativeBinaryUploadDependencies = {
  upload: (request: {
    headers: Record<string, string>;
    httpMethod: 'PUT';
    localUri: string;
    onProgress: (progress: {bytesSent: number; totalBytes: number}) => void;
    signal?: AbortSignal | undefined;
    uploadUrl: string;
  }) => Promise<{status: number}>;
};

type NativeModuleOverrides = {
  crypto?: {
    digest: (algorithm: 'SHA-256', bytes: Uint8Array) => Promise<ArrayBuffer>;
    sha256Algorithm: 'SHA-256';
  };
  fileSystem?: {
    getByteSize: (uri: string) => Promise<number>;
    readBytes: (uri: string) => Promise<Uint8Array>;
  };
  imageManipulator?: {
    prepareJpeg: (input: AnnouncementNativeImageSource & {maxDimension: number}) => Promise<AnnouncementNativeImageSource>;
  };
  imagePicker?: {
    launchImageLibraryAsync: (options: Record<string, unknown>) => Promise<{
      assets: Array<{height: number; uri: string; width: number}> | null;
      canceled: boolean;
    }>;
  };
  temporaryFiles?: AnnouncementImageTemporaryFileRegistry;
};

let preparedImageIdentitySequence = 0;

export async function pickAndPrepareAnnouncementImages(
  dependencies: AnnouncementNativeMediaDependencies = createNativeAnnouncementMediaDependencies(),
): Promise<AnnouncementNativeMediaPreparationResult> {
  const temporaryFiles = dependencies.temporaryFiles ?? announcementImageTemporaryFiles;
  const preparationSession = temporaryFiles.createPreparedSession();
  const sources = await dependencies.pickImages();
  const prepared: PreparedAnnouncementNativeImage[] = [];
  const failures: AnnouncementNativeMediaPreparationResult['failures'] = [];

  // Process sequentially. A selection can be large and decoding several full-size
  // photos at once creates an avoidable memory spike on older devices.
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    const source = sources[sourceIndex];
    if (!source) continue;
    let preparation;
    try {
      preparation = temporaryFiles.beginPreparedOperation(preparationSession);
    } catch {
      failures.push({
        sourceIndex,
        userMessage: '이미지를 처리하지 못했습니다. 다시 시도해 주세요.',
      });
      continue;
    }
    let ownedNormalizedUri: string | null = null;
    try {
      assertImageDimensions(source);
      const normalized = await dependencies.prepareJpeg({
        ...source,
        maxDimension: ANNOUNCEMENT_NATIVE_IMAGE_MAX_DIMENSION,
      });
      if (normalized.uri !== source.uri) ownedNormalizedUri = normalized.uri;
      assertImageDimensions(normalized);
      if (
        normalized.width > ANNOUNCEMENT_NATIVE_IMAGE_MAX_DIMENSION ||
        normalized.height > ANNOUNCEMENT_NATIVE_IMAGE_MAX_DIMENSION
      ) {
        throw new Error('normalized image dimensions exceed the safe limit');
      }
      const byteSize = await dependencies.getByteSize(normalized.uri);
      const preflight = validateImagePreflight({
        byteSize,
        contentType: 'image/jpeg',
        height: normalized.height,
        width: normalized.width,
      });
      if (!preflight.ok) {
        throw new Error(`normalized image failed preflight: ${preflight.reason}`);
      }
      const bytes = await dependencies.readBytes(normalized.uri);
      if (bytes.byteLength !== byteSize) {
        throw new Error('normalized image size changed during preflight');
      }
      const sha256 = await dependencies.sha256(bytes);
      if (!/^[a-f0-9]{64}$/i.test(sha256)) {
        throw new Error('native image digest is invalid');
      }
      preparation.assertValid();
      prepared.push({
        byteSize,
        contentType: 'image/jpeg',
        height: normalized.height,
        sha256: sha256.toLowerCase(),
        sourceIndex,
        uri: normalized.uri,
        width: normalized.width,
      });
      ownedNormalizedUri = null;
    } catch {
      if (ownedNormalizedUri && dependencies.discardUri) {
        await dependencies.discardUri(ownedNormalizedUri).catch(() => undefined);
      }
      failures.push({
        sourceIndex,
        userMessage: '이미지를 처리하지 못했습니다. 다시 시도해 주세요.',
      });
    } finally {
      preparation.finish();
    }
  }

  return {failures, prepared};
}

export async function discardPreparedAnnouncementImages(
  images: readonly PreparedAnnouncementNativeImage[],
  temporaryFiles: AnnouncementImageTemporaryFileRegistry = announcementImageTemporaryFiles,
) {
  if (images.length === 0) return;
  await Promise.allSettled(images.map((image) => deleteNativeFileUri(image.uri, temporaryFiles)));
}

export function createNativeAnnouncementMediaDependencies(
  overrides: NativeModuleOverrides = {},
): AnnouncementNativeMediaDependencies {
  const temporaryFiles = overrides.temporaryFiles ?? announcementImageTemporaryFiles;
  return {
    discardUri: (uri) => deleteNativeFileUri(uri, temporaryFiles),
    pickImages: async () => {
      const imagePicker = overrides.imagePicker ?? await loadImagePicker();
      const result = await imagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        allowsMultipleSelection: true,
        base64: false,
        exif: false,
        mediaTypes: ['images'],
        orderedSelection: true,
        quality: 1,
        selectionLimit: ANNOUNCEMENT_NATIVE_IMAGE_SELECTION_LIMIT,
      });
      if (result.canceled || !result.assets) return [];
      return result.assets.map(({height, uri, width}) => ({height, uri, width}));
    },
    prepareJpeg: overrides.imageManipulator?.prepareJpeg ?? ((input) =>
      prepareJpegWithExpo(input, temporaryFiles)),
    getByteSize: overrides.fileSystem?.getByteSize ?? getByteSizeWithExpo,
    readBytes: overrides.fileSystem?.readBytes ?? readBytesWithExpo,
    sha256: async (bytes) => {
      const crypto = overrides.crypto ?? await loadCrypto();
      const digest = await crypto.digest(crypto.sha256Algorithm, bytes);
      return bytesToHex(new Uint8Array(digest));
    },
    temporaryFiles,
  };
}

async function deleteNativeFileUri(
  uri: string,
  temporaryFiles: AnnouncementImageTemporaryFileRegistry,
) {
  try {
    const {File} = await import('expo-file-system');
    const file = new File(uri);
    if (file.exists) file.delete();
  } finally {
    temporaryFiles.unprotectPreparedFile(uri);
  }
}

export function createNativeAnnouncementBinaryUploader(
  dependencies: NativeBinaryUploadDependencies = {upload: uploadBinaryWithExpo},
) {
  return async (
    request: {headers: Record<string, string>; localUri: string; uploadUrl: string},
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
  ) => {
    const result = await dependencies.upload({
      ...request,
      httpMethod: 'PUT',
      onProgress: ({bytesSent, totalBytes}) => {
        if (
          !Number.isFinite(bytesSent) ||
          !Number.isFinite(totalBytes) ||
          bytesSent < 0 ||
          totalBytes <= 0
        ) {
          return;
        }
        onProgress(Math.min(1, bytesSent / totalBytes));
      },
      ...(signal ? {signal} : {}),
    });

    if (!Number.isSafeInteger(result.status) || result.status < 100 || result.status > 599) {
      throw new Error(`Announcement media upload returned an invalid status: ${String(result.status)}.`);
    }
    if (result.status < 200 || result.status >= 300) {
      throw new MediaBinaryUploadHttpError(result.status);
    }
  };
}

async function loadImagePicker() {
  const imagePicker = await import('expo-image-picker');
  return {
    launchImageLibraryAsync: imagePicker.launchImageLibraryAsync,
  };
}

async function loadCrypto() {
  const crypto = await import('expo-crypto');
  return {
    digest: (_algorithm: 'SHA-256', bytes: Uint8Array) => {
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      return crypto.digest(crypto.CryptoDigestAlgorithm.SHA256, buffer);
    },
    sha256Algorithm: 'SHA-256' as const,
  };
}

async function prepareJpegWithExpo({
  height,
  maxDimension,
  uri,
  width,
}: AnnouncementNativeImageSource & {maxDimension: number},
temporaryFiles: AnnouncementImageTemporaryFileRegistry) {
  const {ImageManipulator, SaveFormat} = await import('expo-image-manipulator');
  const context = ImageManipulator.manipulate(uri);
  const largestDimension = Math.max(width, height);
  if (largestDimension > maxDimension) {
    const scale = maxDimension / largestDimension;
    context.resize({
      height: Math.max(1, Math.round(height * scale)),
      width: Math.max(1, Math.round(width * scale)),
    });
  }
  // Rendering into a fresh JPEG applies the platform decoder's orientation and
  // does not copy the source EXIF/GPS container into the output file.
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    base64: false,
    compress: 0.9,
    format: SaveFormat.JPEG,
  });
  const {Directory, File, Paths} = await import('expo-file-system');
  const directory = new Directory(Paths.cache, ANNOUNCEMENT_IMAGE_CACHE_DIRECTORY_NAME);
  directory.create({idempotent: true, intermediates: true, overwrite: false});
  const destinationName = nextPreparedImageFileName();
  const source = new File(result.uri);
  const destination = new File(directory, destinationName);
  try {
    await source.move(destination, {overwrite: false});
  } catch (error) {
    try {
      if (source.exists) source.delete();
    } catch {
      // The owned-cache reconciliation cannot see a manipulator cache URI, but
      // this best-effort delete must not hide the move failure from the caller.
    }
    throw error;
  }
  temporaryFiles.protectPreparedFile(destination.uri, destinationName);
  return {height: result.height, uri: destination.uri, width: result.width};
}

function nextPreparedImageFileName() {
  preparedImageIdentitySequence = preparedImageIdentitySequence >= Number.MAX_SAFE_INTEGER
    ? 1
    : preparedImageIdentitySequence + 1;
  return `prepared-${Date.now().toString(36)}-${preparedImageIdentitySequence.toString(36)}-${Math.random().toString(36).slice(2, 12).padEnd(10, '0')}.image-upload`;
}

async function readBytesWithExpo(uri: string) {
  const {File} = await import('expo-file-system');
  return new File(uri).bytes();
}

async function getByteSizeWithExpo(uri: string) {
  const {File} = await import('expo-file-system');
  return new File(uri).size;
}

async function uploadBinaryWithExpo({
  headers,
  httpMethod,
  localUri,
  onProgress,
  signal,
  uploadUrl,
}: Parameters<NativeBinaryUploadDependencies['upload']>[0]) {
  const {File, UploadType} = await import('expo-file-system');
  const result = await new File(localUri).upload(uploadUrl, {
    headers,
    httpMethod,
    onProgress,
    sessionType: 'foreground',
    ...(signal ? {signal} : {}),
    uploadType: UploadType.BINARY_CONTENT,
  });
  return {status: result.status};
}

function assertImageDimensions(image: AnnouncementNativeImageSource) {
  if (
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    throw new Error('image dimensions are invalid');
  }
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
