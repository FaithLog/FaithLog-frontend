import {
  createUploadTask,
  FileSystemUploadType,
} from 'expo-file-system/legacy';
import {Platform} from 'react-native';

export function getWeeklyMaterialPlatform() {
  return Platform.OS;
}

export function getAndroidWeeklyMaterialUploadDependencies() {
  return {
    binaryUploadType: FileSystemUploadType.BINARY_CONTENT,
    createUploadTask,
  };
}
