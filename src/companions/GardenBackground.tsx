import {Image, StyleSheet, View} from 'react-native';
import Svg, {Circle, Ellipse, G, Path, Rect} from 'react-native-svg';
import type {GardenBackgroundId} from './gardenBackgrounds';

/** Quiet, static scenery behind the animals; never intercepts their gestures. */
export function GardenBackground({id}: {id: GardenBackgroundId}) {
  if (id === 'default') return null;
  if (id === 'meadow') return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}><Image source={require('../../assets/gardens/meadow-painted-v2.png')} resizeMode="cover" accessible={false} style={StyleSheet.absoluteFill} /></View>;
  const night = id === 'starlight';
  const sky = night ? '#DDE2F1' : id === 'shore' ? '#E9F3F6' : '#EDF4EC';
  const ground = night ? '#CEDBD9' : id === 'shore' ? '#F2E9D6' : '#DFEBD8';
  return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%" viewBox="0 0 360 144" preserveAspectRatio="xMidYMid slice">
      <Rect width={360} height={144} fill={sky} />
      {night ? <>
        <Circle cx={305} cy={24} r={12} fill="#FFF9E5" />
        {[24, 65, 113, 167, 222, 266, 337].map((x, i) => <Path key={x} d="M0 -3 L1 -1 L3 0 L1 1 L0 3 L-1 1 L-3 0 L-1 -1Z" transform={`translate(${x},${14 + i % 3 * 13})`} fill="#FFFFFF" />)}
      </> : <>
        <Ellipse cx={62} cy={24} rx={28} ry={7} fill="#FFFFFF" opacity={.65} />
        <Ellipse cx={279} cy={37} rx={32} ry={8} fill="#FFFFFF" opacity={.55} />
      </>}
      {id === 'shore' ? <>
        <Path d="M0 54 Q90 46 180 56 T360 53 V144 H0Z" fill="#C5E2E6" />
        <Path d="M0 73 Q95 62 180 76 T360 72 V144 H0Z" fill={ground} />
        <Path d="M0 72 Q95 61 180 75 T360 71" fill="none" stroke="#FFFFFF" strokeWidth={3} opacity={.8} />
        <Ellipse cx={326} cy={122} rx={7} ry={3} fill="#DFCFB8" />
      </> : <>
        <Path d="M0 64 Q75 43 163 64 T360 58 V144 H0Z" fill={ground} />
        <Path d="M0 115 Q105 82 225 112 T360 101 V144 H0Z" fill={night ? '#BDCFCA' : '#D3E3CC'} opacity={.65} />
        {id === 'olive' ? [20, 333].map(x => <G key={x} transform={`translate(${x},14)`}>
          <Path d="M0 69 Q-3 43 2 23 M0 48 L-13 34 M0 41 L15 26" stroke="#B9B29C" strokeWidth={4} fill="none" />
          <Ellipse cx={-8} cy={23} rx={22} ry={18} fill="#BDCFAC" /><Ellipse cx={13} cy={15} rx={22} ry={18} fill="#CCDABD" />
        </G>) : null}
        {[17, 83, 276, 344].map((x, i) => <G key={x} transform={`translate(${x},${109 + i % 2 * 20})`}>
          <Path d="M0 4 L0 -3 M0 3 L-4 0" stroke="#A8BFA1" strokeWidth={1.5} />
          <Circle cy={-4} r={2.5} fill={night ? '#F9F5DC' : '#FFF8EB'} />
        </G>)}
      </>}
    </Svg>
  </View>;
}
