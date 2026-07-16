/**
 * GT-catch (M4) — the shipping assists treat a held stable two-contact stance
 * as staying over the board: L1/L2 auto-catch on descent. L0 retains the
 * explicit post-apex replant/volume path for players who choose manual catch.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { SimWorld } from '../src/sim/SimWorld';
import {
  eventsOf,
  lastEventOf,
  NOSE_POS,
  scriptOllie,
  settledProfiled,
  TAIL_POS,
} from './helpers/maneuver';
import type { FootInput } from './helpers/maneuver';

interface CatchRun {
  caught: boolean;
  catchFactor: number | null;
  /** |av| on the step before and after the replant edge (catch step). */
  avBeforeReplant: number | null;
  avAfterReplant: number | null;
  outcome: string | null;
  thetaDeg: number | null;
}

/**
 * Script a binary click pop, then either hold both contacts or exercise L0's
 * manual replant path at `replantApexOffset` relative to the apex.
 */
async function runCatch(
  seed: number,
  assistLevel: 0 | 1 | 2,
  mode: 'hold' | 'lift' | 'manual',
  replantApexOffset: number | null = null,
  offset: FootInput = { x: 0, y: 0 },
): Promise<CatchRun> {
  const d = await settledProfiled(seed, { assistLevel, kickAttribution: 'motionTap' });
  d.cruise(90);
  scriptOllie(d);

  const h = d.harness;
  let apexStep: number | null = null;
  let airStart: number | null = null;
  let replanted = false;
  let avBefore: number | null = null;
  let avAfter: number | null = null;

  for (let i = 0; i < 200; i++) {
    const obs = h.observe();
    const phase = obs.phase;
    if ((phase === 'air' || phase === 'catch') && airStart == null) airStart = obs.step;
    if (airStart != null && apexStep == null && obs.board.lv.y <= 0) apexStep = obs.step;

    // Pre-apex manual replant: schedule shortly after liftoff, while a
    // non-negative offset is measured from the detected apex.
    const target =
      replantApexOffset == null
        ? null
        : replantApexOffset >= 0
          ? apexStep != null
            ? apexStep + replantApexOffset
            : null
          : airStart != null && apexStep == null
            ? airStart + 3 // "before apex": shortly after liftoff
            : null;

    const plantNow = mode === 'manual' && !replanted && target != null && obs.step >= target;
    if (plantNow) {
      avBefore = Math.hypot(obs.board.av.x, obs.board.av.y, obs.board.av.z);
      replanted = true;
    }
    d.drive({
      nose:
        mode === 'hold'
          ? NOSE_POS
          : mode === 'manual' && replanted
            ? { x: NOSE_POS.x + offset.x, y: NOSE_POS.y + offset.y }
            : null,
      tail: TAIL_POS,
    });
    if (plantNow) {
      const after = h.observe();
      avAfter = Math.hypot(after.board.av.x, after.board.av.y, after.board.av.z);
    }
    const done = lastEventOf(h, 'trickCompleted') ?? lastEventOf(h, 'bail');
    if (done && (h.observe().phase === 'ground' || h.observe().phase === 'bail')) break;
  }

  const catchEv = lastEventOf(h, 'catch');
  const trick = lastEventOf(h, 'trickCompleted');
  return {
    caught: catchEv !== undefined,
    catchFactor: catchEv ? (catchEv.factor as number) : null,
    avBeforeReplant: avBefore,
    avAfterReplant: avAfter,
    outcome: trick ? (trick.cleanliness as string) : lastEventOf(h, 'bail') ? 'bail' : null,
    thetaDeg: trick ? (trick.thetaDeg as number) : null,
  };
}

