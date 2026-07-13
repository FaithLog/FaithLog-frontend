import type {AdminWeeklyDevotionExport} from '../api/adminWeeklyDevotionApi';

const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type TemporaryExportFile = {
  create: (options: {overwrite: boolean}) => void;
  delete: () => void;
  uri: string;
  write: (bytes: Uint8Array) => void;
};

type TemporaryExportDirectory = {
  create: (options: {
    idempotent: boolean;
    intermediates: boolean;
    overwrite: boolean;
  }) => void;
  createFile: (fileName: string) => TemporaryExportFile;
  delete: () => void;
};

type ShareOptions = {
  dialogTitle: string;
  mimeType: string;
  UTI: string;
};

export type AdminWeeklyDevotionFileDependencies = {
  createDirectory: (storageIdentity: string) => TemporaryExportDirectory;
  createStorageIdentity: () => string;
  isSharingAvailable: () => Promise<boolean>;
  observeCleanupFailure?: () => void;
  share: (uri: string, options: ShareOptions) => Promise<void>;
};

let exportIdentitySequence = 0;

export async function saveAndShareAdminWeeklyDevotionExport({
  bytes,
  fileName,
}: AdminWeeklyDevotionExport, dependencies?: AdminWeeklyDevotionFileDependencies) {
  assertSafeExcelFileName(fileName);
  const runtime = dependencies ?? await createRuntimeDependencies();

  if (!(await runtime.isSharingAvailable())) {
    throw new Error('이 기기에서는 파일 공유를 사용할 수 없습니다.');
  }

  const storageIdentity = runtime.createStorageIdentity();
  assertSafeStorageIdentity(storageIdentity);
  const directory = runtime.createDirectory(storageIdentity);
  let directoryOwned = false;
  let file: TemporaryExportFile | undefined;

  try {
    directory.create({
      idempotent: false,
      intermediates: false,
      overwrite: false,
    });
    directoryOwned = true;
    file = directory.createFile(fileName);
    file.create({overwrite: false});
    file.write(bytes);
    await runtime.share(file.uri, {
      dialogTitle: '주차별 경건 현황 Excel 공유',
      mimeType: EXCEL_MIME_TYPE,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  } finally {
    if (directoryOwned) {
      if (file) {
        try {
          file.delete();
        } catch {
          runtime.observeCleanupFailure?.();
        }
      }
      try {
        directory.delete();
      } catch {
        runtime.observeCleanupFailure?.();
      }
    }
  }
}

async function createRuntimeDependencies(): Promise<AdminWeeklyDevotionFileDependencies> {
  const [{Directory, File, Paths}, Sharing] = await Promise.all([
    import('expo-file-system'),
    import('expo-sharing'),
  ]);

  return {
    createDirectory: (storageIdentity) => {
      const directory = new Directory(Paths.cache, storageIdentity);
      return {
        create: (options) => directory.create(options),
        createFile: (fileName) => new File(directory, fileName),
        delete: () => directory.delete(),
      };
    },
    createStorageIdentity,
    isSharingAvailable: () => Sharing.isAvailableAsync(),
    observeCleanupFailure: () => {
      console.warn('주차별 경건 현황 임시 파일 정리에 실패했습니다.');
    },
    share: (uri, options) => Sharing.shareAsync(uri, options),
  };
}

function assertSafeExcelFileName(fileName: string) {
  if (!/^[a-zA-Z0-9._-]+\.xlsx$/i.test(fileName)) {
    throw new Error('Excel 파일 이름이 올바르지 않습니다.');
  }
}

function assertSafeStorageIdentity(storageIdentity: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(storageIdentity)) {
    throw new Error('임시 저장소 식별자가 올바르지 않습니다.');
  }
}

function createStorageIdentity() {
  exportIdentitySequence =
    exportIdentitySequence >= Number.MAX_SAFE_INTEGER ? 1 : exportIdentitySequence + 1;
  const timestamp = Date.now().toString(36);
  const sequence = exportIdentitySequence.toString(36);
  const random = Math.random().toString(36).slice(2, 12).padEnd(10, '0');
  return `faithlog-admin-export-${timestamp}-${sequence}-${random}`;
}
