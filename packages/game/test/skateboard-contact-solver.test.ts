import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('skateboard-specific wheel contact architecture', () => {
  it('does not route board support or steering through Rapier car-vehicle semantics', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/sim/SimWorld.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toContain('DynamicRayCastVehicleController');
    expect(source).not.toContain('createVehicleController');
  });

  it('uses four explicit wheel rays and physical point impulses', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/sim/SkateboardContactSolver.ts', import.meta.url)),
      'utf8',
    );
    expect(source).toContain('castRayAndGetNormal');
    expect(source).toContain('applyImpulseAtPoint');
    expect(source).toContain('velocityAtPoint');
  });
});
