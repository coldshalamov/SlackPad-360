/**
 * T1 perceptual contracts — the grind loop's fairness edges (Sprint 03).
 *
 * Complements the existing suites (grind-detection owns latch geometry and
 * envelope rejection; grind-conflict owns phase exclusivity; quantize-assist
 * owns L0-never-snaps; gt-catch owns apex timing). Pinned here:
 *   1. the ollie-out HOP reuses the ordinary pop path (pipeline),
 *   2. rolling on the floor beside the ledge never latches (pipeline),
 *   3. every exit suppresses re-latching for EXACTLY relatchCooldownSteps
 *      (unit, via the shared grind fixtures).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { GrindSystem } from '../../src/control/GrindSystem';
import { Telemetry } from '../../src/telemetry/Telemetry';
import { makeInputs, makePose, RIDE_Y_FIFTY } from '../helpers/grind';
import { NOSE_POS, TAIL_POS, eventsOf, scriptOllie, settledProfiled } from '../helpers/maneuver';
import { pairAt } from '../feel/scenarios';

const G = DEFAULT_SIM_CONFIG.grind;

describe('contract: grind loop edges', () => {
  it('the mid-grind hop reuses the ordinary pop path and exits with reason hop', async () => {
    // Real pipeline: latch a fifty, then perform a motionTap retap while
    // grinding. The KickArbiter must route it as a pop (popRecognized), the
    // grind must exit as 'hop', and the board must get airborne — one pop
    // vocabulary everywhere, no special grind-exit gesture.
    const d = await settledProfiled(12345, { levelId: 'grind-lab', assistLevel: 1 });
    const h = d.harness;
    let guard = 0;
    while (h.observe().board.p.z < 5.15 && guard++ < 600) d.cruise(1);
    scriptOllie(d, {});
    let latched = false;
    for (let i = 0; i < 60 && !latched; i++) {
      d.drive({ nose: NOSE_POS, tail: TAIL_POS });
      latched = eventsOf(h, 'grindLatched').length > 0;
    }
    expect(latched).toBe(true);
    const popsBefore = eventsOf(h, 'popRecognized').length;

    // Ride the grind a few steps, then lift-retap the tail (the motionTap).
    for (let i = 0; i < 6; i++) d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    d.drive({ nose: NOSE_POS, tail: null });
    d.drive({ nose: NOSE_POS, tail: null });
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    let sawAir = false;
    for (let i = 0; i < 40; i++) {
      d.drive({ nose: NOSE_POS, tail: TAIL_POS });
      if (h.observe().phase === 'air' || h.observe().phase === 'catch') sawAir = true;
    }

    expect(eventsOf(h, 'popRecognized').length).toBeGreaterThan(popsBefore);
    const exits = eventsOf(h, 'grindExit');
    expect(exits.length).toBeGreaterThanOrEqual(1);
    expect(exits[0]!.reason).toBe('hop');
    expect(sawAir).toBe(true);
  });

  it('rolling on the floor beside the ledge never latches a grind', async () => {
    // Ride parallel to the grind-lab ledge on the FLOOR, laterally close (just
    // outside the footprint) at valid grind speed: proximity alone must never
    // grind — a latch may only open from the airborne/recent-pop window.
    const d = await settledProfiled(0x9e77, { levelId: 'grind-lab', assistLevel: 2 });
    const h = d.harness;
    // Steer a gentle dogleg to x ≈ +0.4 (beside the ledge, halfWidth 0.15),
    // then ride straight past the whole entry region.
    for (let i = 0; i < 20; i++) d.drive({ ...pairAt(0), auxiliary: true });
    for (let k = 1; k <= 8; k++) {
      d.drive({ ...pairAt((-(12 / 8) * k * Math.PI) / 180), auxiliary: true });
    }
    for (let i = 0; i < 40; i++) d.drive({ ...pairAt((-12 * Math.PI) / 180), auxiliary: true });
    for (let k = 8; k >= 0; k--) {
      d.drive({ ...pairAt((-(12 / 8) * k * Math.PI) / 180), auxiliary: true });
    }
    let sawGrindPhase = false;
    for (let i = 0; i < 300; i++) {
      d.drive({ ...pairAt(0), auxiliary: true });
      const o = h.observe();
      if (o.phase === 'grind') sawGrindPhase = true;
      if (o.board.p.z > 20) break;
    }
    expect(h.observe().board.p.z).toBeGreaterThan(12); // really rode past the entry span
    expect(eventsOf(h, 'grindLatched').length).toBe(0);
    expect(sawGrindPhase).toBe(false);
  });

  it('every exit suppresses re-latching for exactly relatchCooldownSteps', () => {
    // Unit-level (shared grind fixtures): latch, force a hop exit, then feed
    // PERFECT latch conditions every step — nothing may latch inside the
    // cooldown, and the very first step after it must latch again.
    const tel = new Telemetry();
    const grind = new GrindSystem(DEFAULT_SIM_CONFIG, 1, tel);
    grind.update(makeInputs({ pose: makePose({ vz: 3 }), step: 0 }));
    const exit = grind.update(
      makeInputs({ pose: makePose({ vz: 3 }), step: 1, hopRequested: true }),
    );
    expect(exit.exit).toBe('hop');
    // Convention pinned from the implementation: exit at step E suppresses
    // steps (E, E+cooldown) and the latch resumes AT step E+cooldown.
    const cooldown = Math.max(1, Math.floor(G.relatchCooldownSteps));
    for (let s = 2; s < 1 + cooldown; s++) {
      const r = grind.update(
        makeInputs({ pose: makePose({ y: RIDE_Y_FIFTY, vz: 3 }), step: s }),
      );
      expect(r.active, `no re-latch inside the cooldown (step ${s})`).toBe(false);
    }
    const after = grind.update(
      makeInputs({ pose: makePose({ y: RIDE_Y_FIFTY, vz: 3 }), step: 1 + cooldown }),
    );
    expect(after.active, 'latch conditions resume the moment the cooldown ends').toBe(true);
  });
});
