/**
 * flat-dev — the M2 development level: an infinite-ish flat ground plane and a
 * single Model A board body dropped from `physics.spawnHeight`.
 *
 * Construction order is fixed (ground → board) so every reset with the same
 * seed is bit-identical. All variation comes from the seeded `rng` inside
 * buildBoard (position offset + angular-velocity jitter so different seeds
 * diverge — the cross-seed determinism guard). The board itself is the shared
 * Model A construction in ./board.ts (M4 refactor).
 */

import type { LevelBuilder } from './types';
import { buildBoard } from './board';

export const flatDev: LevelBuilder = (rapier, world, config, rng) => {
  const phys = config.physics;

  // --- Static ground: top surface at world y = 0 -------------------------
  const g = phys.ground.halfExtents;
  world.createCollider(
    rapier.ColliderDesc.cuboid(g.x, g.y, g.z)
      .setTranslation(0, -g.y, 0)
      .setFriction(phys.ground.friction),
  );

  return buildBoard(rapier, world, config, rng);
};
