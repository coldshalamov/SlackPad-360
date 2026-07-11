/** Level-registry types. A level builder constructs the static geometry and
 * the board body for a given seed, in a fixed order, so that reset(seed,
 * levelId) is fully reproducible. */

import type { RigidBody, World } from '@dimforge/rapier3d-deterministic-compat';
import type { SimConfig } from '@slackpad/shared';

/** Seeded PRNG: returns a float in [0, 1). */
export type Rng = () => number;

/** The RAPIER default-export namespace value (init/World/ColliderDesc/...). */
export type RapierModule = (typeof import('@dimforge/rapier3d-deterministic-compat'))['default'];

/** Handles a built level hands back to the sim. */
export interface LevelHandle {
  /** The single dynamic board rigid body (Model A). */
  board: RigidBody;
  /**
   * Spawn marker (M4): the exact (seed-jittered) board spawn translation. The
   * deterministic bail-respawn game rule inside SimWorld returns the board
   * here — it is level data, never an agent-reachable API.
   */
  spawn: { x: number; y: number; z: number };
}

export type LevelBuilder = (
  rapier: RapierModule,
  world: World,
  config: SimConfig,
  rng: Rng,
) => LevelHandle;
