/**
 * S1 perceptual contract — pop polarity (reviews/03 §Stage 0.1).
 *
 * A tail tap dips the tail / raises the NOSE (ollie); a nose tap raises the
 * TAIL (nollie). Invariant across stance: logical roles already absorb the
 * goofy mirror, and the physical board end that rises is determined by which
 * logical end was tapped. ControlDiagnostics.popPolarityOk must never report
 * false during the ascent (null = not yet discriminable is fine).
 *
 * CURRENT-BEHAVIOR contracts: pass on the untouched build; S4 reshapes the
 * pitch curve but must never invert polarity.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { scriptOllie, settled, settledProfiled } from '../helpers/maneuver';
import type { PadDriver } from '../helpers/maneuver';
import { scriptNollie } from '../feel/scenarios';

const HALF_LENGTH = DEFAULT_SIM_CONFIG.physics.boardLength / 2;

/** Extreme nose-over-tail height (m) during the 12 steps after the kick. */
function popExtremes(d: PadDriver): { max: number; min: number; polarityViolations: number } {
  let max = -Infinity;
  let min = Infinity;
  let polarityViolations = 0;
  const noseBase = d.logicalNoseBase();
  const tailBase = d.logicalTailBase();
  for (let i = 0; i < 12; i++) {
    const { q } = d.harness.observe().board;
    const noseOverTail = 2 * HALF_LENGTH * (2 * (q.y * q.z - q.w * q.x));
    max = Math.max(max, noseOverTail);
    min = Math.min(min, noseOverTail);
    if (d.harness.controlDiagnostics().popPolarityOk === false) polarityViolations += 1;
    d.driveLogical({ nose: noseBase, tail: tailBase });
  }
  return { max, min, polarityViolations };
}

describe('contract: pop polarity', () => {
  it('tail tap (ollie): nose rises above tail', async () => {
    const d = await settled(0x9090);
    d.cruise(60);
    scriptOllie(d);
    const { max, polarityViolations } = popExtremes(d);
    expect(max).toBeGreaterThan(0.025);
    expect(polarityViolations).toBe(0);
  });

  it('nose tap (nollie): tail rises above nose', async () => {
    const d = await settled(0x9091);
    d.cruise(60);
    scriptNollie(d);
    const { min, polarityViolations } = popExtremes(d);
    expect(min).toBeLessThan(-0.025);
    expect(polarityViolations).toBe(0);
  });

  it('goofy tail tap still raises the physical nose', async () => {
    const d = await settledProfiled(0x9092, { stance: 'goofy' });
    d.cruise(60);
    scriptOllie(d);
    const { max, polarityViolations } = popExtremes(d);
    expect(max).toBeGreaterThan(0.025);
    expect(polarityViolations).toBe(0);
  });

  it('goofy nose tap still raises the physical tail', async () => {
    const d = await settledProfiled(0x9093, { stance: 'goofy' });
    d.cruise(60);
    scriptNollie(d);
    const { min, polarityViolations } = popExtremes(d);
    expect(min).toBeLessThan(-0.025);
    expect(polarityViolations).toBe(0);
  });
});
