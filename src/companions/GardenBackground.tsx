import {Image, StyleSheet, type ImageSourcePropType} from 'react-native';
import type {GardenBackgroundId} from './gardenBackgrounds';

// Use the same scene in the garden and the background picker. Stretch keeps
// the horizon in the upper quarter even when the garden becomes wider.
const gardenScenes: Record<GardenBackgroundId, () => ImageSourcePropType> = {
  default: () => require('../../assets/gardens/default-placement.webp'),
  meadow: () => require('../../assets/gardens/meadow-placement.webp'),
  olive: () => require('../../assets/gardens/olive-placement.webp'),
  shore: () => require('../../assets/gardens/shore-placement.webp'),
  starlight: () => require('../../assets/gardens/starlight-placement.webp'),
};

export function GardenBackground({id}: {id: GardenBackgroundId}) {
  return <Image pointerEvents="none" accessible={false}
    source={gardenScenes[id]()} resizeMode="stretch" style={StyleSheet.absoluteFill} />;
}
