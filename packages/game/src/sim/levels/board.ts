/**
 * Shared Model A board construction (M4 refactor: flat-dev and test-obstacle
 * build the identical board so maneuver behavior is level-independent).
 *
 * One dynamic rigid body: deck cuboid carries the mass, two massless truck
 * boxes are the ground-contact geometry (final-physics-animation-camera-spec
 * §1). Construction order is fixed (body → deck → front truck → rear truck)
 * and all variation comes from the seeded rng, so every reset with the same
 * seed is bit-identical.
 *
 * M4: all three board colliders emit CONTACT_FORCE_EVENTS so SimWorld can
 * observe hard-collision magnitudes for the maneuver interrupt rule
 * (final-physics §3.3). The report threshold is set to HALF the configured
 * interrupt threshold — the exact comparison happens in GestureFSM against
 * `physics.interruptCollisionImpulse`; the collider threshold only keeps the
 * event queue small. Purely observational: dynamics are unchanged.
 */

import type { RigidBody, World } from '@dimforge/rapier3d-deterministic-compat';
import type { SimConfig } from '@slackpad/shared';
import type { RapierModule, Rng } from './types';

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
  const avx = (rng() * 2 - 1) * j;
  const avy = (rng() * 2 - 1) * j;
  const avz = (rng() * 2 - 1) * j;

  const spawn: BoardSpawn = { x: jx, y: phys.spawnHeight + jy, z: jz };

  const bodyDesc = rapier.RigidBodyDesc.dynamic()
    .setTranslation(spawn.x, spawn.y, spawn.z)
    .setAngvel({ x: avx, y: avy, z: avz })
    .setLinearDamping(phys.linearDamping)
    .setAngularDamping(phys.angularDamping);
  const board = world.createRigidBody(bodyDesc);

  // Contact-force report threshold, N: impulse (N·s) → force at one fixed step.
  const forceThreshold = 0.5 * phys.interruptCollisionImpulse * phys.hz;

  // Deck cuboid (long axis local +Z, width local X) carries the mass.
  world.createCollider(
    rapier.ColliderDesc.cuboid(phys.boardWidth / 2, phys.deckThickness / 2, phys.boardLength / 2)
      .setMass(phys.boardMass)
      .setFriction(phys.boardFriction)
      .setRestitution(phys.boardRestitution)
      .setActiveEvents(rapier.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(forceThreshold),
    board,
  );

  // Two truck boxes below the deck at ±truckInsetZ (massless collision geo).
  // The trucks are the ground-contact geometry and use the low `truckFriction`
  // so the board ROLLS (M3 ground locomotion); the deck keeps `boardFriction`.
  const t = phys.truckHalfExtents;
  for (const insetZ of [phys.truckInsetZ, -phys.truckInsetZ]) {
    world.createCollider(
      rapier.ColliderDesc.cuboid(t.x, t.y, t.z)
        .setTranslation(0, -phys.truckDropY, insetZ)
        .setDensity(0)
        .setFriction(phys.truckFriction)
        // Min combine rule: the trucks glide at THEIR low friction regardless of
        // the (grippy) ground, so cruise/push forces are not eaten by the
        // averaged coefficient (Average would give ~0.48 → ~11 N of drag).
        .setFrictionCombineRule(rapier.CoefficientCombineRule.Min)
        .setRestitution(phys.boardRestitution)
        .setActiveEvents(rapier.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(forceThreshold),
      board,
    );
  }

  return { board, spawn };
}
