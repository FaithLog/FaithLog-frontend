import Svg, {Circle, Ellipse, Path} from 'react-native-svg';

/**
 * Original vector care marker. The icon is derived from server-backed
 * cleanliness, so no independent timers, RNG, polling or database writes.
 */
export function FarmMessMarker() {
  return <Svg width={34} height={34} viewBox="0 0 34 34" accessibilityLabel="청소가 필요한 흔적">
    <Ellipse cx={17} cy={29} rx={14} ry={3} fill="#C4DEE2" opacity={0.5}/>
    <Path d="M8 27c-4-2-3-8 2-9 2-.4 3-1.5 3-4.2 0-3.3 3.8-5.5 7.3-4.1 2.4 1.1 2.5 3.2 1.5 5.3 4.7.1 6.7 3.6 4.1 7.1 4.9 2.7 4.9 9.2-.3 11H8Z"
      fill="#986D59" stroke="#715446" strokeWidth={1.25} strokeLinejoin="round"/>
    <Path d="M11 21c3.8 1.2 10.6 1.3 13.3.1M14 15.5c2.2 1.1 4.9 1.4 7.5.8"
      stroke="#D8AC8C" strokeWidth={1.7} strokeLinecap="round" fill="none" opacity={0.85}/>
    <Circle cx={12.4} cy={24.4} r={1.1} fill="#F8F6EF"/>
    <Circle cx={21.6} cy={24.4} r={1.1} fill="#F8F6EF"/>
  </Svg>;
}
