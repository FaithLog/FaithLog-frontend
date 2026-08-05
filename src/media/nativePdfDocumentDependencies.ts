import type {NativePdfDocumentDependencies} from './nativePdfDocumentTypes';

export type {NativePdfDocumentDependencies, NativePdfDocumentSource} from './nativePdfDocumentTypes';

/**
 * Vitest and non-native resolvers use this fail-closed implementation. Metro
 * selects nativePdfDocumentDependencies.native.ts for iOS and Android, where
 * the Expo modules are statically bundled into the application.
 */
export function createNativePdfDocumentDependencies(
  _options: {multiple: boolean},
): NativePdfDocumentDependencies {
  const unavailable = async (): Promise<never> => {
    throw new Error('Native PDF document access is unavailable');
  };
  return {
    getByteSize: unavailable,
    pickDocuments: unavailable,
    readBytes: unavailable,
    sha256: unavailable,
  };
}
