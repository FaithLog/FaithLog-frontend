const CARE_BADGES = [
  {label: '돌봄의 시작', careDays: 3},
  {label: '정성 어린 돌봄', careDays: 7},
  {label: '오래 함께한 친구', careDays: 14},
] as const;

export function getCompanionCareBadges(careDays: number) {
  const next = CARE_BADGES.find(badge => careDays < badge.careDays);
  const earned = CARE_BADGES.filter(badge => careDays >= badge.careDays).at(-1);
  return {earned, next};
}
