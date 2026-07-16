/**
 * Shared Model A board construction (M4 refactor: flat-dev and test-obstacle
 * build the identical board so maneuver behavior is level-independent).
 *
 * One dynamic rigid body: the deck cuboid carries the mass and collision shape.
 * Four ray-cast wheels are attached by SimWorld after level construction; fake
 * truck-box ground support does not belong to the rigid-body model. Construction
 * order is fixed and all variation comes from the seeded rng, so every reset
 * with the same seed is bit-identical.
 *
 * M4: the board collider emits CONTACT_FORCE_EVENTS so SimWorld can
 * observe hard-collision magnitudes for the maneuver interrupt rule
 * (final-physics §3.3). The report threshold is deliberately lower than the
 * interrupt threshold: SimWorld classifies reported force into support and
 * off-axis impact channels before GestureFSM makes the actual decision.
 * Purely observational: dynamics are unchanged.
 */

import type { RigidBody, World } from '@dimforge/rapier3d-deterministic-compat';
import type { SimConfig } from '@slackpad/shared';
import {
  DECK_COLLISION_GROUPS,
  TRUCK_HANGER_COLLISION_GROUPS,
} from '../collisionGroups';
import type { RapierModule, Rng } from './types';
import { positiveSubstepCount } from '../simRates';

export interface BoardSpawn {
  x: number;
  y: number;
  z: number;
}

export function buildBoard(
  rapier: RapierModule,
  world: World,
  config: SimConfig,
  rng: Rng,
): { board: RigidBody; spawn: BoardSpawn } {
  const phys = config.physics;

  // Symmetric jitter in [-1, 1] * magnitude, drawn in a fixed order.
  const j = phys.spawnJitter;
  const jx = (rng() * 2 - 1) * j;
  const jy = (rng() * 2 - 1) * j;
  const jz = (rng() * 2 - 1) * j;
  const spawn: BoardSpawn = { x: jx, y: phys.spawnHeight + jy, z: jz };

  const bodyDesc = rapier.RigidBodyDesc.dynamic()
    .setTranslation(spawn.x, spawn.y, spawn.z)
    // A reset is a neutral riding state, not an unseen shove. Random angular
    // velocity made the board slowly yaw/roll before the player touched it and
    // could move a straight approach completely off a narrow ledge.
    .setAngvel({ x: 0, y: 0, z: 0 })
    .setLinearDamping(phys.linearDamping)
    .setAngularDamping(phys.angularDamping)
    .setCcdEnabled(true)
    .setAdditionalSolverIterations(4);
  const board = world.createRigidBody(bodyDesc);

  // Contact-force report threshold, N: impulse (N·s) → force at one fixed step.
  const forceThreshold =
    phys.contactReportImpulse * phys.hz * positiveSubstepCount(phys.physicsSubsteps);

  // One stable simcade body carries the deck plus invisible rider/load proxy.
  // The renderer still shows only the board and two authored shoe sockets.
  world.createCollider(
    rapier.ColliderDesc.cuboid(phys.boardWidth / 2, phys.deckThickness / 2, phys.boardLength / 2)
      .setMass(phys.boardMass + phys.riderMass)
      .setFriction(phys.boardFriction)
      .setRestitution(phys.boardRestitution)
      .setCollisionGroups(DECK_COLLISION_GROUPS)
      .setActiveEvents(rapier.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(forceThreshold),
    board,
  );

  // Rail-only truck hangers. Their lower face shares the ray-wheel ride height
  // (truckDropY + truckHalfExtents.y), but collision filtering prevents them
  // from ever supporting the board on ordinary floor, ramps, stairs, or walls.
  const hangerHalfY = Math.min(0.01, phys.truckHalfExtents.y);
  const hangerDropY = phys.truckDropY + phys.truckHalfExtents.y - hangerHalfY;
  for (const insetZ of [phys.truckInsetZ, -phys.truckInsetZ]) {
    world.createCollider(
      rapier.ColliderDesc.cuboid(phys.boardWidth / 2, hangerHalfY, phys.truckHalfExtents.z)
        .setTranslation(0, -hangerDropY, insetZ)
        .setDensity(0)
        .setFriction(phys.truckFriction)
        .setFrictionCombineRule(rapier.CoefficientCombineRule.Min)
        .setRestitution(phys.boardRestitution)
        .setCollisionGroups(TRUCK_HANGER_COLLISION_GROUPS)
        .setActiveEvents(rapier.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(forceThreshold),
      board,
    );
  }

  return { board, spawn };
}
