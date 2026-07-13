import type {AdminWeeklyDevotionExport} from '../api/adminWeeklyDevotionApi';

const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type TemporaryExportFile = {
  create: (options: {overwrite: boolean}) => void;
  delete: () => void;
  uri: string;
  write: (bytes: Uint8Array) => void;
};

type ShareOptions = {
  dialogTitle: string;
  mimeType: string;
  UTI: string;
};

export type AdminWeeklyDevotionFileDependencies = {
  createFile: (fileName: string) => TemporaryExportFile;
  isSharingAvailable: () => Promise<boolean>;
  observeCleanupFailure?: () => void;
  share: (uri: string, options: ShareOptions) => Promise<void>;
};

export async function saveAndShareAdminWeeklyDevotionExport({
  bytes,
  fileName,
}: AdminWeeklyDevotionExport, dependencies?: AdminWeeklyDevotionFileDependencies) {
  assertSafeExcelFileName(fileName);
  const runtime = dependencies ?? await createRuntimeDependencies();

  if (!(await runtime.isSharingAvailable())) {
    throw new Error('이 기기에서는 파일 공유를 사용할 수 없습니다.');
  }

  const file = runtime.createFile(fileName);
  try {
    file.create({overwrite: true});
    file.write(bytes);
    await runtime.share(file.uri, {
      dialogTitle: '주차별 경건 현황 Excel 공유',
      mimeType: EXCEL_MIME_TYPE,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  } finally {
    try {
      file.delete();
    } catch {
      runtime.observeCleanupFailure?.();
    }
  }
}

async function createRuntimeDependencies(): Promise<AdminWeeklyDevotionFileDependencies> {
  const [{File, Paths}, Sharing] = await Promise.all([
    import('expo-file-system'),
    import('expo-sharing'),
  ]);

  return {
    createFile: (fileName) => new File(Paths.cache, fileName),
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
