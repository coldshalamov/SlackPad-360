/**
 * flip-feel (M5) — the measured flick intensity → flip rotation table
 * (final-input-and-trick-spec §5/§7). Flick speed sets s = normalize(peak
 * lateral pad speed); s scales omegaTarget = s·omegaFlipMax, so a stronger flick
 * completes more rotation by the catch-window end. Contract:
 *   - s rises monotonically with flick speed;
 *   - a strong flick (s≈1.0) at assist L1, caught, lands a FULL kickflip
 *     (≥300° roll) CLEAN;
 *   - a weak flick is PARTIAL (<300°) and does NOT land clean without a catch
 *     (bails / lands dirty).
 * The table is printed so tuning stays reviewable numbers, not vibes. All runs
 * are scripted ContactFrame injections (inject-only).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { settledProfiled, scriptOllie, flyWithGesture } from './helpers/maneuver';
import type { FlipFlightResult } from './helpers/maneuver';

const FULL_TURNS = 300 / 360; // "full kickflip" threshold, turns (≥300°)

async function flick(
  seed: number,
  perFrame: number,
  catchAfterApexSteps: number | null,
  assistLevel: 0 | 1 | 2 = 1,
): Promise<FlipFlightResult> {
  const d = await settledProfiled(seed, { stance: 'regular', assistLevel });
  d.cruise(90);
  scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
  return flyWithGesture(d, { gesture: 'flip-heel', perFrame, catchAfterApexSteps, frames: 6, startAfterAir: 2 });
}

interface Row {
  perFrame: number;
  s: number | null;
  caughtRot: number;
  caughtOut: string;
  uncaughtRot: number;
  uncaughtOut: string;
}

describe('flip-feel (M5 defaults)', () => {
  it('flick intensity table: s monotonic, strong→full clean, weak→partial', async () => {
    const speeds = [0.06, 0.086, 0.11, 0.13];
    const rows: Row[] = [];
    for (const [i, perFrame] of speeds.entries()) {
      const caught = await flick(0xf100 + i, perFrame, 3);
      const uncaught = await flick(0xf200 + i, perFrame, null);
      rows.push({
        perFrame,
        s: caught.recIntensity,
        caughtRot: +caught.flipRotations.toFixed(3),
        caughtOut: caught.outcome,
        uncaughtRot: +uncaught.flipRotations.toFixed(3),
        uncaughtOut: uncaught.outcome,
      });
    }
    console.info('[flip-feel] table (perFrame → s, caught rot/out, uncaught rot/out):');
    for (const r of rows) console.info('  ', JSON.stringify(r));

    // s rises monotonically with flick speed (until the pad-edge clamp).
    const svals = rows.map((r) => r.s ?? 0);
    for (let i = 1; i < svals.length; i++) {
      expect(svals[i]!, `s monotonic at perFrame ${rows[i]!.perFrame}`).toBeGreaterThan(svals[i - 1]!);
    }
    // Strong flick (s≈1.0) reaches full-kickflip s.
    expect(svals[svals.length - 1]!).toBeGreaterThan(0.9);
  });

  it('s≈1.0 at L1, caught → FULL kickflip (≥300°), CLEAN', async () => {
    const strong = await flick(0xf301, 0.13, 6, 1);
    console.info('[flip-feel] strong caught:', JSON.stringify({ s: strong.recIntensity, rot: strong.flipRotations, out: strong.outcome, label: strong.label }));
    expect(strong.recIntensity!).toBeGreaterThan(0.9);
    expect(Math.abs(strong.flipRotations)).toBeGreaterThanOrEqual(FULL_TURNS);
    expect(strong.outcome).toBe('clean');
    expect(strong.label).toBe('kickflip');
  });

  it('weak flick → PARTIAL (<300°) that does not land clean without a catch', async () => {
    const weakUncaught = await flick(0xf401, 0.06, null);
    console.info('[flip-feel] weak uncaught:', JSON.stringify({ s: weakUncaught.recIntensity, rot: weakUncaught.flipRotations, out: weakUncaught.outcome, label: weakUncaught.label }));
    // Partial rotation, and it never lands clean (bails or dirty).
    expect(Math.abs(weakUncaught.flipRotations)).toBeLessThan(FULL_TURNS);
    expect(weakUncaught.outcome === 'bail' || weakUncaught.outcome === 'dirty').toBe(true);
  });

  it('catch matters: the same strong flick UNCAUGHT over-rotates and never lands clean', async () => {
    const caught = await flick(0xf501, 0.13, 6, 1);
    const uncaught = await flick(0xf501, 0.13, null, 1);
    console.info('[flip-feel] catch-matters:', JSON.stringify({ caught: caught.outcome, caughtRot: caught.flipRotations, uncaught: uncaught.outcome, uncaughtRot: uncaught.flipRotations }));
    expect(caught.outcome).toBe('clean');
    expect(uncaught.outcome === 'bail' || uncaught.outcome === 'dirty').toBe(true);
    // Uncaught keeps spinning past the caught (quantized) rotation.
    expect(Math.abs(uncaught.flipRotations)).toBeGreaterThan(Math.abs(caught.flipRotations));
  });
});
