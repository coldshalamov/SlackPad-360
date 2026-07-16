/**
 * S4 perceptual contract — the ollie is an authored performance.
 *
 * Landed red→green inside Sprint 02 S4: the flown pitch follows the ACTIVE
 * config silhouette (pop.pitchCurves + profile popPitchPreset), presets are
 * discriminable in the flown motion, and the nollie mirrors the sign. The
 * quantitative fidelity gate (RMS < 4°) lives in the gated feel report; these
 * contracts pin the qualitative truths that must never regress.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG, samplePitchCurve } from '@slackpad/shared';
import type { PopPitchPreset } from '@slackpad/shared';
import { NOSE_POS, TAIL_POS, lastEventOf, scriptOllie, settledProfiled } from '../helpers/maneuver';
import { pitchNoseUpDeg, scriptNollie } from '../feel/scenarios';

async function flownPitch(
  preset: PopPitchPreset,
  kind: 'ollie' | 'nollie',
): Promise<{ samples: Array<{ age: number; pitchDeg: number }>; outcome: string | null }> {
  const d = await settledProfiled(0x0111e, { popPitchPreset: preset });
  d.cruise(90);
  const kick = kind === 'ollie' ? scriptOllie(d, {}) : scriptNollie(d, {});
  const samples: Array<{ age: number; pitchDeg: number }> = [];
  for (let i = 0; i < 90; i++) {
    const o = d.harness.observe();
    samples.push({ age: o.step - kick, pitchDeg: pitchNoseUpDeg(o.board.q) });
    const done = lastEventOf(d.harness, 'trickCompleted') ?? lastEventOf(d.harness, 'bail');
    if (done && (o.phase === 'ground' || o.phase === 'bail')) break;
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
  }
  const trick = lastEventOf(d.harness, 'trickCompleted');
  return { samples, outcome: trick ? (trick.cleanliness as string) : null };
}

function rmsVsCurve(
  samples: Array<{ age: number; pitchDeg: number }>,
  preset: PopPitchPreset,
  sign: 1 | -1,
): number {
  const curve = DEFAULT_SIM_CONFIG.pop.pitchCurves[preset];
  const duration = DEFAULT_SIM_CONFIG.pop.curveDurationSteps;
  const errs = samples
    .filter((s) => s.age >= 0 && s.age <= duration)
    .map((s) => s.pitchDeg - sign * samplePitchCurve(curve, s.age / duration));
  return Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / Math.max(1, errs.length));
}

describe('contract: authored pop silhouette', () => {
  it('the flown ollie tracks its own preset curve better than a different preset', async () => {
    const flown = await flownPitch('crisp', 'ollie');
    const own = rmsVsCurve(flown.samples, 'crisp', 1);
    const other = rmsVsCurve(flown.samples, 'floaty', 1);
    expect(own).toBeLessThan(other);
    expect(own).toBeLessThan(8);
  });

  it('switching the profile preset changes the flown motion (aggressive peaks above floaty)', async () => {
    const floaty = await flownPitch('floaty', 'ollie');
    const aggressive = await flownPitch('aggressive', 'ollie');
    const peak = (s: Array<{ pitchDeg: number }>): number =>
      s.reduce((a, x) => Math.max(a, x.pitchDeg), -Infinity);
    expect(peak(aggressive.samples)).toBeGreaterThan(peak(floaty.samples) + 4);
  });

  it('the nollie mirrors the silhouette sign', async () => {
    const flown = await flownPitch('crisp', 'nollie');
    const minPitch = flown.samples.reduce((a, s) => Math.min(a, s.pitchDeg), Infinity);
    expect(minPitch).toBeLessThan(-15); // nose-DOWN performance
    expect(rmsVsCurve(flown.samples, 'crisp', -1)).toBeLessThan(8);
  });
});
