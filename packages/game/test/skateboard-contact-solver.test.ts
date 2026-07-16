import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { SkateboardContactSolver } from '../src/sim/SkateboardContactSolver';

describe('skateboard-specific wheel contact architecture', () => {
  it('does not route board support or steering through Rapier car-vehicle semantics', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/sim/SimWorld.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toContain('DynamicRayCastVehicleController');
    expect(source).not.toContain('createVehicleController');
  });

  it('uses swept wheel volumes and physical point impulses', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/sim/SkateboardContactSolver.ts', import.meta.url)),
      'utf8',
    );
    expect(source).toContain('castShape');
    expect(source).not.toContain('castRayAndGetNormal');
    expect(source).toContain('applyImpulseAtPoint');
    expect(source).toContain('velocityAtPoint');
  });

  it('preserves real shallow-bank normals instead of flattening them as cast noise', async () => {
    await RAPIER.init();
    const p = DEFAULT_SIM_CONFIG.physics;
    const angle = 3 * Math.PI / 180; // y component > .995: the old bug flattened this.
    const q = { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) };
    const normal = { x: 0, y: Math.cos(angle), z: Math.sin(angle) };
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(4, 0.1, 4).setRotation(q),
    );
    const rideHeight = 0.1 + p.wheelRadius + p.wheelSuspensionRestLength + p.deckThickness / 2;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(normal.x * rideHeight, normal.y * rideHeight, normal.z * rideHeight)
        .setRotation(q),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(p.boardWidth / 2, p.deckThickness / 2, p.boardLength / 2)
        .setMass(p.boardMass + p.riderMass),
      body,
    );
    const solver = new SkateboardContactSolver(p);

    // Populate Rapier's broad-phase query pipeline after construction.
    world.step();
    solver.update(world, body, 1 / (p.hz * p.physicsSubsteps));

    const contacts = solver.observations().filter((wheel) => wheel.inContact);
    expect(contacts).toHaveLength(4);
    for (const contact of contacts) {
      expect(Math.abs(contact.contactNormal!.z)).toBeGreaterThan(0.04);
      expect(contact.contactNormal!.y).toBeCloseTo(Math.cos(angle), 3);
    }
    world.free();
  });
});
