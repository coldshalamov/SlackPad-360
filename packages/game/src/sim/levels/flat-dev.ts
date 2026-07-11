/**
 * flat-dev — the M2 development level: an infinite-ish flat ground plane and a
 * single Model A board body dropped from `physics.spawnHeight`.
 *
 * Model A (final-physics-animation-camera-spec §1): one dynamic rigid body with
 * a deck cuboid collider plus two truck-box colliders on the SAME body. Mass is
 * carried entirely by the deck collider (`setMass(boardMass)`); the trucks are
 * massless collision geometry (`setDensity(0)`).
 *
 * Construction order is fixed (ground → board body → deck → front truck → rear
 * truck) so every reset with the same seed is bit-identical. All variation
 * comes from the seeded `rng`: a small position offset and angular-velocity
 * jitter so different seeds diverge (the cross-seed determinism guard).
 */

import type { LevelBuilder } from './types';

export const flatDev: LevelBuilder = (rapier, world, config, rng) => {
  const phys = config.physics;

  // Symmetric jitter in [-1, 1] * magnitude, drawn in a fixed order.
  const j = phys.spawnJitter;
  const jx = (rng() * 2 - 1) * j;
  const jy = (rng() * 2 - 1) * j;
  const jz = (rng() * 2 - 1) * j;
  const avx = (rng() * 2 - 1) * j;
  const avy = (rng() * 2 - 1) * j;
  const avz = (rng() * 2 - 1) * j;

  // --- Static ground: top surface at world y = 0 -------------------------
  const g = phys.ground.halfExtents;
  world.createCollider(
    rapier.ColliderDesc.cuboid(g.x, g.y, g.z)
      .setTranslation(0, -g.y, 0)
      .setFriction(phys.ground.friction),
  );

  // --- Board rigid body --------------------------------------------------
  const bodyDesc = rapier.RigidBodyDesc.dynamic()
    .setTranslation(jx, phys.spawnHeight + jy, jz)
    .setAngvel({ x: avx, y: avy, z: avz })
    .setLinearDamping(phys.linearDamping)
    .setAngularDamping(phys.angularDamping);
  const board = world.createRigidBody(bodyDesc);

  // Deck cuboid (long axis local +Z, width local X) carries the mass.
  world.createCollider(
    rapier.ColliderDesc.cuboid(phys.boardWidth / 2, phys.deckThickness / 2, phys.boardLength / 2)
      .setMass(phys.boardMass)
      .setFriction(phys.boardFriction)
      .setRestitution(phys.boardRestitution),
    board,
  );

  // Two truck boxes below the deck at ±truckInsetZ (massless collision geo).
  const t = phys.truckHalfExtents;
  for (const insetZ of [phys.truckInsetZ, -phys.truckInsetZ]) {
    world.createCollider(
      rapier.ColliderDesc.cuboid(t.x, t.y, t.z)
        .setTranslation(0, -phys.truckDropY, insetZ)
        .setDensity(0)
        .setFriction(phys.boardFriction)
        .setRestitution(phys.boardRestitution),
      board,
    );
  }

  return { board };
};
