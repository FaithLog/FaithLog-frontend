import type {BibleFriendMotion} from '../characters/bibleFriendMotionTimeline';

export const GARDEN_ANIMAL_SIZE = 64;
export const GARDEN_HEIGHT = 208;
export const DRAG_THRESHOLD = 5;
export type GardenPoint = Readonly<{x: number; y: number}>;
export type GardenBounds = Readonly<{width: number; height: number}>;
export type GardenAgent = Readonly<{
  position: GardenPoint;
  target: GardenPoint;
  motion: BibleFriendMotion;
  motionSince: number;
  decisionAt: number;
  speed: number;
  facing: 1 | -1;
}>;
type Random = () => number;
export function constrainGardenPoint(point: GardenPoint, bounds: GardenBounds): GardenPoint {
  return {
    x: Math.max(0, Math.min(Math.max(0, bounds.width - GARDEN_ANIMAL_SIZE), Number.isFinite(point.x) ? point.x : 0)),
    y: Math.max(0, Math.min(Math.max(0, bounds.height - GARDEN_ANIMAL_SIZE), Number.isFinite(point.y) ? point.y : 0)),
  };
}
export function normalizeGardenPoint(point: GardenPoint, bounds: GardenBounds): GardenPoint {
  const clamped = constrainGardenPoint(point, bounds);
  return {x: clamped.x / Math.max(1, bounds.width - GARDEN_ANIMAL_SIZE), y: clamped.y / Math.max(1, bounds.height - GARDEN_ANIMAL_SIZE)};
}
export function restoreGardenPoint(point: GardenPoint, bounds: GardenBounds): GardenPoint {
  return constrainGardenPoint({x: point.x * Math.max(0, bounds.width - GARDEN_ANIMAL_SIZE), y: point.y * Math.max(0, bounds.height - GARDEN_ANIMAL_SIZE)}, bounds);
}
export function chooseGardenTarget(bounds: GardenBounds, others: readonly GardenPoint[], random: Random = Math.random): GardenPoint {
  let candidate: GardenPoint = {x: 0, y: 0};
  for (let attempt = 0; attempt < 12; attempt++) {
    candidate = constrainGardenPoint({x: random() * Math.max(0, bounds.width - GARDEN_ANIMAL_SIZE), y: random() * Math.max(0, bounds.height - GARDEN_ANIMAL_SIZE)}, bounds);
    if (others.every(p => Math.hypot(p.x - candidate.x, p.y - candidate.y) >= 42)) break;
  }
  return candidate;
}
export function createGardenAgent(position: GardenPoint, now: number, bounds: GardenBounds, random: Random = Math.random): GardenAgent {
  const safe = constrainGardenPoint(position, bounds);
  return {position: safe, target: safe, motion: 'idle', motionSince: now, decisionAt: now + 400 + random() * 2000, speed: 20 + random() * 12, facing: random() < .5 ? -1 : 1};
}
export function reactGardenAgent(agent: GardenAgent, now: number, reduceMotion: boolean): GardenAgent {
  return {...agent, motion: reduceMotion ? 'idle' : 'happy', motionSince: now, decisionAt: now + 1200};
}
export function releaseGardenAgent(agent: GardenAgent, now: number, reduceMotion: boolean): GardenAgent {
  return {...agent, target: agent.position, motion: reduceMotion ? 'idle' : 'land', motionSince: now, decisionAt: now + 1800};
}
/** Independent destinations with gentle local separation; no fixed lanes or sine-loop paths. */
export function advanceGardenAgent(agent: GardenAgent, now: number, deltaMs: number, bounds: GardenBounds, others: readonly GardenPoint[], random: Random = Math.random): GardenAgent {
  const position = constrainGardenPoint(agent.position, bounds);
  if (agent.motion === 'held') return {...agent, position};
  if ((agent.motion === 'happy' && now - agent.motionSince < 780) || (agent.motion === 'land' && now - agent.motionSince < 350)) return {...agent, position};
  if (agent.motion !== 'walk') {
    if (now < agent.decisionAt) return {...agent, position, motion: 'idle'};
    const target = chooseGardenTarget(bounds, others, random);
    return {...agent, position, target, motion: 'walk', motionSince: now, decisionAt: now + 7000};
  }
  let dx = agent.target.x - position.x, dy = agent.target.y - position.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 3 || now >= agent.decisionAt) return {...agent, position, motion: 'idle', motionSince: now, decisionAt: now + 900 + random() * 1900};
  dx /= distance; dy /= distance;
  for (const other of others) {
    const separation = Math.hypot(position.x - other.x, position.y - other.y);
    if (separation > .1 && separation < 36) {
      const force = (36 - separation) / 36;
      dx += (position.x - other.x) / separation * force;
      dy += (position.y - other.y) / separation * force;
    }
  }
  const length = Math.max(.01, Math.hypot(dx, dy));
  const step = Math.min(distance, agent.speed * Math.max(0, Math.min(deltaMs, 120)) / 1000);
  const next = constrainGardenPoint({x: position.x + dx / length * step, y: position.y + dy / length * step}, bounds);
  if (others.some(other => Math.hypot(next.x-other.x,next.y-other.y) < 40 && Math.hypot(next.x-other.x,next.y-other.y) < Math.hypot(position.x-other.x,position.y-other.y))) {
    return {...agent,position,motion:'idle',motionSince:now,decisionAt:now+250+random()*350};
  }
  return {...agent, position:next, facing: Math.abs(dx) > .1 ? dx < 0 ? -1 : 1 : agent.facing};
}
