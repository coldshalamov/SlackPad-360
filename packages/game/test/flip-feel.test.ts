/**
 * flip-feel (M5) — crossing the forgiving swipe gate opens a real game trick,
 * with a non-zero intensity floor. Fine motor precision shapes the upper part
 * of the envelope; it does not decide whether a recognized flip completes.
 * The table is printed so tuning stays reviewable numbers, not vibes. All runs
 * are scripted ContactFrame injections (inject-only).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import {
  eventsOf,
  gesturePos,
  lastEventOf,
  NOSE_POS,
  settledProfiled,
  scriptOllie,
  TAIL_POS,
} from './helpers/maneuver';
import type { FlipFlightResult } from './helpers/maneuver';

const FULL_TURNS = 300 / 360; // "full kickflip" threshold, turns (≥300°)

async function flick(
  seed: number,
  perFrame: number,
  assistLevel: 0 | 1 | 2 = 1,
): Promise<FlipFlightResult> {
  const d = await settledProfiled(seed, { stance: 'regular', assistLevel });
  d.cruise(90);
  scriptOllie(d);

  const h = d.harness;
  const y0 = h.observe().board.p.y;
  let maxY = y0;
  let airSteps = 0;
  let airStart: number | null = null;
  let gi = 0;
  for (let i = 0; i < 240; i++) {
    const obs = h.observe();
    maxY = Math.max(maxY, obs.board.p.y);
    if (obs.phase === 'air' || obs.phase === 'catch') {
      airSteps += 1;
      if (airStart == null) airStart = obs.step;
    }
    const done = lastEventOf(h, 'trickCompleted') ?? lastEventOf(h, 'bail');
    if (done && (obs.phase === 'ground' || obs.phase === 'bail')) break;
    if (airStart != null && obs.step >= airStart + 2 && gi < 6) gi += 1;
    const tail = gi > 0 ? gesturePos('flip-heel', gi, perFrame, 6) : TAIL_POS;
    // Shipping L1/L2: hold both contacts throughout. The stable stance catches
    // automatically once the recognized flip nears completion.
    d.drive({ nose: NOSE_POS, tail });
  }

  const trick = lastEventOf(h, 'trickCompleted');
  const bail = lastEventOf(h, 'bail');
  const rec = eventsOf(h, 'flipRecognized')[0];
  const outcomeEv = bail && (!trick || (bail.step as number) > (trick.step as number)) ? bail : trick;
  const outcome = outcomeEv === bail ? 'bail' : trick ? (trick.cleanliness as 'clean' | 'dirty') : 'none';
  return {
    height: maxY - y0,
    airtimeSec: airSteps / DEFAULT_SIM_CONFIG.physics.hz,
    outcome,
    thetaDeg: trick ? (trick.thetaDeg as number) : null,
    failReason: h.observe().lastFailReason,
    flipRotations: outcomeEv ? ((outcomeEv.flipRotations as number) ?? 0) : 0,
    shuvDegrees: outcomeEv ? ((outcomeEv.shuvDegrees as number) ?? 0) : 0,
    label: trick ? (trick.label as string) : null,
    caught: lastEventOf(h, 'catch') !== undefined,
    recIntensity: rec ? (rec.intensity as number) : null,
    recLabel: rec ? (rec.label as string) : null,
  };
}

interface Row {
  perFrame: number;
  s: number | null;
  rotations: number;
  outcome: string;
  caught: boolean;
}

describe('flip-feel (M5 defaults)', () => {
  it('recognized flick intensity is non-decreasing, floors at 0.72, and saturates', async () => {
    const speeds = [0.06, 0.086, 0.11, 0.13];
    const rows: Row[] = [];
    for (const [i, perFrame] of speeds.entries()) {
      const run = await flick(0xf100 + i, perFrame);
      rows.push({
        perFrame,
        s: run.recIntensity,
        rotations: +run.flipRotations.toFixed(3),
        outcome: run.outcome,
        caught: run.caught,
      });
    }
    console.info('[flip-feel] held-stance table (perFrame → s, rotation/outcome):');
    for (const r of rows) console.info('  ', JSON.stringify(r));

    const svals = rows.map((r) => r.s ?? 0);
    expect(svals[0]).toBeGreaterThanOrEqual(0.72);
    for (let i = 1; i < svals.length; i++) {
      expect(svals[i]!, `s non-decreasing at perFrame ${rows[i]!.perFrame}`).toBeGreaterThanOrEqual(svals[i - 1]!);
    }
    expect(svals[svals.length - 1]!).toBeGreaterThan(0.9);
    expect(rows.every((r) => r.caught && r.outcome === 'clean')).toBe(true);
  });

  it('a strong held-stance swipe completes a full clean kickflip', async () => {
    const strong = await flick(0xf301, 0.13, 1);
    console.info('[flip-feel] strong caught:', JSON.stringify({ s: strong.recIntensity, rot: strong.flipRotations, out: strong.outcome, label: strong.label }));
    expect(strong.recIntensity!).toBeGreaterThan(0.9);
    expect(Math.abs(strong.flipRotations)).toBeGreaterThanOrEqual(FULL_TURNS);
    expect(strong.outcome).toBe('clean');
    expect(strong.label).toBe('kickflip');
  });

  it('a just-over-threshold forgiving swipe still completes instead of fizzling', async () => {
    const gentle = await flick(0xf401, 0.06, 1);
    console.info('[flip-feel] gentle held:', JSON.stringify({ s: gentle.recIntensity, rot: gentle.flipRotations, out: gentle.outcome, label: gentle.label }));
    expect(gentle.recIntensity).not.toBeNull();
    expect(gentle.recIntensity!).toBeGreaterThanOrEqual(0.72);
    expect(gentle.recLabel).toBe('kickflip');
    expect(gentle.label).toBe('kickflip');
    expect(Math.abs(gentle.flipRotations)).toBeGreaterThanOrEqual(FULL_TURNS);
    expect(gentle.caught).toBe(true);
    expect(gentle.outcome).toBe('clean');
  });

  it('both L1 and L2 complete the same held-stance gesture without manual catch timing', async () => {
    for (const level of [1, 2] as const) {
      const run = await flick(0xf500 + level, 0.08, level);
      expect(run.recLabel).toBe('kickflip');
      expect(run.caught).toBe(true);
      expect(run.label).toBe('kickflip');
      expect(run.outcome).toBe('clean');
    }
  });
});
