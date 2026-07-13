/**
 * Rapier interaction groups for skateboard support geometry.
 *
 * The deck interacts with every authored world surface. Truck hangers interact
 * only with explicitly grindable surfaces, so they can support a 50-50 without
 * becoming invisible floor/ramp skids. Ray wheels remain query-based and are
 * deliberately not represented by a collider layer.
 */
export const COLLISION_LAYERS = {
  ordinaryWorld: 1 << 0,
  grindable: 1 << 1,
  deck: 1 << 2,
  truckHanger: 1 << 3,
} as const;

function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export const ORDINARY_WORLD_COLLISION_GROUPS = groups(
  COLLISION_LAYERS.ordinaryWorld,
  COLLISION_LAYERS.deck,
);

export const GRINDABLE_COLLISION_GROUPS = groups(
  COLLISION_LAYERS.grindable,
  COLLISION_LAYERS.deck | COLLISION_LAYERS.truckHanger,
);

export const DECK_COLLISION_GROUPS = groups(
  COLLISION_LAYERS.deck,
  COLLISION_LAYERS.ordinaryWorld | COLLISION_LAYERS.grindable,
);

export const TRUCK_HANGER_COLLISION_GROUPS = groups(
  COLLISION_LAYERS.truckHanger,
  COLLISION_LAYERS.grindable,
);
