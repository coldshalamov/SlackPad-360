/**
 * GrindSystem detection / latch / envelope / candidate / balance (M6).
 *
 * Drives GrindSystem.update() directly with synthetic plain-data inputs — the
 * SAME method the harness runs each step — so the fairness mandate is enforced
 * precisely and deterministically:
 *   1. SOFT SNAP, NO TELEPORT  → latch requires geometric contact in BOTH axes.
 *   2. VISIBLE SNAP            → candidate + telemetry BEFORE latch.
 *   3. FORGIVING BALANCE       → survive band, counter-lean recovers, no death loop.
 *   4. ENVELOPE REJECTION      → wrong speed/angle → grindRejected, never latch.
 *   5. (phase-exclusive is covered in grind-conflict.test.ts.)
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { GrindSystem } from '../src/control/GrindSystem';
import { Telemetry } from '../src/telemetry/Telemetry';
import {
  makeInputs,
  makePose,
  makeFeet,
  RIDE_Y_FIFTY,
  RIDE_Y_BOARDSLIDE,
} from './helpers/grind';

const G = DEFAULT_SIM_CONFIG.grind;

function sys(assist: 0 | 1 | 2 = 1): { grind: GrindSystem; tel: Telemetry } {
  const tel = new Telemetry();
  return { grind: new GrindSystem(DEFAULT_SIM_CONFIG, assist, tel), tel };
}

describe('gt-grind-fifty (50-50 latch)', () => {
  it('parallel approach, trucks-down, in the speed window → 50-50 latch', () => {
    const { grind, tel } = sys(1);
    const r = grind.update(
      makeInputs({ pose: makePose({ x: 0, y: RIDE_Y_FIFTY, z: 0, yawDeg: 0, vz: 3 }), step: 10 }),
    );
    expect(r.active).toBe(true);
    expect(r.latchedThisStep).toBe(true);
    expect(r.family).toBe('fifty-fifty');
    expect(r.rejected).toBeNull();
    // Latch command data present + tangent ≈ +Z (the rail direction).
    expect(r.axis).not.toBeNull();
    expect(r.axis!.z).toBeGreaterThan(0.99);
    expect(Number.isFinite(r.balance)).toBe(true);
    expect(tel.count('grindLatched')).toBe(1);
    // Snapshot shape matches ObserveState.grind.
    const snap = grind.snapshot();
    expect(snap).toEqual({ active: true, family: 'fifty-fifty', balance: r.balance, candidate: true });
  });
});

describe('gt-boardslide-entry (boardslide latch)', () => {
  it('board yaw ~90° to rail, deck toward rail, sliding along → boardslide latch', () => {
    const { grind } = sys(1);
    // Board faces +X (yaw 90°) while moving +Z along the rail → perpendicular.
    const r = grind.update(
      makeInputs({ pose: makePose({ x: 0, y: RIDE_Y_BOARDSLIDE, z: 0, yawDeg: 90, vz: 3 }), step: 10 }),
    );
    expect(r.active).toBe(true);
    expect(r.family).toBe('boardslide');
  });
});

describe('grind-envelope (explicit rejection, never silent snap)', () => {
  it('too slow → grindRejected, NO latch', () => {
    const { grind, tel } = sys(1);
    const r = grind.update(makeInputs({ pose: makePose({ vz: 0.3 }), step: 5 }));
    expect(r.active).toBe(false);
    expect(r.rejected).toBe('too-slow');
    expect(tel.count('grindLatched')).toBe(0);
    expect(tel.count('grindRejected')).toBe(1);
  });

  it('too fast → grindRejected, NO latch', () => {
    const { grind } = sys(1);
    const r = grind.update(makeInputs({ pose: makePose({ vz: 12 }), step: 5 }));
    expect(r.active).toBe(false);
    expect(r.rejected).toBe('too-fast');
  });

  it('bad approach angle (45° — neither family) → grindRejected, NO latch', () => {
    const { grind } = sys(1);
    const r = grind.update(makeInputs({ pose: makePose({ yawDeg: 45, vz: 3 }), step: 5 }));
    expect(r.active).toBe(false);
    expect(r.rejected).toBe('bad-angle');
    expect(r.candidate).toBe(false);
  });
});

describe('grind-candidate (visible snap BEFORE latch)', () => {
  it('candidate + telemetry fire strictly before the latch', () => {
    const { grind, tel } = sys(1);
    // Step 1: plausible approach but ABOVE the rail (no vertical contact yet).
    const r1 = grind.update(makeInputs({ pose: makePose({ y: 0.55, vz: 3 }), step: 1 }));
    expect(r1.candidate).toBe(true);
    expect(r1.active).toBe(false);
    expect(r1.family).toBe('fifty-fifty');
    // Step 2: descended onto the rail → geometric contact → latch.
    const r2 = grind.update(makeInputs({ pose: makePose({ y: RIDE_Y_FIFTY, vz: 3 }), step: 2 }));
    expect(r2.active).toBe(true);
    const events = tel.snapshot().events as Array<Record<string, unknown>>;
    const candStep = events.find((e) => e.type === 'grindCandidate')?.step as number;
    const latchStep = events.find((e) => e.type === 'grindLatched')?.step as number;
    expect(candStep).toBeLessThan(latchStep);
  });
});

describe('grind no-teleport (geometric contact required in BOTH axes)', () => {
  it('laterally too far (beyond rSnap) → candidate but NO latch', () => {
    const { grind } = sys(1);
    // x = 0.3 m off-centre: inside candidateVolumeRadius (0.6) but far beyond rSnap[1]=0.08.
    const r = grind.update(makeInputs({ pose: makePose({ x: 0.3, y: RIDE_Y_FIFTY, vz: 3 }), step: 3 }));
    expect(r.candidate).toBe(true);
    expect(r.active).toBe(false);
  });

  it('vertically too far (0.3 m above ride height) → NO latch (no vertical magnetism)', () => {
    const { grind } = sys(1);
    const r = grind.update(makeInputs({ pose: makePose({ x: 0, y: RIDE_Y_FIFTY + 0.3, vz: 3 }), step: 3 }));
    expect(r.active).toBe(false);
  });

  it('L0 uses r_snap≈0 (pure physics) and springGain 0; L2 snaps a near-miss L0 rejects', () => {
    // A 0.05 m lateral offset: beyond rSnap[0]=0.02 (L0 rejects) but inside rSnap[2]=0.14 (L2 latches).
    const off = 0.05;
    const l0 = sys(0).grind.update(makeInputs({ pose: makePose({ x: off, y: RIDE_Y_FIFTY, vz: 3 }), step: 3 }));
    expect(l0.active).toBe(false); // L0 = no snap, must be dead-on
    const l2sys = sys(2);
    const l2 = l2sys.grind.update(makeInputs({ pose: makePose({ x: off, y: RIDE_Y_FIFTY, vz: 3 }), step: 3 }));
    expect(l2.active).toBe(true);
    expect(l2.springGain).toBe(G.latchLateralSpring[2]);
    // A dead-on L0 latch has spring gain 0 (pure physics lock only).
    const l0dead = sys(0).grind.update(makeInputs({ pose: makePose({ x: 0, y: RIDE_Y_FIFTY, vz: 3 }), step: 3 }));
    expect(l0dead.active).toBe(true);
    expect(l0dead.springGain).toBe(0);
  });
});

describe('grind-balance (forgiving; counter-lean recovers; exceed → slip; no death loop)', () => {
  it('neutral play stays latched with a stable, finite, in-band balance', () => {
    const { grind } = sys(1);
    grind.update(makeInputs({ pose: makePose({ vz: 3 }), step: 0 }));
    let last = grind.update(makeInputs({ pose: makePose({ vz: 3 }), feet: makeFeet(), step: 1 }));
    for (let s = 2; s < 60; s++) {
      last = grind.update(makeInputs({ pose: makePose({ vz: 3 }), feet: makeFeet(), step: s }));
    }
    expect(last.active).toBe(true);
    expect(last.exit).toBeNull();
    expect(Math.abs(last.balance)).toBeLessThan(G.balanceLimit);
    expect(Number.isFinite(last.balance)).toBe(true);
  });

  it('a sustained hard lean drives balance past the limit → slip (balance-fail), then recoverable', () => {
    const { grind, tel } = sys(1);
    grind.update(makeInputs({ pose: makePose({ vz: 3 }), step: 0 }));
    let exitStep = -1;
    for (let s = 1; s < 200; s++) {
      const r = grind.update(makeInputs({ pose: makePose({ vz: 3 }), feet: makeFeet({ latBias: 1.0 }), step: s }));
      if (r.exit) {
        expect(r.exit).toBe('balance-fail');
        exitStep = s;
        // The slip is not a bail/death loop — GrindSystem released the latch and
        // set a re-latch cooldown; the FSM routes this to the recoverable air phase.
        expect(grind.active).toBe(false);
        break;
      }
    }
    expect(exitStep).toBeGreaterThan(0);
    expect(tel.count('grindExit')).toBe(1);
    // After the slip, an immediate re-approach is suppressed by the cooldown (anti-oscillation).
    const reattempt = grind.update(
      makeInputs({ pose: makePose({ y: RIDE_Y_FIFTY, vz: 3 }), step: exitStep + 1 }),
    );
    expect(reattempt.active).toBe(false);
  });

  it.each([
    ['hop', { hopRequested: true }],
    ['collision', { contactImpulse: G.interruptImpulse + 1 }],
  ] as const)('exits on %s', (reason, extra) => {
    const { grind } = sys(1);
    grind.update(makeInputs({ pose: makePose({ vz: 3 }), step: 0 }));
    const r = grind.update(makeInputs({ pose: makePose({ vz: 3 }), step: 1, ...extra }));
    expect(r.exit).toBe(reason);
    expect(grind.active).toBe(false);
  });

  it('exits on foot-lift when BOTH feet leave, but NOT on a single-foot lift (entry-safe)', () => {
    const { grind } = sys(1);
    grind.update(makeInputs({ pose: makePose({ vz: 3 }), step: 0 }));
    // Single foot lifted (nose up, tail down) — a flick, not a dismount → stays grinding.
    const one = grind.update(
      makeInputs({ pose: makePose({ vz: 3 }), feet: makeFeet({ nose: false, tail: true }), step: 1 }),
    );
    expect(one.exit).toBeNull();
    expect(one.active).toBe(true);
    // Both feet off → deliberate step-off dismount.
    const both = grind.update(
      makeInputs({ pose: makePose({ vz: 3 }), feet: makeFeet({ nose: false, tail: false }), step: 2 }),
    );
    expect(both.exit).toBe('foot-lift');
  });

  it('speed-ends when the along-rail speed decays below the dismount threshold', () => {
    const { grind } = sys(1);
    grind.update(makeInputs({ pose: makePose({ vz: 3 }), step: 0 }));
    const r = grind.update(makeInputs({ pose: makePose({ vz: G.speedEndSpeed - 0.1 }), step: 1 }));
    expect(r.exit).toBe('speed-end');
  });

  it('counter-lean pulls a mid-band balance back toward centre (recovers, no slip)', () => {
    const { grind } = sys(1);
    grind.update(makeInputs({ pose: makePose({ vz: 3 }), step: 0 }));
    // Lean one way for a while to build balance (but stay in the survive band).
    let r = grind.update(makeInputs({ pose: makePose({ vz: 3 }), feet: makeFeet({ latBias: 0.35 }), step: 1 }));
    for (let s = 2; s < 20; s++) {
      r = grind.update(makeInputs({ pose: makePose({ vz: 3 }), feet: makeFeet({ latBias: 0.35 }), step: s }));
    }
    expect(r.active).toBe(true);
    const leaned = Math.abs(r.balance);
    expect(leaned).toBeGreaterThan(0.05); // balance actually moved
    // Counter-lean the other way → balance magnitude drops back toward centre.
    for (let s = 20; s < 45; s++) {
      r = grind.update(makeInputs({ pose: makePose({ vz: 3 }), feet: makeFeet({ latBias: -0.35 }), step: s }));
    }
    expect(r.active).toBe(true);
    expect(Math.abs(r.balance)).toBeLessThan(leaned);
  });
});
