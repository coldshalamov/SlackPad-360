import { describe, expect, it } from 'vitest';
import * as RendererModule from '../src/render/GameRenderer';

describe('directional shadow stability', () => {
  it('snaps a moving shadow anchor to exact light-space texels', () => {
    const stabilize = (RendererModule as unknown as {
      stableShadowAnchor(
        x: number,
        z: number,
        span: number,
        mapSize: number,
        previous?: { x: number; z: number },
      ): { x: number; z: number };
    }).stableShadowAnchor;
    expect(typeof stabilize).toBe('function');

    const a = stabilize(1.2345, 4.5678, 20, 2048);
    const b = stabilize(1.2346, 4.5679, 20, 2048);
    expect(b.x).toBe(a.x);
    expect(b.z).toBe(a.z);

    const texel = 20 / 2048;
    // Fixed light direction is target - position = (-6, -10, -4).
    const forwardLength = Math.hypot(6, 10, 4);
    const fx = -6 / forwardLength;
    const fy = -10 / forwardLength;
    const fz = -4 / forwardLength;
    const rightLength = Math.hypot(-fz, fx);
    const rx = -fz / rightLength;
    const rz = fx / rightLength;
    const ux = -rz * fy;
    const uz = rx * fy;
    expect((a.x * rx + a.z * rz) / texel).toBeCloseTo(Math.round((a.x * rx + a.z * rz) / texel), 8);
    expect((a.x * ux + a.z * uz) / texel).toBeCloseTo(Math.round((a.x * ux + a.z * uz) / texel), 8);

    const oneTexelNudge = stabilize(a.x + texel, a.z, 20, 2048, a);
    expect(oneTexelNudge).toEqual(a);
    const deliberateMove = stabilize(a.x + 0.25, a.z, 20, 2048, a);
    expect(deliberateMove).not.toEqual(a);
  });
});
