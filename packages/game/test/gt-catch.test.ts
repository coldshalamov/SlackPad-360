/**
 * GT-catch (M4) — catch volumes + window (final-physics §3.2, trick-spec §5):
 *  - replant inside a socket volume during the post-apex window → catch:
 *    angular velocity is scaled by exactly (1 − catchGain·assistScale[L]) and
 *    the landing is measurably cleaner than the no-catch control run;
 *  - replant OUTSIDE the volumes → no catch (missed catch, harder landing);
 *  - replant BEFORE the apex (catch.apexOnly default) → window closed, no
 *    catch;
 *  - forgiveness sweep: replant offsets across the volume radius, reported as
 *    numbers (volumeRadius 0.15 m, padToBoardScale 0.6 → pad offsets < 0.25
 *    catch, beyond miss).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { eventsOf, lastEventOf, NOSE_POS, scriptOllie, settled, TAIL_POS } from './helpers/maneuver';
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
 * Scripted q=1 ollie; optionally replant the nose at `replantApexOffset` steps
 * relative to the apex (negative = before apex) at NOSE_POS + `offset`.
 */
async function ollieWithReplant(
  seed: number,
  replantApexOffset: number | null,
  offset: FootInput = { x: 0, y: 0 },
): Promise<CatchRun> {
  const d = await settled(seed);
  d.cruise(90);
  scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });

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

    // Pre-apex replant: schedule from air start (apex is unknowable then).
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

    const plantNow = !replanted && target != null && obs.step >= target;
    if (plantNow) {
      avBefore = Math.hypot(obs.board.av.x, obs.board.av.y, obs.board.av.z);
      replanted = true;
    }
    d.drive({
      nose: replanted ? { x: NOSE_POS.x + offset.x, y: NOSE_POS.y + offset.y } : null,
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

describe('GT-catch: catch volumes and window', () => {
  it('replant at the socket inside the window → catch, ω scaled by the spec factor', async () => {
    const run = await ollieWithReplant(0xca7c1, 2);
    expect(run.caught).toBe(true);
    // Default assist level 1: factor = 1 − 1.0·0.55 = 0.45.
    const expected = 1 - DEFAULT_SIM_CONFIG.catch.catchGain * DEFAULT_SIM_CONFIG.catch.assistScale[1];
    expect(run.catchFactor).toBeCloseTo(expected, 6);
    // Direct ω measurement across the catch step: |av| drops to ~factor.
    expect(run.avBeforeReplant).not.toBeNull();
    expect(run.avAfterReplant).not.toBeNull();
    const ratio = run.avAfterReplant! / run.avBeforeReplant!;
    expect(ratio).toBeLessThan(expected + 0.12); // damping factor plus slack
    expect(ratio).toBeGreaterThan(expected - 0.12);
    expect(run.outcome).toBe('clean');
  });

  it('no replant (control) → no catch, harder landing than the caught run', async () => {
    const caught = await ollieWithReplant(0xca7c1, 2);
    const control = await ollieWithReplant(0xca7c1, null);
    expect(control.caught).toBe(false);
    // Missed catch: no damping → the control lands dirtier (bigger θ) or bails.
    expect(control.outcome === 'dirty' || control.outcome === 'bail').toBe(true);
    if (control.thetaDeg != null && caught.thetaDeg != null) {
      expect(control.thetaDeg).toBeGreaterThan(caught.thetaDeg);
    }
  });

  it('replant OUTSIDE the catch volumes → no catch', async () => {
    // 0.5 pad units × padToBoardScale 0.6 = 0.30 m from the socket ≫ 0.15 m.
    const run = await ollieWithReplant(0xca7c2, 2, { x: -0.25, y: 0.43 });
    expect(run.caught).toBe(false);
  });

  it('replant BEFORE the apex → window closed (catch.apexOnly), no catch', async () => {
    const run = await ollieWithReplant(0xca7c3, -1);
    expect(run.caught).toBe(false);
  });

  it('forgiveness sweep: catch volume admits generous replant error (reported)', async () => {
    const cfg = DEFAULT_SIM_CONFIG;
    const rows: Array<{ padOffset: number; meters: number; caught: boolean }> = [];
    // Pad-unit offsets map to board-local meters via padToBoardScale (0.6).
    for (const [i, padOffset] of [0, 0.1, 0.2, 0.3].entries()) {
      const run = await ollieWithReplant(0xca7d0 + i, 2, { x: padOffset, y: 0 });
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
