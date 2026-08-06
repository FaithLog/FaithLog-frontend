export type NativePdfViewerDependencies = {
  getContentUri: (uri: string) => Promise<string>;
  openAndroidActivity: (
    action: string,
    options: {data: string; flags: number; type: string},
  ) => Promise<void>;
  platform: string;
  share: (uri: string) => Promise<void>;
};

const ANDROID_VIEW_ACTION = 'android.intent.action.VIEW';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export async function openPdfInNativeViewer(
  uri: string,
  dependencies: NativePdfViewerDependencies,
) {
  if (dependencies.platform === 'android') {
    const contentUri = await dependencies.getContentUri(uri);
    await dependencies.openAndroidActivity(ANDROID_VIEW_ACTION, {
      data: contentUri,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
      type: 'application/pdf',
    });
    return;
  }
  await dependencies.share(uri);
}
