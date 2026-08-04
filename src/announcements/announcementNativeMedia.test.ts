import {describe, expect, it, vi} from 'vitest';

import {
  createNativeAnnouncementBinaryUploader,
  createNativeAnnouncementMediaDependencies,
  ANNOUNCEMENT_NATIVE_IMAGE_SELECTION_LIMIT,
  discardPreparedAnnouncementImages,
  pickAndPrepareAnnouncementImages,
  type AnnouncementNativeMediaDependencies,
} from './announcementNativeMedia';
import {
  ANNOUNCEMENT_IMAGE_CACHE_DIRECTORY_NAME,
  createAnnouncementImageTemporaryFileRegistry,
} from './announcementImageTemporaryFiles';
import {MediaBinaryUploadHttpError} from './announcementUploadFlow';

describe('announcement native media preparation', () => {
  it('keeps picker order, re-encodes every source as JPEG, bounds dimensions, and hashes output bytes', async () => {
    const prepare = vi.fn()
      .mockResolvedValueOnce({height: 3000, uri: 'file://normalized-a.jpg', width: 4096})
      .mockResolvedValueOnce({height: 1200, uri: 'file://normalized-b.jpg', width: 900});
    const readBytes = vi.fn()
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
      .mockResolvedValueOnce(new Uint8Array([4, 5]));
    const sha256 = vi.fn()
      .mockResolvedValueOnce('a'.repeat(64))
      .mockResolvedValueOnce('b'.repeat(64));
    const dependencies: AnnouncementNativeMediaDependencies = {
      pickImages: vi.fn().mockResolvedValue([
        {height: 6000, uri: 'file://source-a.heic', width: 8000},
        {height: 1200, uri: 'file://source-b.png', width: 900},
      ]),
      prepareJpeg: prepare,
      getByteSize: vi.fn()
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2),
      readBytes,
      sha256,
    };

    const result = await pickAndPrepareAnnouncementImages(dependencies);

    expect(prepare).toHaveBeenNthCalledWith(1, {
      height: 6000,
      maxDimension: 4096,
      uri: 'file://source-a.heic',
      width: 8000,
    });
    expect(result.prepared).toEqual([
      {
        byteSize: 3,
        contentType: 'image/jpeg',
        height: 3000,
        sha256: 'a'.repeat(64),
        sourceIndex: 0,
        uri: 'file://normalized-a.jpg',
        width: 4096,
      },
      {
        byteSize: 2,
        contentType: 'image/jpeg',
        height: 1200,
        sha256: 'b'.repeat(64),
        sourceIndex: 1,
        uri: 'file://normalized-b.jpg',
        width: 900,
      },
    ]);
    expect(result.failures).toEqual([]);
  });

  it('returns an empty draft without running conversion when the picker is cancelled', async () => {
    const dependencies: AnnouncementNativeMediaDependencies = {
      pickImages: vi.fn().mockResolvedValue([]),
      prepareJpeg: vi.fn(),
      getByteSize: vi.fn(),
      readBytes: vi.fn(),
      sha256: vi.fn(),
    };

    await expect(pickAndPrepareAnnouncementImages(dependencies)).resolves.toEqual({
      failures: [],
      prepared: [],
    });
    expect(dependencies.prepareJpeg).not.toHaveBeenCalled();
  });

  it('preserves successful images and reports only the failed source', async () => {
    const dependencies: AnnouncementNativeMediaDependencies = {
      pickImages: vi.fn().mockResolvedValue([
        {height: 100, uri: 'file://first.heic', width: 100},
        {height: 100, uri: 'file://second.heic', width: 100},
      ]),
      prepareJpeg: vi.fn()
        .mockRejectedValueOnce(new Error('conversion failed'))
        .mockResolvedValueOnce({height: 100, uri: 'file://second.jpg', width: 100}),
      getByteSize: vi.fn().mockResolvedValue(2),
      readBytes: vi.fn().mockResolvedValue(new Uint8Array([8, 9])),
      sha256: vi.fn().mockResolvedValue('c'.repeat(64)),
    };

    const result = await pickAndPrepareAnnouncementImages(dependencies);

    expect(result.prepared).toHaveLength(1);
    expect(result.prepared[0]?.uri).toBe('file://second.jpg');
    expect(result.prepared[0]?.sourceIndex).toBe(1);
    expect(result.failures).toEqual([
      {sourceIndex: 0, userMessage: '이미지를 처리하지 못했습니다. 다시 시도해 주세요.'},
    ]);
  });

  it('rejects a normalized JPEG above 5 MiB before hashing or upload preparation', async () => {
    const readBytes = vi.fn();
    const sha256 = vi.fn();
    const discardUri = vi.fn(async () => undefined);
    const dependencies: AnnouncementNativeMediaDependencies = {
      discardUri,
      pickImages: vi.fn().mockResolvedValue([
        {height: 100, uri: 'file://large-source.heic', width: 100},
      ]),
      prepareJpeg: vi.fn().mockResolvedValue({
        height: 100,
        uri: 'file://large-normalized.jpg',
        width: 100,
      }),
      getByteSize: vi.fn().mockResolvedValue(5 * 1024 * 1024 + 1),
      readBytes,
      sha256,
    };

    await expect(pickAndPrepareAnnouncementImages(dependencies)).resolves.toEqual({
      failures: [
        {sourceIndex: 0, userMessage: '이미지를 처리하지 못했습니다. 다시 시도해 주세요.'},
      ],
      prepared: [],
    });
    expect(readBytes).not.toHaveBeenCalled();
    expect(sha256).not.toHaveBeenCalled();
    expect(discardUri).toHaveBeenCalledWith('file://large-normalized.jpg');
  });

  it('configures the native picker without EXIF/base64 and with ordered multi-select', async () => {
    const launchImageLibraryAsync = vi.fn().mockResolvedValue({assets: null, canceled: true});
    const dependencies = createNativeAnnouncementMediaDependencies({
      crypto: {
        digest: vi.fn(),
        sha256Algorithm: 'SHA-256',
      },
      fileSystem: {
        getByteSize: vi.fn(),
        readBytes: vi.fn(),
      },
      imageManipulator: {
        prepareJpeg: vi.fn(),
      },
      imagePicker: {launchImageLibraryAsync},
    });

    await dependencies.pickImages();

    expect(launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsEditing: false,
      allowsMultipleSelection: true,
      base64: false,
      exif: false,
      mediaTypes: ['images'],
      orderedSelection: true,
      quality: 1,
      selectionLimit: ANNOUNCEMENT_NATIVE_IMAGE_SELECTION_LIMIT,
    }));
  });

  it('passes image bytes to expo-crypto as an owned typed array', async () => {
    const digest = vi.fn().mockResolvedValue(new Uint8Array(32).buffer);
    vi.doMock('expo-crypto', () => ({
      CryptoDigestAlgorithm: {SHA256: 'SHA-256'},
      digest,
    }));
    const dependencies = createNativeAnnouncementMediaDependencies({
      fileSystem: {
        getByteSize: vi.fn(),
        readBytes: vi.fn(),
      },
      imageManipulator: {
        prepareJpeg: vi.fn(),
      },
      imagePicker: {
        launchImageLibraryAsync: vi.fn(),
      },
    });
    const source = new Uint8Array([1, 2, 3]);

    try {
      await expect(dependencies.sha256(source)).resolves.toBe('00'.repeat(32));
      const submitted = digest.mock.calls[0]?.[1];
      expect(submitted).toBeInstanceOf(Uint8Array);
      expect(submitted).not.toBe(source);
      expect(Array.from(submitted as Uint8Array)).toEqual([1, 2, 3]);
    } finally {
      vi.doUnmock('expo-crypto');
    }
  });

  it('moves prepared JPEGs into the owned cache directory and unregisters them on discard', async () => {
    const moved: Array<{destinationUri: string; sourceUri: string}> = [];
    const deleted: string[] = [];
    vi.doMock('expo-image-manipulator', () => ({
      ImageManipulator: {
        manipulate: () => ({
          renderAsync: async () => ({
            saveAsync: async () => ({
              height: 100,
              uri: 'file:///expo-image-manipulator/generated.jpg',
              width: 100,
            }),
          }),
        }),
      },
      SaveFormat: {JPEG: 'jpeg'},
    }));
    vi.doMock('expo-file-system', () => {
      class TestDirectory {
        readonly uri: string;
        constructor(_root: string, name: string) {
          this.uri = `file:///cache/${name}`;
        }
        create() {}
      }
      class TestFile {
        exists = true;
        readonly uri: string;
        constructor(root: string | TestDirectory, name?: string) {
          this.uri = typeof root === 'string' ? root : `${root.uri}/${name}`;
        }
        delete() {
          deleted.push(this.uri);
          this.exists = false;
        }
        async move(destination: TestFile) {
          moved.push({destinationUri: destination.uri, sourceUri: this.uri});
          this.exists = false;
        }
      }
      return {Directory: TestDirectory, File: TestFile, Paths: {cache: 'cache'}};
    });
    const temporaryFiles = createAnnouncementImageTemporaryFileRegistry();
    const dependencies = createNativeAnnouncementMediaDependencies({
      crypto: {
        digest: async () => new Uint8Array(32).buffer,
        sha256Algorithm: 'SHA-256',
      },
      fileSystem: {
        getByteSize: async () => 3,
        readBytes: async () => new Uint8Array([1, 2, 3]),
      },
      imagePicker: {
        launchImageLibraryAsync: async () => ({
          assets: [{height: 100, uri: 'file:///picker/source.heic', width: 100}],
          canceled: false,
        }),
      },
      temporaryFiles,
    });

    try {
      const result = await pickAndPrepareAnnouncementImages(dependencies);
      const prepared = result.prepared[0];
      expect(prepared?.uri).toMatch(
        new RegExp(`/cache/${ANNOUNCEMENT_IMAGE_CACHE_DIRECTORY_NAME}/prepared-.*\\.image-upload$`),
      );
      expect(moved).toEqual([{
        destinationUri: prepared?.uri,
        sourceUri: 'file:///expo-image-manipulator/generated.jpg',
      }]);
      expect(temporaryFiles.getProtectedEntryNames()).toEqual(new Set([
        prepared?.uri.split('/').at(-1),
      ]));

      await discardPreparedAnnouncementImages(result.prepared, temporaryFiles);
      expect(deleted).toEqual([prepared?.uri]);
      expect(temporaryFiles.getProtectedEntryNames()).toEqual(new Set());
    } finally {
      vi.doUnmock('expo-image-manipulator');
      vi.doUnmock('expo-file-system');
    }
  });

  it('uploads the prepared JPEG as binary PUT and forwards finite progress', async () => {
    const upload = vi.fn().mockImplementation(async ({onProgress}) => {
      onProgress({bytesSent: 5, totalBytes: 10});
      return {status: 204};
    });
    const uploader = createNativeAnnouncementBinaryUploader({upload});
    const progress: number[] = [];

    await uploader({
      headers: {'Content-Type': 'image/jpeg', 'x-upload-token': 'signed'},
      localUri: 'file://prepared.jpg',
      uploadUrl: 'https://upload.example/asset',
    }, (value) => progress.push(value));

    expect(upload).toHaveBeenCalledWith(expect.objectContaining({
      headers: {'Content-Type': 'image/jpeg', 'x-upload-token': 'signed'},
      httpMethod: 'PUT',
      localUri: 'file://prepared.jpg',
      uploadUrl: 'https://upload.example/asset',
    }));
    expect(progress).toEqual([0.5]);
  });

  it('rejects a completed native upload when the signed endpoint returns a non-2xx status', async () => {
    const uploader = createNativeAnnouncementBinaryUploader({
      upload: vi.fn().mockResolvedValue({status: 403}),
    });

    const result = uploader({
      headers: {'Content-Type': 'image/jpeg'},
      localUri: 'file://prepared.jpg',
      uploadUrl: 'https://upload.example/asset',
    }, vi.fn());

    await expect(result).rejects.toBeInstanceOf(MediaBinaryUploadHttpError);
    await expect(result).rejects.toMatchObject({status: 403});
  });

  it('does not classify an invalid native upload result as a known HTTP rejection', async () => {
    const uploader = createNativeAnnouncementBinaryUploader({
      upload: vi.fn().mockResolvedValue({status: Number.NaN}),
    });

    const result = uploader({
      headers: {'Content-Type': 'image/jpeg'},
      localUri: 'file://prepared.jpg',
      uploadUrl: 'https://upload.example/asset',
    }, vi.fn());

    await expect(result).rejects.toThrow('invalid status');
    await expect(result).rejects.not.toBeInstanceOf(MediaBinaryUploadHttpError);
  });
});
