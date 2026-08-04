export type UploadItem =
  | {assetId: number; localId: string; status: 'ready'}
  | {localId: string; progress: number; status: 'uploading'}
  | {localId: string; message: string; status: 'failed'};

export type ImagePreflight = {
  byteSize: number;
  contentType: string;
  height: number;
  width: number;
};

export const ANNOUNCEMENT_IMAGE_MAX_BYTE_SIZE = 5 * 1024 * 1024;

export function validateImagePreflight(value: ImagePreflight):
  | {ok: true}
  | {ok: false; reason: 'conversionRequired' | 'invalidDimensions' | 'tooLarge' | 'unsupportedType'} {
  if (value.contentType === 'image/heic' || value.contentType === 'image/heif') {
    return {ok: false, reason: 'conversionRequired'};
  }
  if (value.contentType !== 'image/jpeg' && value.contentType !== 'image/png') {
    return {ok: false, reason: 'unsupportedType'};
  }
  if (
    !Number.isSafeInteger(value.byteSize) ||
    value.byteSize <= 0 ||
    value.byteSize > ANNOUNCEMENT_IMAGE_MAX_BYTE_SIZE
  ) {
    return {ok: false, reason: 'tooLarge'};
  }
  if (
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    value.width > 4096 ||
    value.height > 4096
  ) {
    return {ok: false, reason: 'invalidDimensions'};
  }
  return {ok: true};
}

export function moveUploadItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(to, 0, item);
  return next;
}

export function reconcileUploadItem(
  items: readonly UploadItem[],
  localId: string,
  replacement: UploadItem,
) {
  return items.map((item) => (item.localId === localId ? replacement : item));
}
