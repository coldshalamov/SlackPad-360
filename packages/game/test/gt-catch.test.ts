/**
 * GT-catch (M4) — the shipping assists treat a held stable two-contact stance
 * as staying over the board: L1/L2 auto-catch on descent. L0 retains the
 * explicit post-apex replant/volume path for players who choose manual catch.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { eventsOf, lastEventOf, NOSE_POS, scriptOllie, settledProfiled, TAIL_POS } from './helpers/maneuver';
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
  const d = await settledProfiled(seed, { assistLevel, kickAttribution: 'buttonSide' });
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

  it('assisted auto-catch applies the configured angular damping factor', async () => {
    const d = await settledProfiled(0xca7c8, { assistLevel: 1, kickAttribution: 'buttonSide' });
    d.cruise(90);
    scriptOllie(d);
    let before: number | null = null;
    let after: number | null = null;
    for (let i = 0; i < 160 && after == null; i++) {
      const obs = d.harness.observe();
      const count = eventsOf(d.harness, 'catch').length;
      before = Math.hypot(obs.board.av.x, obs.board.av.y, obs.board.av.z);
      d.drive({ nose: NOSE_POS, tail: TAIL_POS });
      if (eventsOf(d.harness, 'catch').length > count) {
        const av = d.harness.observe().board.av;
        after = Math.hypot(av.x, av.y, av.z);
      }
    }
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    const expected = 1 - DEFAULT_SIM_CONFIG.catch.catchGain * DEFAULT_SIM_CONFIG.catch.assistScale[1];
    expect(after! / before!).toBeGreaterThan(expected - 0.12);
    expect(after! / before!).toBeLessThan(expected + 0.12);
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
