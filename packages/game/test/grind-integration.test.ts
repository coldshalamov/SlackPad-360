/**
 * Grind integration (M6) — the FULL pipeline on the `grind-lab` level: a real
 * cruise + ollie onto the ledge, driven only through injected ContactFrames
 * (FootTracker → KickArbiter → GestureFSM → GrindSystem → ManeuverAssist →
 * SimWorld). Proves the force-based soft-snap latch actually holds the board on
 * the ledge and produces a stable, readable 50-50 — the whole milestone rests on
 * this being true in the real sim, not just in the unit tests.
 */
import { describe, expect, it } from 'vitest';
import { NOSE_POS, TAIL_POS, settledProfiled, eventsOf, scriptOllie, flyOut } from './helpers/maneuver';
import { rotateAboutCenter } from '../src/input/FootTracker';

describe('grind integration (grind-lab 50-50)', () => {
  it('cruise + ollie onto the ledge → latched 50-50 ride with correct ObserveState', async () => {
    const d = await settledProfiled(12345, { levelId: 'grind-lab', assistLevel: 1 });
    const h = d.harness;

    d.cruise(70);
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
    d.cruise(70);
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
    d.cruise(55);
    // Rotate the physical finger line toward the ledge. Pad Y grows toward the
    // player, so the negative pad angle below produces the intended +yaw line.
    let tail = TAIL_POS;
    let nose = NOSE_POS;
    for (let i = 1; i <= 20; i++) {
      const deg = -i * 2.5;
      nose = rotateAboutCenter(NOSE_POS.x, NOSE_POS.y, deg);
      tail = rotateAboutCenter(TAIL_POS.x, TAIL_POS.y, deg);
      d.drive({ nose, tail });
    }
    d.drive({ nose, tail: null });
    d.drive({ nose, tail: null });
    d.drive({ nose, tail });

    let boardslideSteps = 0;
    let balanceInBand = true;
    let rodeOnLedge = false;
    for (let i = 0; i < 110; i++) {
      d.drive({ nose, tail });
      const o = h.observe();
      if (o.phase === 'grind' && o.grind?.family === 'boardslide') {
        boardslideSteps += 1;
        if (Math.abs(o.grind.balance) >= 1.0) balanceInBand = false;
        if (o.board.p.y > 0.14) rodeOnLedge = true;
      }
    }

    // Rode a real boardslide for a meaningful stretch (not a 1-step latch-and-slip).
    // Rode a real boardslide for a meaningful stretch (completion timing depends
    // on ride length — the 300-step golden's semantic guard verifies the exit).
    expect(boardslideSteps).toBeGreaterThan(20);
    expect(balanceInBand).toBe(true);
    expect(rodeOnLedge).toBe(true);
    const latched = eventsOf(h, 'grindLatched');
    expect(latched.some((e) => e.family === 'boardslide')).toBe(true);
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
