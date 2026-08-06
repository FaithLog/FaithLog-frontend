export async function openNativePdf(_uri: string): Promise<void> {
  throw new Error('PDF viewer is only available in a native build');
}
