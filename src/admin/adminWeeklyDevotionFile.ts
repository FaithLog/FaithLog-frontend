import type {AdminWeeklyDevotionExport} from '../api/adminWeeklyDevotionApi';

const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function saveAndShareAdminWeeklyDevotionExport({
  bytes,
  fileName,
}: AdminWeeklyDevotionExport) {
  const [{File, Paths}, Sharing] = await Promise.all([
    import('expo-file-system'),
    import('expo-sharing'),
  ]);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('이 기기에서는 파일 공유를 사용할 수 없습니다.');
  }

  const file = new File(Paths.cache, fileName);
  file.create({overwrite: true});
  file.write(bytes);
  await Sharing.shareAsync(file.uri, {
    dialogTitle: '주차별 경건 현황 Excel 공유',
    mimeType: EXCEL_MIME_TYPE,
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });

  return file.uri;
}
