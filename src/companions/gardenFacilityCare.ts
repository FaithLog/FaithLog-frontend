import type {FarmMutation} from './companionFarmVisual';
import type {GardenDecorationLayout} from './GardenDecorations';
import {constrainGardenPoint, GARDEN_ANIMAL_SIZE, type GardenAgent, type GardenBounds, type GardenPoint} from './gardenMotion';

const facilities = {
  FEED: {ids: ['hay-feeder', 'seed-dish'], icon: 'action-feed', label: '먹이 시설'},
  PLAY: {ids: ['cloud-swing'], icon: 'action-play', label: '놀이 시설'},
  SLEEP: {ids: ['lamb-shelter', 'crescent-bed', 'blanket-basket'], icon: 'action-sleep', label: '수면 시설'},
} as const;

export function getCareFacilityLabel(id: string): string | undefined {
  return Object.values(facilities).find(facility => facility.ids.some(value => value === id))?.label;
}

export type FacilityApproach = {
  slot: number;
  icon: typeof facilities[keyof typeof facilities]['icon'];
  origin: GardenPoint;
  departureAt: number;
  arrivalAt: number;
};

function destination(slot: number, bounds: GardenBounds): GardenPoint {
  // Match the decoration layer's three equal slots and place the animal just in front.
  return constrainGardenPoint({
    x: 12 + (bounds.width - 24) * (slot + 0.5) / 3 - GARDEN_ANIMAL_SIZE / 2,
    y: bounds.height * 0.26 + 17,
  }, bounds);
}

export function findCareFacility(layout: GardenDecorationLayout | null, action: FarmMutation,
    origin: GardenPoint, bounds: GardenBounds, now: number): FacilityApproach | null {
  if (!layout || (action !== 'FEED' && action !== 'PLAY' && action !== 'SLEEP')) return null;
  const {ids, icon} = facilities[action];
  let best: FacilityApproach | null = null;
  let shortest = Infinity;
  layout.forEach((id, slot) => {
    if (!id || !ids.some(facility => facility === id)) return;
    const point = destination(slot, bounds);
    const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
    if (distance >= shortest) return;
    shortest = distance;
    best = {slot, icon, origin, departureAt: now, arrivalAt: now + Math.ceil(distance / 0.26)};
  });
  return best;
}

export function advanceFacilityApproach(agent: GardenAgent, approach: FacilityApproach,
    elapsed: number, bounds: GardenBounds): GardenAgent {
  const target = destination(approach.slot, bounds);
  const duration = Math.max(1, approach.arrivalAt - approach.departureAt);
  const fraction = Math.min(1, Math.max(0, (elapsed - approach.departureAt) / duration));
  const x = target.x - approach.origin.x;
  const y = target.y - approach.origin.y;
  return {
    ...agent,
    target,
    position: constrainGardenPoint({x: approach.origin.x + x * fraction, y: approach.origin.y + y * fraction}, bounds),
    facing: Math.abs(x) < 1 ? agent.facing : x < 0 ? -1 : 1,
    motion: fraction === 1 ? 'idle' : 'walk',
    motionSince: approach.departureAt,
    decisionAt: approach.arrivalAt + 700,
  };
}
