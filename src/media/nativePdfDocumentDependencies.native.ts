import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import {File} from 'expo-file-system';

import type {
  NativePdfDocumentDependencies,
  NativePdfDocumentSource,
} from './nativePdfDocumentTypes';

export type {NativePdfDocumentDependencies, NativePdfDocumentSource};

export function createNativePdfDocumentDependencies({
  multiple,
}: {
  multiple: boolean;
}): NativePdfDocumentDependencies {
  return {
    async pickDocuments() {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple,
        type: 'application/pdf',
      });
      if (result.canceled) return [];
      return result.assets.map((asset) => ({
        contentType: asset.mimeType ?? '',
        fileName: asset.name,
        uri: asset.uri,
      }));
    },
    async getByteSize(uri) {
      return new File(uri).size;
    },
    async readBytes(uri) {
      return new File(uri).bytes();
    },
    async sha256(bytes) {
      const digest = await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        Uint8Array.from(bytes),
      );
      return bytesToHex(new Uint8Array(digest));
    },
  };
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
