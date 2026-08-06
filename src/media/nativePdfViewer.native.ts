import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {Platform} from 'react-native';

import {openPdfInNativeViewer} from './nativePdfViewerPolicy';

export async function openNativePdf(uri: string) {
  await openPdfInNativeViewer(uri, {
    getContentUri: (fileUri) => FileSystem.getContentUriAsync(fileUri),
    openAndroidActivity: (action, options) =>
      IntentLauncher.startActivityAsync(action, options).then(() => undefined),
    platform: Platform.OS,
    share: async (fileUri) => {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('PDF viewer is unavailable');
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
    },
  });
}
