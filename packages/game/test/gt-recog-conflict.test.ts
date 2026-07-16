/**
 * GT-recog-conflict (M5) — the recognition conflict table (final-input-and-
 * trick-spec §3.1) as a truth table:
 *  - flick vs steer: a fast lateral foot path on the GROUND never opens a flip
 *    (the classifier only runs airborne — flick ignored on ground);
 *  - shuv vs flip: lateral-dominant free-foot motion → flip (not shuv); an
 *    arc/yaw-dominant path → shuv (not flip); an ambiguous diagonal is decided
 *    by the dominant threshold-normalized axis;
 *  - hysteresis: a stream that crosses the flip↔shuv boundary replaces the open
 *    label at most once, and only when the challenger clears replaceMargin.
 *
 * The classifier is unit-tested directly (deterministic synthetic pad
 * velocities) for the axis/hysteresis rules, and the ground-vs-air gate is
 * checked through the full harness.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { AirGestureClassifier } from '../src/control/AirGestureClassifier';
import type { AirGestureInputs } from '../src/control/AirGestureClassifier';
import { eventsOf, NOSE_POS, scriptOllie, settled, TAIL_POS } from './helpers/maneuver';

const DT = 1 / DEFAULT_SIM_CONFIG.physics.hz;

/** Feed a per-step velocity stream (tail foot planted) into the classifier. */
function feed(
  c: AirGestureClassifier,
  vels: Array<{ x: number; y: number }>,
  startStep = 1,
): ReturnType<AirGestureClassifier['update']> {
  let out: ReturnType<AirGestureClassifier['update']> = null;
  for (let i = 0; i < vels.length; i++) {
    const inp: AirGestureInputs = {
      step: startStep + i,
      dt: DT,
      nose: { planted: false, vel: { x: 0, y: 0 } },
      tail: { planted: true, vel: vels[i]! },
    };
    out = c.update(inp);
  }
  return out;
}

/** N steps of a constant velocity. */
function hold(v: { x: number; y: number }, n: number): Array<{ x: number; y: number }> {
  return Array.from({ length: n }, () => ({ ...v }));
}

/** An arc whose velocity direction turns (for sweep evidence), speed ~`sp`. */
function arc(
  sp: number,
  turnRad: number,
  n: number,
  sign: number,
  base = 0,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = base + sign * turnRad * (i / (n - 1));
    out.push({ x: sp * Math.cos(a), y: sp * Math.sin(a) });
  }
  return out;
}

describe('GT-recog-conflict: recognition conflict table', () => {
  it('lateral-dominant free-foot motion → FLIP (not shuv)', () => {
    const c = new AirGestureClassifier(DEFAULT_SIM_CONFIG, 'regular');
    const g = feed(c, hold({ x: 0, y: 4 }, 5)); // pure pad-down = heelside lateral
    expect(g).not.toBeNull();
    expect(g!.kind).toBe('flip');
    expect(g!.label).toBe('kickflip'); // vLat>0 heelside
  });

  it('toeside lateral → heelflip (opposite flip sign)', () => {
    const c = new AirGestureClassifier(DEFAULT_SIM_CONFIG, 'regular');
    const g = feed(c, hold({ x: 0, y: -4 }, 5));
    expect(g!.kind).toBe('flip');
    expect(g!.label).toBe('heelflip');
    expect(Math.sign(g!.omegaTarget)).toBe(-1);
  });

  it('arc/yaw-dominant free-foot motion → SHUV (not flip)', () => {
    const c = new AirGestureClassifier(DEFAULT_SIM_CONFIG, 'regular');
    // A curved path: modest speed, large direction turn → arcN dominates flickN.
    const g = feed(c, arc(3, Math.PI * 0.9, 7, 1));
    expect(g).not.toBeNull();
    expect(g!.kind).toBe('shuv');
  });

  it('ambiguous diagonal → dominant axis wins (stronger lateral → flip)', () => {
    const c = new AirGestureClassifier(DEFAULT_SIM_CONFIG, 'regular');
    // Mostly-lateral (pad-y) path with a slight curl: lateral dominates, and the
    // small turn (0.5 rad) stays under the sweep threshold → flip wins.
    const g = feed(c, arc(6, 0.5, 6, 1, Math.PI / 2));
    expect(g).not.toBeNull();
    expect(g!.kind).toBe('flip');
  });

  it('a straight flick returning along the same line is not sweep curvature', () => {
    const c = new AirGestureClassifier(DEFAULT_SIM_CONFIG, 'regular');
    feed(c, hold({ x: 0, y: 1.5 }, 5)); // outbound lateral flick opens kickflip

    // Recentring reverses velocity by ~pi in one report. That is straight
    // backtracking, not the sustained direction change of a shuv arc.
    const g = feed(c, [{ x: 0, y: -1.5 }], 6);

    expect(g).not.toBeNull();
    expect(g!.kind).toBe('flip');
    expect(g!.label).toBe('kickflip');
    expect(c.replacements).toBe(0);
  });

  it('hysteresis: a weak arc after a flick does NOT replace (margin gate)', () => {
    const c = new AirGestureClassifier(DEFAULT_SIM_CONFIG, 'regular');
    feed(c, hold({ x: 0, y: 4 }, 5)); // strong flick opens (kickflip)
    const before = c.open;
    feed(c, arc(2.5, 1.1, 5, 1), 6); // weak arc, just over sweep threshold
    expect(c.replacements).toBe(0);
    expect(c.open!.kind).toBe('flip'); // label held (hysteresis)
    expect(before!.label).toBe('kickflip');
  });

  it('hysteresis: crossing the boundary replaces AT MOST once', () => {
    const c = new AirGestureClassifier(DEFAULT_SIM_CONFIG, 'regular');
    feed(c, hold({ x: 0, y: 3 }, 4)); // moderate flick opens
    // A long, strong arc that eventually clears the margin → one replacement.
    feed(c, arc(4, Math.PI * 1.4, 16, 1), 5);
    expect(c.replacements).toBeLessThanOrEqual(1);
    expect(c.open!.kind).toBe('shuv'); // ended on the dominant (arc) family
  });

  it('flick vs steer: a fast lateral foot path ON THE GROUND opens no flip', async () => {
    const d = await settled(0xc0f1);
    d.cruise(60);
    // While grounded, jerk the tail foot laterally fast for several steps — this
    // is steering/lean input, NOT a flick. The classifier must never run here.
    for (let i = 1; i <= 8; i++) {
      d.drive({ nose: NOSE_POS, tail: { x: TAIL_POS.x, y: Math.min(0.95, TAIL_POS.y + 0.09 * i) } });
    }
    const h = d.harness;
    expect(h.observe().phase).toBe('ground');
    expect(eventsOf(h, 'flipRecognized').length).toBe(0);
    expect(eventsOf(h, 'shuvRecognized').length).toBe(0);
    expect(h.observe().label).toBeNull();
  });

  it('a flick recognized in the air DOES open (control for the ground case)', async () => {
    const d = await settled(0xc0f2);
    d.cruise(90);
    scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
    const h = d.harness;
    // Flick the tail laterally once airborne.
    let air = false;
    for (let i = 0; i < 30 && !air; i++) {
      if (h.observe().phase === 'air') air = true;
      else d.drive({ tail: TAIL_POS });
    }
    for (let i = 1; i <= 6; i++) {
      d.drive({ tail: { x: TAIL_POS.x, y: Math.min(0.95, TAIL_POS.y + 0.11 * i) } });
    }
    expect(eventsOf(h, 'flipRecognized').length).toBeGreaterThan(0);
  });
});
