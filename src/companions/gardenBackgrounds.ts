/** Stable IDs for future server inventory and background draw rewards. */
export const GARDEN_BACKGROUNDS = [
  {id: 'default', name: '기본', description: '낮은 생울타리가 둘러싼 밝은 잔디 마당'},
  {id: 'meadow', name: '평안한 초원', description: '꽃이 가장자리에 피어난 넓은 초원'},
  {id: 'olive', name: '올리브 숲', description: '올리브 나무 사이로 열린 잔디 마당'},
  {id: 'shore', name: '갈릴리 해변', description: '잔잔한 물결 너머 넓게 펼쳐진 모래밭'},
  {id: 'starlight', name: '별빛 정원', description: '은은한 별이 빛나는 밤의 정원'},
] as const;
export type GardenBackgroundId = typeof GARDEN_BACKGROUNDS[number]['id'];
export function isGardenBackgroundId(value: string): value is GardenBackgroundId {
  return GARDEN_BACKGROUNDS.some(background => background.id === value);
}
