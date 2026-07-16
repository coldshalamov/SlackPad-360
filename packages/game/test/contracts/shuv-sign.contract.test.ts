/**
 * S1 perceptual contract — sweep direction → shuv sign (reviews/03 §Stage 0.1).
 *
 * bs-shuv is +yaw by convention, fs-shuv is −yaw; the same physical sweep
 * mirrors across stance. Compact permanent pin (matrix in flip-direction).
 *
 * CURRENT-BEHAVIOR contracts: pass on the untouched build.
 */

import { describe, expect, it } from 'vitest';
import { flyWithGesture, scriptOllie, settledProfiled } from '../helpers/maneuver';
import type { FlipFlightResult, GestureScript } from '../helpers/maneuver';

async function sweep(
  stance: 'regular' | 'goofy',
  gesture: GestureScript,
  seed: number,
): Promise<FlipFlightResult> {
  const d = await settledProfiled(seed, { stance, assistLevel: 1 });
  d.cruise(90);
  scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
  return flyWithGesture(d, {
    gesture,
    perFrame: 0.1,
    frames: 6,
    startAfterAir: 2,
    catchAfterApexSteps: 8,
  });
}

describe('contract: sweep direction → shuv sign', () => {
  it('regular bs sweep: label bs-shuv, +yaw; fs sweep: label fs-shuv, −yaw', async () => {
    const bs = await sweep('regular', 'shuv-bs', 0x5bb1);
    expect(bs.recLabel).toBe('bs-shuv');
    expect(bs.shuvDegrees).toBeGreaterThan(90);

    const fs = await sweep('regular', 'shuv-fs', 0x5bb2);
    expect(fs.recLabel).toBe('fs-shuv');
    expect(fs.shuvDegrees).toBeLessThan(-90);
  });

  it('goofy mirrors both sweep signs', async () => {
    const bs = await sweep('goofy', 'shuv-bs', 0x5bb1);
    expect(bs.recLabel).toBe('fs-shuv');
    expect(bs.shuvDegrees).toBeLessThan(-90);

    const fs = await sweep('goofy', 'shuv-fs', 0x5bb2);
    expect(fs.recLabel).toBe('bs-shuv');
    expect(fs.shuvDegrees).toBeGreaterThan(90);
  });
});
