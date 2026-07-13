/**
 * grind-lab — the M6 grind test rig: flat ground, one forgiving WIDE LEDGE and
 * one thin RAIL, both running along the +Z line the board naturally cruises.
 *
 * The wide ledge (low, full-width support) is the robust scriptable-50-50
 * target: the board cruises up to speed, ollies over the front edge, and comes
 * down onto the top — a long ledge means the descending arc reliably crosses the
 * ride height somewhere over it, so the latch is deterministic without pixel-
 * perfect pop timing. The thin rail (elevated, offset in +X) exists for the
 * multi-rail proximity path and harder-assist coverage.
 *
 * Construction order is fixed (ground → board → ledge → rail) so resets are
 * bit-identical per seed; rails are built AFTER the board (they never contact it
 * on the spawn drop) to minimise perturbation of the board's own settling.
 */

import type { LevelBuilder } from './types';
import type { RailDescriptor } from '../rails';
import { buildBoard } from './board';
import {
  GRINDABLE_COLLISION_GROUPS,
  ORDINARY_WORLD_COLLISION_GROUPS,
} from '../collisionGroups';

/**
 * Ledge geometry (level data, not a physics tunable). Board 50-50s the top. The
 * front face sits at z0 = 8 m, leaving open runway from spawn (z≈0) so the board
 * can build cruise speed and ollie over the front edge; the ledge is long so the
 * descending arc reliably crosses the ride height somewhere over the top.
 */
export const LEDGE = { cx: 0, topY: 0.15, halfWidth: 0.15, z0: 7, z1: 34 };
/** Thin rail geometry: elevated, offset to +X so it is a distinct second rail. */
export const RAIL = { cx: 1.5, topY: 0.5, halfWidth: 0.04, z0: 7, z1: 34 };
/** Grindable-surface friction (low, Min-combined) so decks SLIDE — see below. */
export const RAIL_FRICTION = 0.1;

export const grindLab: LevelBuilder = (rapier, world, config, rng) => {
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

  // --- Wide ledge (box; top at LEDGE.topY, sits on the ground) -----------
  // Low friction + Min combine so a boardslide's DECK SLIDES along the top
  // instead of gripping (a deck-slam would otherwise kill forward speed and
  // instant-speed-end the grind). The 50-50's trucks are already Min-friction
  // 0.06, so min(0.06, railFriction) is unchanged — 50-50 behaviour is identical.
  const lHalfY = LEDGE.topY / 2;
  const lHalfZ = (LEDGE.z1 - LEDGE.z0) / 2;
  const lCz = (LEDGE.z0 + LEDGE.z1) / 2;
  world.createCollider(
    rapier.ColliderDesc.cuboid(LEDGE.halfWidth, lHalfY, lHalfZ)
      .setTranslation(LEDGE.cx, lHalfY, lCz)
      .setFriction(RAIL_FRICTION)
      .setCollisionGroups(GRINDABLE_COLLISION_GROUPS)
      .setFrictionCombineRule(rapier.CoefficientCombineRule.Min),
  );

  // --- Thin rail (thin box; elevated) ------------------------------------
  const rHalfY = 0.02;
  const rHalfZ = (RAIL.z1 - RAIL.z0) / 2;
  const rCz = (RAIL.z0 + RAIL.z1) / 2;
  world.createCollider(
    rapier.ColliderDesc.cuboid(RAIL.halfWidth, rHalfY, rHalfZ)
      .setTranslation(RAIL.cx, RAIL.topY - rHalfY, rCz)
      .setFriction(RAIL_FRICTION)
      .setCollisionGroups(GRINDABLE_COLLISION_GROUPS)
      .setFrictionCombineRule(rapier.CoefficientCombineRule.Min),
  );

  const rails: RailDescriptor[] = [
    { id: 'ledge', topY: LEDGE.topY, ax: LEDGE.cx, az: LEDGE.z0, bx: LEDGE.cx, bz: LEDGE.z1, ledge: true },
    { id: 'rail', topY: RAIL.topY, ax: RAIL.cx, az: RAIL.z0, bx: RAIL.cx, bz: RAIL.z1, ledge: false },
  ];

  return { ...built, rails };
};
