import {
  BIBLE_FRIEND_DESIGN_CATALOG,
  BIBLE_FRIEND_DESIGN_STYLES,
  type BibleFriendDesign,
  type BibleFriendDesignId,
  type BibleFriendRarity,
  type BibleFriendStyleId,
} from './bibleFriendDesignCatalog';

export type BibleFriendDrawPool = Readonly<{
  entries: readonly BibleFriendDesign[];
  totalWeight: number;
  rarityWeights: Readonly<Record<BibleFriendRarity, number>>;
}>;

export type BibleFriendDrawOverrides = Readonly<{
  styleWeights?: Partial<Record<BibleFriendStyleId, number>>;
  designWeights?: Partial<Record<BibleFriendDesignId, number>>;
}>;

function validateOverrides(
  values: Readonly<Record<string, number>>,
  allowedIds: ReadonlySet<string>,
): void {
  for (const [id, weight] of Object.entries(values)) {
    if (!allowedIds.has(id)) throw new RangeError(`Unknown design weight ID: ${id}`);
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new RangeError(`Design weight must be a non-negative safe integer: ${id}`);
    }
  }
}

/** Zero disables an entry. A per-design override takes priority over its style. */
export function createBibleFriendDrawPool(
  overrides: BibleFriendDrawOverrides = {},
): BibleFriendDrawPool {
  const styleWeights = overrides.styleWeights ?? {};
  const designWeights = overrides.designWeights ?? {};
  validateOverrides(styleWeights, new Set(BIBLE_FRIEND_DESIGN_STYLES.map(style => style.id)));
  validateOverrides(designWeights, new Set(BIBLE_FRIEND_DESIGN_CATALOG.map(design => design.id)));

  const entries = BIBLE_FRIEND_DESIGN_CATALOG
    .map(design => ({
      ...design,
      weight: designWeights[design.id] ?? (design.styleId === 'miracle' ? undefined : styleWeights[design.styleId]) ?? design.weight,
    }))
    .filter(design => design.weight > 0);
  const totalWeight = entries.reduce((total, design) => total + design.weight, 0);
  if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0) {
    throw new RangeError('Draw pool must have a positive safe-integer total weight.');
  }

  const rarityWeights: Record<BibleFriendRarity, number> = {
    COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, UNIQUE: 0, MIRACLE: 0,
  };
  for (const design of entries) rarityWeights[design.rarity] += design.weight;
  return { entries, totalWeight, rarityWeights };
}

export const BIBLE_FRIEND_DEFAULT_DRAW_POOL = createBibleFriendDrawPool();

/** Returns a ratio in [0, 1], calculated from the same weights used by the draw. */
export function getBibleFriendDesignProbability(
  pool: BibleFriendDrawPool,
  designId: BibleFriendDesignId,
): number {
  return (pool.entries.find(design => design.id === designId)?.weight ?? 0) / pool.totalWeight;
}

/** Pure selection only: the caller supplies randomness; no points/inventory are changed. */
export function pickBibleFriendDesign(
  pool: BibleFriendDrawPool,
  unitRandom: number,
): BibleFriendDesign {
  if (!Number.isFinite(unitRandom) || unitRandom < 0 || unitRandom >= 1) {
    throw new RangeError('Random value must be finite and in [0, 1).');
  }
  const target = unitRandom * pool.totalWeight;
  let cumulative = 0;
  for (const design of pool.entries) {
    cumulative += design.weight;
    if (target < cumulative) return design;
  }
  // Floating-point rounding very close to 1 can land on the upper boundary.
  const last = pool.entries[pool.entries.length - 1];
  if (last === undefined) throw new RangeError('Cannot select from an empty draw pool.');
  return last;
}