describe('GT-catch: assisted hold and optional L0 manual catch', () => {
  it('L1 and L2 auto-catch a held stable stance on descent and land clean', async () => {
    for (const level of [1, 2] as const) {
      const run = await runCatch(0xca7c0 + level, level, 'hold');
      expect(run.caught).toBe(true);
      const expected = 1 - DEFAULT_SIM_CONFIG.catch.catchGain * DEFAULT_SIM_CONFIG.catch.assistScale[level];
      expect(run.catchFactor).toBeCloseTo(expected, 6);
      expect(run.outcome).toBe('clean');
    }
  });

  it('the catch executor applies the commanded angular factor (and spares pitch only when told)', async () => {
    // S4 semantics: a base-ollie catch spares the board-right (pitch) axis —
    // the authored silhouette keeps playing through the catch — while every
    // other axis (and every axis of a flip/shuv catch, preservePitch=false)
    // damps by exactly the commanded factor. The old pipeline measurement of
    // total |av| across an ollie catch no longer isolates the factor (the
    // live performance and quantize compose), so pin the executor directly:
    // build a known roll spin physically, then catch it.
    const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
    await world.reset(0xca7c8, 'flat-dev');
    for (let i = 0; i < 90; i++) world.step();
    // Pop airborne first — grounded wheels resist roll and would mask the
    // factor — then build the roll spin in the air.
    world.applyManeuver({
      kind: 'pop',
      jY: DEFAULT_SIM_CONFIG.pop.jMin +
        DEFAULT_SIM_CONFIG.pop.baseQuality *
          (DEFAULT_SIM_CONFIG.pop.jMax - DEFAULT_SIM_CONFIG.pop.jMin),
      popSide: 'tail',
      kickImpulse: 0,
    });
    for (let i = 0; i < 8; i++) world.step();
    for (let i = 0; i < 3; i++) {
      world.applyManeuver({
        kind: 'flipTorque',
        axis: 'long',
        omegaTarget: 8,
        tauMax: DEFAULT_SIM_CONFIG.flip.tauMax[2],
      });
      world.step();
    }
    const before = world.boardPose().av;
    const beforeMag = Math.hypot(before.x, before.y, before.z);
    expect(beforeMag).toBeGreaterThan(1);
    const factor = 1 -
      DEFAULT_SIM_CONFIG.catch.catchGain * DEFAULT_SIM_CONFIG.catch.assistScale[1];
    world.applyManeuver({
      kind: 'catch',
      angularFactor: factor,
      maxTorqueImpulse: 1000, // isolate the factor from the impulse clamp
      preservePitch: false,
    });
    world.step();
    const after = world.boardPose().av;
    const afterMag = Math.hypot(after.x, after.y, after.z);
    // One integration step adds gravity/contact noise; keep a modest band.
    expect(afterMag / beforeMag).toBeGreaterThan(factor - 0.12);
    expect(afterMag / beforeMag).toBeLessThan(factor + 0.12);
  });

  it('L0 does not auto-catch a held stance, but a post-apex socket replant catches', async () => {
    const held = await runCatch(0xca7d0, 0, 'hold');
    const manual = await runCatch(0xca7d1, 0, 'manual', 2);
    expect(held.caught).toBe(false);
    expect(manual.caught).toBe(true);
    expect(manual.catchFactor).toBeCloseTo(
      1 - DEFAULT_SIM_CONFIG.catch.catchGain * DEFAULT_SIM_CONFIG.catch.assistScale[0],
      6,
    );
  });

  it('L0 manual catch still respects apex timing and the socket volume', async () => {
    const early = await runCatch(0xca7d2, 0, 'manual', -1);
    const outside = await runCatch(0xca7d3, 0, 'manual', 2, { x: 0.3, y: 0 });
    expect(early.caught).toBe(false);
    expect(outside.caught).toBe(false);
  });

  it('L0 forgiveness sweep keeps the documented manual catch radius', async () => {
    const cfg = DEFAULT_SIM_CONFIG;
    const rows: Array<{ padOffset: number; meters: number; caught: boolean }> = [];
    // Pad-unit offsets map to board-local meters via padToBoardScale (0.6).
    for (const [i, padOffset] of [0, 0.1, 0.2, 0.3].entries()) {
      const run = await runCatch(0xca7e0 + i, 0, 'manual', 2, { x: padOffset, y: 0 });
      rows.push({
        padOffset,
        meters: +(padOffset * cfg.locomotion.padToBoardScale).toFixed(3),
        caught: run.caught,
      });
    }
    console.info(
      `[gt-catch] volumeRadius=${cfg.catch.volumeRadius} m, windowMs=${cfg.catch.windowMs}:`,
      JSON.stringify(rows),
    );
    // 0 m, 0.06 m and 0.12 m inside the 0.15 m radius → catch; 0.18 m → miss.
    expect(rows.map((r) => r.caught)).toEqual([true, true, true, false]);
  });
});
