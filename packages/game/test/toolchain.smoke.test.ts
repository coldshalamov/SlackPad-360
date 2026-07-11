import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import * as THREE from 'three';
import {
  CONTACT_FRAME_SCHEMA_VERSION,
  DEFAULT_SIM_CONFIG,
  fnv1a,
  validateContactFrame,
} from '@slackpad/shared';

function runWorld(steps: number): string {
  const world = new RAPIER.World(DEFAULT_SIM_CONFIG.physics.gravity);
  world.timestep = 1 / DEFAULT_SIM_CONFIG.physics.hz;
  const groundDesc = RAPIER.ColliderDesc.cuboid(20, 0.1, 20).setTranslation(0, -0.1, 0);
  world.createCollider(groundDesc);
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0.05, 1.5, -0.02)
    .setRotation({ x: 0.05, y: 0.1, z: 0.02, w: 0.99 });
  const body = world.createRigidBody(bodyDesc);
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.1, 0.025, 0.4).setRestitution(0.4),
    body,
  );

  const parts: string[] = [];
  for (let i = 0; i < steps; i++) {
    world.step();
    if (i % 10 === 0) {
      const p = body.translation();
      const q = body.rotation();
      parts.push(
        [p.x, p.y, p.z, q.x, q.y, q.z, q.w].map((v) => v.toFixed(12)).join(','),
      );
    }
  }
  world.free();
  return fnv1a(parts.join('|'));
}

describe('toolchain smoke', () => {
  it('rapier deterministic-compat produces identical 120-step hashes across runs', async () => {
    await RAPIER.init();
    const h1 = runWorld(120);
    const h2 = runWorld(120);
    expect(h1).toBe(h2);
  });

  it('three imports at the pinned version line', () => {
    expect(THREE.REVISION).toBe('185');
  });

  it('shared contact frame validation accepts a canonical frame', () => {
    const result = validateContactFrame({
      schemaVersion: CONTACT_FRAME_SCHEMA_VERSION,
      frameId: 0,
      tPerfMs: 0,
      source: 'synthetic',
      contacts: [
        { id: 1, tip: true, x: 0.4, y: 0.6, confidence: true },
        { id: 2, tip: true, x: 0.6, y: 0.6, confidence: true },
      ],
      buttons: { primary: false, secondary: false, auxiliary: false },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('shared contact frame validation rejects malformed frames', () => {
    const result = validateContactFrame({
      schemaVersion: 2,
      frameId: -1,
      tPerfMs: Number.NaN,
      source: 'telepathy',
      contacts: [{ id: 1, tip: true, x: 4, y: -1, confidence: 'yes' }],
      buttons: { primary: 'no' },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(4);
  });
});
