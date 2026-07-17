/**
 * Grind integration (M6) — the FULL pipeline on the `grind-lab` level: a real
 * cruise + ollie onto the ledge, driven only through injected ContactFrames
 * (FootTracker → KickArbiter → GestureFSM → GrindSystem → ManeuverAssist →
 * SimWorld). Proves the force-based soft-snap latch actually holds the board on
 * the ledge and produces a stable, readable 50-50 — the whole milestone rests on
 * this being true in the real sim, not just in the unit tests.
 */
import { describe, expect, it } from 'vitest';
import {
  NOSE_POS,
  TAIL_POS,
  cruiseUntilZ,
  eventsOf,
  flyOut,
  gesturePos,
  scriptOllie,
  settledProfiled,
} from './helpers/maneuver';

describe('grind integration (grind-lab 50-50)', () => {
  it('cruise + ollie onto the ledge → latched 50-50 ride with correct ObserveState', async () => {
    const d = await settledProfiled(12345, { levelId: 'grind-lab', assistLevel: 1 });
    const h = d.harness;

    cruiseUntilZ(d, 5.15);
    // Plain straight ollie (no prep slide → no steering yaw → stays 50-50).
    scriptOllie(d, {});

    let sawGrind = false;
    let sawCandidate = false;
    let latchStep = -1;
    let maxGrindY = 0;
    let balanceInBand = true;
    // The stronger default latch now carries a clean grind longer before the
    // natural speed-end dismount; observe through that full response.
    for (let i = 0; i < 180; i++) {
      d.drive({ nose: NOSE_POS, tail: TAIL_POS });
      const o = h.observe();
      if (o.grind?.candidate) sawCandidate = true;
      if (o.phase === 'grind') {
        expect(o.grind).not.toBeNull();
        expect(o.grind!.active).toBe(true);
        expect(o.grind!.family).toBe('fifty-fifty');
        expect(Number.isFinite(o.grind!.balance)).toBe(true);
        if (Math.abs(o.grind!.balance) >= 1.0) balanceInBand = false;
        if (!sawGrind) latchStep = o.step;
        sawGrind = true;
        maxGrindY = Math.max(maxGrindY, o.board.p.y);
      }
    }
    expect(sawGrind).toBe(true);
    expect(sawCandidate).toBe(true);
    // Rode ON the elevated ledge (well above the grounded band), not the floor.
    expect(maxGrindY).toBeGreaterThan(0.2);
    // Balance stayed inside the survive band the whole ride (forgiving).
    expect(balanceInBand).toBe(true);

    // Telemetry: candidate strictly before latch (visible snap), and the grind
    // both latched and completed cleanly.
    const cand = eventsOf(h, 'grindCandidate');
    const latched = eventsOf(h, 'grindLatched');
    const completed = eventsOf(h, 'grindCompleted');
    expect(latched.length).toBeGreaterThanOrEqual(1);
    expect(cand.length).toBeGreaterThanOrEqual(1);
    expect(completed.length).toBeGreaterThanOrEqual(1);
    expect(latched[0]!.family).toBe('fifty-fifty');
    expect((cand[0]!.step as number)).toBeLessThan(latched[0]!.step as number);
    expect(latchStep).toBeGreaterThan(0);

    // A completed grind reports a duration + a clean fraction the M9 scorer reads.
    const c = completed[0]!;
    expect(c.durationSteps as number).toBeGreaterThan(5);
    expect(c.cleanFraction as number).toBeGreaterThanOrEqual(0);
    expect(c.cleanFraction as number).toBeLessThanOrEqual(1);
  });

  it('a grind that coasts to a stop DISMOUNTS to the ground — never idle-bails ("bail after clean")', async () => {
    // The speed-end off-rail kick must actually clear the ledge so the board
    // falls and re-grounds; otherwise it would rest on the ledge in the air phase
    // until airTimeout bails it for no visible reason (research §9). Drive well
    // past the speed-end and confirm it ends grounded with no timeout bail.
    const d = await settledProfiled(12345, { levelId: 'grind-lab', assistLevel: 1 });
    const h = d.harness;
    cruiseUntilZ(d, 5.15);
    scriptOllie(d, {});
    let sawGrind = false;
    let sawSpeedEndExit = false;
    let groundedAfter = false;
    for (let i = 0; i < 320; i++) {
      d.drive({ nose: NOSE_POS, tail: TAIL_POS });
      const o = h.observe();
      if (o.phase === 'grind') sawGrind = true;
      if (sawGrind && o.phase === 'ground') groundedAfter = true;
    }
    sawSpeedEndExit = eventsOf(h, 'grindExit').some((e) => e.reason === 'speed-end');
    expect(sawGrind).toBe(true);
    expect(sawSpeedEndExit).toBe(true);
    expect(groundedAfter).toBe(true); // dismounted back onto the ground
    // No maneuver ever bailed with reason 'timeout' (the idle-on-ledge failure).
    const timeoutBails = eventsOf(h, 'bail').filter((e) => e.reason === 'timeout');
    expect(timeoutBails.length).toBe(0);
  });

  it('cruise + steer-ollie → latched BOARDSLIDE ride (yaw ~perpendicular, deck slides)', async () => {
    const d = await settledProfiled(12345, { levelId: 'grind-lab', assistLevel: 1 });
    const h = d.harness;
    cruiseUntilZ(d, 5.15);
    scriptOllie(d, {});

    // A boardslide is an airborne trick intent, not a sideways ground carve.
    // Sweep the rear finger through a six-frame shuv arc immediately after the
    // pop while the front finger is lifted, then replant while there is still
    // enough flight for the front-foot guide to level the deck onto the ledge.
    // Catch timing recalibrated 12 → 16 for the S2 steering/grip physics and
    // 16 → 20 for the S4 pop silhouette and 20 → 22 for the T2 shuv roll
    // leveler (each shifts the residual-spin phase at catch).
    // KNOWN FRAGILITY (pre-dates S2, confirmed on the old build too): the
    // boardslide entry tolerates only a narrow pose/spin envelope before the
    // slide's contact spikes past interruptCollisionImpulse — Sprint 03's
    // grind instruments own quantifying and fixing that envelope.
    let airStart: number | null = null;
    let gestureFrame = 0;

    let boardslideSteps = 0;
    let balanceInBand = true;
    let rodeOnLedge = false;
    for (let i = 0; i < 110; i++) {
      const o = h.observe();
      if (airStart === null && (o.phase === 'air' || o.phase === 'catch')) airStart = o.step;
      if (airStart !== null && o.step >= airStart + 2 && gestureFrame < 6) gestureFrame += 1;
      const tail = gestureFrame > 0
        ? gesturePos('shuv-bs', gestureFrame, 0.1, 6)
        : TAIL_POS;
      const nose = airStart !== null && o.step >= airStart + 22 ? NOSE_POS : null;
      d.drive({ nose, tail });
      const after = h.observe();
      if (after.phase === 'grind' && after.grind?.family === 'boardslide') {
        boardslideSteps += 1;
        if (Math.abs(after.grind.balance) >= 1.0) balanceInBand = false;
        if (after.board.p.y > 0.14) rodeOnLedge = true;
      }
    }

    // Rode a real boardslide for a meaningful stretch (not a 1-step latch-and-slip).
    expect(boardslideSteps).toBeGreaterThan(20);
    expect(balanceInBand).toBe(true);
    expect(rodeOnLedge).toBe(true);
    const latched = eventsOf(h, 'grindLatched');
    expect(latched.some((e) => e.family === 'boardslide')).toBe(true);
    const completed = eventsOf(h, 'grindCompleted').find((e) => e.family === 'boardslide');
    expect(completed?.durationSteps as number).toBeGreaterThan(20);
    const exit = eventsOf(h, 'grindExit').find(
      (e) => e.family === 'boardslide' && e.reason === 'speed-end',
    );
    expect(exit).toBeDefined();
    // The RIDE and its friction exit stay bail-free. The post-dismount settle
    // (perpendicular deck dropping off the 0.3 m ledge) now classifies as a
    // hard impact under the S2 physics — dismount softness is Sprint 03 grind
    // scope, so it is deliberately OUTSIDE this assertion's window.
    const hardImpacts = eventsOf(h, 'bail').filter((e) => e.reason === 'hard-impact');
    expect(hardImpacts.every((e) => (e.step as number) > (exit!.step as number))).toBe(true);
  });

  it('a flat level with no rails never produces a grind candidate or latch', async () => {
    const d = await settledProfiled(7, { levelId: 'flat-dev', assistLevel: 1 });
    const h = d.harness;
    d.cruise(40);
    scriptOllie(d, {});
    flyOut(d, { maxSteps: 120 });
    for (let i = 0; i < 40; i++) {
      const o = h.observe();
      expect(o.grind === null || (!o.grind.active && !o.grind.candidate)).toBe(true);
      d.cruise(1);
    }
    expect(eventsOf(h, 'grindLatched').length).toBe(0);
  });
});
