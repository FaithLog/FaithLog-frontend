/** Stable IDs for future server inventory and background draw rewards. */
export const GARDEN_BACKGROUNDS = [
  {id: 'default', name: '기본', description: '앱의 기본 배경'},
  {id: 'meadow', name: '평안한 초원', description: '작은 꽃이 피어난 연둣빛 초원'},
  {id: 'olive', name: '올리브 숲', description: '올리브 나무 아래의 조용한 쉼터'},
  {id: 'shore', name: '갈릴리 해변', description: '잔잔한 물결과 따뜻한 모래'},
  {id: 'starlight', name: '별빛 정원', description: '은은한 별이 빛나는 밤의 정원'},
] as const;
export type GardenBackgroundId = typeof GARDEN_BACKGROUNDS[number]['id'];
export function isGardenBackgroundId(value: string): value is GardenBackgroundId {
  return GARDEN_BACKGROUNDS.some(background => background.id === value);
}
