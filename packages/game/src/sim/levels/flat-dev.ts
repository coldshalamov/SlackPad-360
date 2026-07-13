/**
 * flat-dev — the M2 development level: a flat ground plane, a single Model A
 * board dropped from `physics.spawnHeight`, and (M6) two grindable obstacles for
 * the playable build the G2 human test uses.
 *
 * Construction order is fixed (ground → board → ledge → rail) so every reset with
 * the same seed is bit-identical. All variation comes from the seeded `rng`
 * inside buildBoard. The board is the shared Model A construction in ./board.ts.
 *
 * M6 rails: one forgiving wide LEDGE (+X side) and one thin RAIL (−X side), both
 * along +Z but OFF the +Z run line the M4/M5 scripted/golden sessions use, so
 * those boards never contact a rail — adding the static colliders only perturbs
 * Rapier's internal FP ordering (hashes regenerate; trajectories are identical),
 * never a test's outcome. The player steers over to grind them (rendered so the
 * approach is readable — the anti-magnetism mandate).
 */

import type { LevelBuilder } from './types';
import type { RailDescriptor } from '../rails';
import { buildBoard } from './board';
import { RAIL_FRICTION } from './grind-lab';
import {
  GRINDABLE_COLLISION_GROUPS,
  ORDINARY_WORLD_COLLISION_GROUPS,
} from '../collisionGroups';

/** Playable grind obstacles (level geometry; offset in X off the test run line). */
export const FLAT_DEV_LEDGE = { cx: 4, topY: 0.15, halfWidth: 0.15, z0: 2, z1: 30 };
export const FLAT_DEV_RAIL = { cx: -4, topY: 0.4, halfWidth: 0.04, z0: 2, z1: 30 };

export const flatDev: LevelBuilder = (rapier, world, config, rng) => {
  const phys = config.physics;

  // --- Static ground: top surface at world y = 0 -------------------------
  const g = phys.ground.halfExtents;
  world.createCollider(
    rapier.ColliderDesc.cuboid(g.x, g.y, g.z)
      .setTranslation(0, -g.y, 0)
      .setFriction(phys.ground.friction)
      .setCollisionGroups(ORDINARY_WORLD_COLLISION_GROUPS),
  );

  const built = buildBoard(rapier, world, config, rng);

  // --- Wide ledge (+X) ---------------------------------------------------
  const L = FLAT_DEV_LEDGE;
  const lHalfY = L.topY / 2;
  const lHalfZ = (L.z1 - L.z0) / 2;
  world.createCollider(
    rapier.ColliderDesc.cuboid(L.halfWidth, lHalfY, lHalfZ)
      .setTranslation(L.cx, lHalfY, (L.z0 + L.z1) / 2)
      .setFriction(RAIL_FRICTION)
      .setCollisionGroups(GRINDABLE_COLLISION_GROUPS)
      .setFrictionCombineRule(rapier.CoefficientCombineRule.Min),
  );

  // --- Thin rail (−X) ----------------------------------------------------
  const R = FLAT_DEV_RAIL;
  const rHalfY = 0.02;
  const rHalfZ = (R.z1 - R.z0) / 2;
  world.createCollider(
    rapier.ColliderDesc.cuboid(R.halfWidth, rHalfY, rHalfZ)
      .setTranslation(R.cx, R.topY - rHalfY, (R.z0 + R.z1) / 2)
      .setFriction(RAIL_FRICTION)
      .setCollisionGroups(GRINDABLE_COLLISION_GROUPS)
      .setFrictionCombineRule(rapier.CoefficientCombineRule.Min),
  );

  const rails: RailDescriptor[] = [
    { id: 'ledge', topY: L.topY, ax: L.cx, az: L.z0, bx: L.cx, bz: L.z1, ledge: true },
    { id: 'rail', topY: R.topY, ax: R.cx, az: R.z0, bx: R.cx, bz: R.z1, ledge: false },
  ];

  return { ...built, rails };
};
