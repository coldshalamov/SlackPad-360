/**
 * S1 perceptual contract — flick direction → flip sign (reviews/03 §Stage 0.1).
 *
 * Heelside flick = kickflip (roll > 0) for a regular rider; the identical pad
 * path is toeside for goofy = heelflip (roll < 0). Compact permanent pin; the
 * broader matrix lives in flip-direction.test.ts.
 *
 * CURRENT-BEHAVIOR contracts: pass on the untouched build.
 */

import { describe, expect, it } from 'vitest';
import { flyWithGesture, scriptOllie, settledProfiled } from '../helpers/maneuver';
import type { FlipFlightResult, GestureScript } from '../helpers/maneuver';

async function flick(
  stance: 'regular' | 'goofy',
  gesture: GestureScript,
  seed: number,
): Promise<FlipFlightResult> {
  const d = await settledProfiled(seed, { stance, assistLevel: 1 });
  d.cruise(90);
  scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
  return flyWithGesture(d, {
    gesture,
    perFrame: 0.13,
    frames: 6,
    startAfterAir: 2,
    catchAfterApexSteps: 6,
  });
}

describe('contract: flick direction → flip sign', () => {
  it('regular heelside flick is a kickflip (+roll); toeside is a heelflip (−roll)', async () => {
    const heel = await flick('regular', 'flip-heel', 0xf1b1);
    expect(heel.recLabel).toBe('kickflip');
    expect(heel.flipRotations).toBeGreaterThan(0.5);

    const toe = await flick('regular', 'flip-toe', 0xf1b2);
    expect(toe.recLabel).toBe('heelflip');
    expect(toe.flipRotations).toBeLessThan(-0.5);
  });

  it('goofy mirrors both flick signs', async () => {
    const heel = await flick('goofy', 'flip-heel', 0xf1b1);
    expect(heel.recLabel).toBe('heelflip');
    expect(heel.flipRotations).toBeLessThan(-0.5);

    const toe = await flick('goofy', 'flip-toe', 0xf1b2);
    expect(toe.recLabel).toBe('kickflip');
    expect(toe.flipRotations).toBeGreaterThan(0.5);
  });
});
