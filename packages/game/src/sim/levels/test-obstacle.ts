/**
 * test-obstacle — flat-dev plus one static wall (M4). Exists for the maneuver
 * interrupt tests (gt-interrupt): a board popped at cruise speed smacks the
 * wall face mid-air, producing a hard contact-force event above
 * `physics.interruptCollisionImpulse` while airborne → bail path.
 *
 * Geometry: a wide, tall box across the +Z run line. The face the board hits
 * sits at z = WALL_Z − WALL_HALF_DEPTH. Construction order is fixed
 * (ground → wall → board) so resets are bit-identical per seed.
 */

import type { LevelBuilder } from './types';
import { buildBoard } from './board';
import { ORDINARY_WORLD_COLLISION_GROUPS } from '../collisionGroups';

/** Wall placement (level geometry, not a physics tunable). */
export const OBSTACLE_WALL_Z = 12;
export const OBSTACLE_WALL_HALF = { x: 6, y: 3, z: 0.2 };

export const testObstacle: LevelBuilder = (rapier, world, config, rng) => {
  const phys = config.physics;

  // --- Static ground: top surface at world y = 0 -------------------------
  const g = phys.ground.halfExtents;
  world.createCollider(
    rapier.ColliderDesc.cuboid(g.x, g.y, g.z)
      .setTranslation(0, -g.y, 0)
      .setFriction(phys.ground.friction)
      .setCollisionGroups(ORDINARY_WORLD_COLLISION_GROUPS),
  );

  // --- Static wall across the +Z run line ---------------------------------
  const w = OBSTACLE_WALL_HALF;
  world.createCollider(
    rapier.ColliderDesc.cuboid(w.x, w.y, w.z)
      .setTranslation(0, w.y, OBSTACLE_WALL_Z)
      .setFriction(phys.ground.friction)
      .setCollisionGroups(ORDINARY_WORLD_COLLISION_GROUPS),
  );

  return buildBoard(rapier, world, config, rng);
};
