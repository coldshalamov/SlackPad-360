/**
 * flip-direction (M5) — sign correctness for BOTH stances (final-input-and-
 * trick-spec §5 grammar). The SAME physical pad path means "heelside" for one
 * stance and "toeside" for the other, so it must flip the trick sign:
 *   - a heelside flick → kickflip (roll > 0); a regular rider's heelside pad
 *     path becomes a goofy rider's TOESIDE path → heelflip (roll < 0);
 *   - a bs-shuv sweep for a regular rider mirrors to fs-shuv for a goofy rider.
 * The outcome label is named from the MEASURED rotation sign, so this also
 * asserts sign(flipRotations) matches the label (never circular: the discriminator
 * is the shared pad input, evaluated under two stances).
 */
import { describe, expect, it } from 'vitest';
import { settledProfiled, scriptOllie, flyWithGesture } from './helpers/maneuver';
import type { GestureScript, FlipFlightResult } from './helpers/maneuver';

async function run(
  seed: number,
  stance: 'regular' | 'goofy',
  gesture: GestureScript,
  perFrame: number,
  catchAfterApexSteps: number | null,
): Promise<FlipFlightResult> {
  const d = await settledProfiled(seed, { stance, assistLevel: 1 });
  d.cruise(90);
  scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
  return flyWithGesture(d, { gesture, perFrame, catchAfterApexSteps, frames: 6, startAfterAir: 2 });
}

describe('flip-direction: stance sign correctness', () => {
  it('kickflip/heelflip: same pad flick flips label + rotation sign across stance', async () => {
    // Identical pad path (flip-heel = pad-down slide), only the stance differs.
    const reg = await run(0xd1a1, 'regular', 'flip-heel', 0.13, 6);
    const goo = await run(0xd1a1, 'goofy', 'flip-heel', 0.13, 6);

    expect(reg.recLabel).toBe('kickflip');
    expect(goo.recLabel).toBe('heelflip');
    expect(reg.label).toBe('kickflip');
    expect(goo.label).toBe('heelflip');
    // The physical roll reversed with stance…
    expect(Math.sign(reg.flipRotations)).toBe(1);
    expect(Math.sign(goo.flipRotations)).toBe(-1);
    // …and each label matches the sign of its own measured rotation.
    expect(reg.flipRotations).toBeGreaterThan(0.5);
    expect(goo.flipRotations).toBeLessThan(-0.5);
  });

  it('the mirror flick (flip-toe) inverts each stance too', async () => {
    const reg = await run(0xd1b2, 'regular', 'flip-toe', 0.13, 6);
    const goo = await run(0xd1b2, 'goofy', 'flip-toe', 0.13, 6);
    // Toeside for regular = heelflip; the same path is heelside for goofy = kickflip.
    expect(reg.recLabel).toBe('heelflip');
    expect(goo.recLabel).toBe('kickflip');
    expect(Math.sign(reg.flipRotations)).toBe(-1);
    expect(Math.sign(goo.flipRotations)).toBe(1);
  });

  it('shuv FS/BS: same sweep flips fs↔bs across stance, sign matches label', async () => {
    const reg = await run(0xd1c3, 'regular', 'shuv-bs', 0.1, 8);
    const goo = await run(0xd1c3, 'goofy', 'shuv-bs', 0.1, 8);

    expect(reg.recLabel).toBe('bs-shuv');
    expect(goo.recLabel).toBe('fs-shuv');
    expect(reg.label).toBe('bs-shuv');
    expect(goo.label).toBe('fs-shuv');
    // bs-shuv is +yaw by convention; fs-shuv is −yaw. Signs oppose across stance.
    expect(Math.sign(reg.shuvDegrees)).toBe(1);
    expect(Math.sign(goo.shuvDegrees)).toBe(-1);
    expect(Math.abs(reg.shuvDegrees)).toBeGreaterThan(90);
    expect(Math.abs(goo.shuvDegrees)).toBeGreaterThan(90);
  });
});
