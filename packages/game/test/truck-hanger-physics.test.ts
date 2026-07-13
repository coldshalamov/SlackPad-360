import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { GrindSystem } from '../src/control/GrindSystem';
import {
  GRINDABLE_COLLISION_GROUPS,
  ORDINARY_WORLD_COLLISION_GROUPS,
} from '../src/sim/collisionGroups';
import { buildBoard } from '../src/sim/levels/board';
import { ensureRapier } from '../src/sim/SimWorld';
import { nearestRail } from '../src/sim/rails';
import type { RailDescriptor } from '../src/sim/rails';
import { makeFeet } from './helpers/grind';

function testConfig(spawnHeight: number) {
  const config = structuredClone(DEFAULT_SIM_CONFIG);
  config.physics.spawnHeight = spawnHeight;
  config.physics.spawnJitter = 0;
  config.physics.linearDamping = 0.2;
  config.physics.angularDamping = 0.8;
  return config;
}

describe('rail-only physical truck hangers', () => {
  it('supports a real 50-50 at truck height on a thin rail and permits the latch', async () => {
    await ensureRapier();
    const config = testConfig(0.42);
    const world = new RAPIER.World(config.physics.gravity);
    world.timestep = 1 / config.physics.hz;

    const rail: RailDescriptor = {
      id: 'thin-test-rail',
      topY: 0.15,
      ax: 0,
      az: -5,
      bx: 0,
      bz: 5,
      ledge: false,
    };
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.04, 0.02, 5)
        .setTranslation(0, rail.topY - 0.02, 0)
        .setCollisionGroups(GRINDABLE_COLLISION_GROUPS),
    );
    const { board } = buildBoard(RAPIER, world, config, () => 0.5);

    for (let i = 0; i < 180; i++) world.step();
    const p = board.translation();
    const q = board.rotation();

    // Deck-bottom support would settle at 0.175 m. Truck-hanger support holds
    // the board at rail top + the configured 0.085 m ride height instead.
    expect(p.y).toBeGreaterThan(rail.topY + 0.07);
    expect(p.y).toBeLessThan(rail.topY + 0.1);

    const proximity = nearestRail([rail], p.x, p.z);
    const grind = new GrindSystem(config, 1);
    const result = grind.update({
      rail: proximity,
      pose: {
        p: { x: p.x, y: p.y, z: p.z },
        q: { x: q.x, y: q.y, z: q.z, w: q.w },
        lv: { x: 0, y: 0, z: 3 },
        av: { x: 0, y: 0, z: 0 },
      },
      feet: makeFeet(),
      canLatch: true,
      recentPop: true,
      hopRequested: false,
      contactImpulse: 0,
      step: 1,
    });
    expect(result.latchedThisStep).toBe(true);
    expect(result.family).toBe('fifty-fifty');
    world.free();
  });

  it('the same hanger geometry cannot support the board on ordinary flat ground', async () => {
    await ensureRapier();
    const config = testConfig(0.3);
    const world = new RAPIER.World(config.physics.gravity);
    world.timestep = 1 / config.physics.hz;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(4, 0.1, 4)
        .setTranslation(0, -0.1, 0)
        .setCollisionGroups(ORDINARY_WORLD_COLLISION_GROUPS),
    );
    const { board } = buildBoard(RAPIER, world, config, () => 0.5);

    for (let i = 0; i < 180; i++) world.step();

    // No ray vehicle in this isolated fixture: if a hanger can collide with
    // ordinary ground it rests around 0.085 m. Correct filtering lets only the
    // deck touch, at half the 0.05 m deck thickness.
    expect(board.translation().y).toBeGreaterThan(0.015);
    expect(board.translation().y).toBeLessThan(0.045);
    world.free();
  });
});
