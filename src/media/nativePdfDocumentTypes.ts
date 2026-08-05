export type NativePdfDocumentSource = {
  contentType: string;
  fileName: string;
  uri: string;
};

export type NativePdfDocumentDependencies = {
  getByteSize: (uri: string) => Promise<number>;
  pickDocuments: () => Promise<NativePdfDocumentSource[]>;
  readBytes: (uri: string) => Promise<Uint8Array>;
  sha256: (bytes: Uint8Array) => Promise<string>;
};
