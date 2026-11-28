import {describe, expect, it} from 'vitest';
import {advanceFacilityApproach, findCareFacility} from './gardenFacilityCare';
import {createGardenAgent} from './gardenMotion';

describe('garden care facilities', () => {
  const bounds = {width: 300, height: 208};
  const origin = {x: 235, y: 70};
  it('finds the nearest matching facility in the saved layout', () => {
    expect(findCareFacility(['hay-feeder','cloud-swing','seed-dish'], 'FEED', origin, bounds, 0)?.slot).toBe(2);
    expect(findCareFacility(['hay-feeder','cloud-swing','seed-dish'], 'PLAY', origin, bounds, 0)?.slot).toBe(1);
    expect(findCareFacility(['hay-feeder','cloud-swing','seed-dish'], 'SLEEP', origin, bounds, 0)).toBeNull();
  });

  it('walks toward the placed shelter and stops in front of it', () => {
    const approach = findCareFacility(['lamb-shelter',null,null], 'SLEEP', origin, bounds, 100)!;
    const agent = createGardenAgent(origin, 100, bounds);
    const halfway = advanceFacilityApproach(agent, approach, (100 + approach.arrivalAt) / 2, bounds);
    const arrived = advanceFacilityApproach(halfway, approach, approach.arrivalAt, bounds);
    expect(halfway.motion).toBe('walk');
    expect(halfway.position.x).toBeLessThan(origin.x);
    expect(arrived.motion).toBe('idle');
    expect(arrived.position).toEqual(arrived.target);
    expect(arrived.position.x).toBeLessThan(halfway.position.x);
  });
});
