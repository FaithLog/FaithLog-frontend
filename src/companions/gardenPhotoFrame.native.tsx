import {requireNativeView, requireOptionalNativeModule} from 'expo';
import type {PropsWithChildren, RefObject} from 'react';
import {View} from 'react-native';

export type GardenPhotoCapture = {capture: () => Promise<string>};
type FrameProps = PropsWithChildren<{enabled: boolean; captureRef: RefObject<GardenPhotoCapture | null>}>;
type Runtime = {canSaveToGallery: boolean; saveToGallery: (uri: string) => Promise<void>};

const moduleName = 'FaithLogGardenPhoto';
export const gardenPhotoRuntime = requireOptionalNativeModule<Runtime>(moduleName);
const NativeFrame = gardenPhotoRuntime
  ? requireNativeView<PropsWithChildren<{ref: RefObject<GardenPhotoCapture | null>}>>(moduleName)
  : null;

export function GardenPhotoFrame({children, captureRef, enabled}: FrameProps) {
  return enabled && NativeFrame ? <NativeFrame ref={captureRef}>{children}</NativeFrame> : <View>{children}</View>;
}
