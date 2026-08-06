export function getWeeklyMaterialPlatform() {
  return 'web';
}

export function getAndroidWeeklyMaterialUploadDependencies(): never {
  throw new Error('Android weekly material upload is only available in a native build.');
}
