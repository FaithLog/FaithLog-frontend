import type {PropsWithChildren, RefObject} from 'react';
import {View} from 'react-native';

export type GardenPhotoCapture = {capture: () => Promise<string>};
export type GardenPhotoFrameProps = PropsWithChildren<{
  enabled: boolean;
  captureRef: RefObject<GardenPhotoCapture | null>;
}>;

export const gardenPhotoRuntime: {
  canSaveToGallery: boolean;
  saveToGallery: (uri: string) => Promise<void>;
} | null = null;

export function GardenPhotoFrame({children}: GardenPhotoFrameProps) {
  return <View>{children}</View>;
}
