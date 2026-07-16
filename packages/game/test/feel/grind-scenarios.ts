/**
 * Sprint 03 T0 — grind scenario scripts (grind fairness instruments).
 *
 * Everything drives the REAL pipeline via PadDriver injection on grind-lab.
 * The envelope bot is deliberately player-shaped: closed-loop finger steering
 * (wrist-range, incremental), bang-bang Ctrl for speed, one pop, then hold.
 */

import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import {
  NOSE_POS,
  TAIL_POS,
  eventsOf,
  scriptOllie,
  settledProfiled,
} from '../helpers/maneuver';
import type { PadDriver } from '../helpers/maneuver';
import { pairAt, yawRad } from './scenarios';

const HZ = DEFAULT_SIM_CONFIG.physics.hz;
/** Where the angled approach line crosses the grind-lab ledge (cx=0). */
const CROSS_Z = 8.6;
/** grind-lab LEDGE geometry (see levels/grind-lab.ts): front face + half width. */
const LEDGE_Z0 = 7.0;
const LEDGE_HALF_W = 0.15;

function wrapDeg(a: number): number {
  let out = a;
  while (out > 180) out -= 360;
  while (out <= -180) out += 360;
  return out;
}

/**
 * One closed-loop steering + cruise step toward an aim point: incremental pad
 * rotation (≤300°/s, ±45° wrist clamp), auxiliary held while below the target
 * speed (bang-bang cruise control).
 */
function driveToward(
  d: PadDriver,
  state: { padAngleDeg: number },
  aim: { x: number; z: number },
  targetSpeed: number,
): void {
  const obs = d.harness.observe();
  const p = obs.board.p;
  const desiredHeadingDeg = (Math.atan2(aim.x - p.x, aim.z - p.z) * 180) / Math.PI;
  const headingDeg = (yawRad(obs.board.q) * 180) / Math.PI;
  const errDeg = wrapDeg(desiredHeadingDeg - headingDeg);
  const maxStep = 300 / HZ;
  const step = Math.max(-maxStep, Math.min(maxStep, -errDeg * 0.9));
  state.padAngleDeg = Math.max(-45, Math.min(45, state.padAngleDeg + step));
  const speed = Math.hypot(obs.board.lv.x, obs.board.lv.z);
  d.drive({
    ...pairAt((state.padAngleDeg * Math.PI) / 180),
    auxiliary: speed < targetSpeed,
  });
}

export interface EnvelopeCellResult {
  approachAngleDeg: number;
  targetSpeedMps: number;
  /** Speed measured at the pop step. */
  popSpeedMps: number | null;
  latched: boolean;
  family: string | null;
  popped: boolean;
}

/**
 * One envelope cell: approach the ledge line at `angleDeg` (0 = parallel to
 * the rail axis... i.e. straight down the line) and `targetSpeed`, pop just
 * before the crossing, report whether a grind latched within the window.
 */
export async function envelopeCell(
  angleDeg: number,
  targetSpeed: number,
  seed: number,
  assistLevel: 0 | 1 | 2 = 1,
): Promise<EnvelopeCellResult> {
  const d = await settledProfiled(seed, { levelId: 'grind-lab', assistLevel });
  const h = d.harness;
  const a = (angleDeg * Math.PI) / 180;
  // Waypoint 4 m before the crossing along the approach direction.
  const w1 = { x: -Math.sin(a) * 4, z: CROSS_Z - Math.cos(a) * 4 };
  const cross = { x: 0, z: CROSS_Z };
  const state = { padAngleDeg: 0 };

  let popped = false;
  let popSpeedMps: number | null = null;
  let steps = 0;
  const maxSteps = 20 * HZ;
  while (!popped && steps < maxSteps) {
    const obs = h.observe();
    const p = obs.board.p;
    const aim = p.z < w1.z - 0.4 ? w1 : cross;
    const speed = Math.hypot(obs.board.lv.x, obs.board.lv.z);
    // The pop must lead the point where the approach line ENTERS the ledge
    // footprint: the front face (z0) head-on, the side line (|x| = halfW)
    // when angled. Lead calibrated to the proven straight recipe (pop at
    // z 5.15 for the z0=7 face at ~3.5 m/s ⇒ v×0.55).
    const tanA = Math.tan(a);
    const entryZ =
      Math.abs(tanA) < 1e-3
        ? LEDGE_Z0
        : Math.max(LEDGE_Z0, CROSS_Z - LEDGE_HALF_W / Math.abs(tanA));
    const entry = { x: (entryZ - CROSS_Z) * tanA, z: entryZ };
    const remaining = Math.hypot(entry.x - p.x, entry.z - p.z);
    if (aim === cross && speed > 1 && remaining <= Math.max(1.2, speed * 0.55)) {
      popSpeedMps = Math.round(speed * 100) / 100;
      scriptOllie(d, {});
      popped = true;
      break;
    }
    driveToward(d, state, aim, targetSpeed);
    steps += 1;
  }

  let latched = false;
  let family: string | null = null;
  for (let i = 0; i < 70 && popped; i++) {
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    const ev = eventsOf(h, 'grindLatched')[0];
    if (ev) {
      latched = true;
      family = (ev.family as string) ?? null;
      break;
    }
  }
  return {
    approachAngleDeg: angleDeg,
    targetSpeedMps: targetSpeed,
    popSpeedMps,
    latched,
    family,
    popped,
  };
}

export interface EnvelopeMapResult {
  angles: number[];
  speeds: number[];
  /** cells[speedIndex][angleIndex] */
  cells: EnvelopeCellResult[][];
}

export async function envelopeMap(assistLevel: 0 | 1 | 2 = 1): Promise<EnvelopeMapResult> {
  const angles = [-30, -20, -10, 0, 10, 20, 30];
  const speeds = [2, 2.75, 3.5, 4.25, 5];
  const cells: EnvelopeCellResult[][] = [];
  for (const [si, speed] of speeds.entries()) {
    const row: EnvelopeCellResult[] = [];
    for (const [ai, angle] of angles.entries()) {
      row.push(await envelopeCell(angle, speed, 0x9e0000 + si * 16 + ai, assistLevel));
    }
    cells.push(row);
  }
  return { angles, speeds, cells };
}

// ---------------------------------------------------------------------------
// Hold + recovery probes (the straight fifty recipe from grind-integration)
// ---------------------------------------------------------------------------

async function latchFifty(seed: number, assistLevel: 0 | 1 | 2): Promise<PadDriver | null> {
  const d = await settledProfiled(seed, { levelId: 'grind-lab', assistLevel });
  const h = d.harness;
  // cruiseUntilZ(5.15) equivalent without importing the throwing helper.
  let guard = 0;
  while (h.observe().board.p.z < 5.15 && guard++ < 600) d.cruise(1);
  scriptOllie(d, {});
  for (let i = 0; i < 60; i++) {
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    if (eventsOf(h, 'grindLatched').length > 0) return d;
  }
  return null;
}

export interface HoldResultGrind {
  latched: boolean;
  holdSeconds: number | null;
  exitReason: string | null;
}

/** Neutral-input balance hold: fingers planted at rest until the grind ends. */
export async function grindHoldProbe(seed: number, assistLevel: 0 | 1 | 2 = 1): Promise<HoldResultGrind> {
  const d = await latchFifty(seed, assistLevel);
  if (!d) return { latched: false, holdSeconds: null, exitReason: null };
  const h = d.harness;
  for (let i = 0; i < 10 * HZ; i++) {
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    if (eventsOf(h, 'grindExit').length > 0) break;
  }
  const exit = eventsOf(h, 'grindExit')[0] ?? null;
  const completed = eventsOf(h, 'grindCompleted')[0] ?? null;
  return {
    latched: true,
    holdSeconds: completed
      ? Math.round(((completed.durationSteps as number) / HZ) * 100) / 100
      : Math.round((10 * HZ / HZ) * 100) / 100,
    exitReason: exit ? ((exit.reason as string) ?? null) : 'still-grinding-at-cap',
  };
}

export interface RecoveryResult {
  latched: boolean;
  slipped: boolean;
  /** No re-latch fired inside the cooldown window after the slip. */
  cooldownRespected: boolean;
  /** Board reached ground and rode ≥ 1 s with no bail after the slip. */
  recovered: boolean;
  exitReason: string | null;
}

/**
 * Anti-death-loop probe: force a slip by holding a hard lateral finger bias,
 * then go neutral and verify the cooldown + a recoverable ride-away.
 */
export async function grindRecoveryProbe(
  seed: number,
  assistLevel: 0 | 1 | 2 = 1,
): Promise<RecoveryResult> {
  const d = await latchFifty(seed, assistLevel);
  if (!d) {
    return { latched: false, slipped: false, cooldownRespected: false, recovered: false, exitReason: null };
  }
  const h = d.harness;
  // Hard lateral bias: both fingers shifted +x (midpoint offset drives the
  // balance the wrong way through the real input path).
  let exitStep: number | null = null;
  for (let i = 0; i < 6 * HZ; i++) {
    d.drive({
      nose: { x: Math.min(0.98, NOSE_POS.x + 0.14), y: NOSE_POS.y },
      tail: { x: Math.min(0.98, TAIL_POS.x + 0.14), y: TAIL_POS.y },
    });
    const exit = eventsOf(h, 'grindExit')[0];
    if (exit) {
      exitStep = exit.step as number;
      break;
    }
  }
  const exit = eventsOf(h, 'grindExit')[0] ?? null;
  const exitReason = exit ? ((exit.reason as string) ?? null) : null;
  if (exitStep == null) {
    return { latched: true, slipped: false, cooldownRespected: false, recovered: false, exitReason };
  }

  // Neutral after the slip; watch the cooldown window + the ride-away.
  const cooldown = Math.max(1, Math.floor(DEFAULT_SIM_CONFIG.grind.relatchCooldownSteps));
  let cooldownRespected = true;
  let groundStreak = 0;
  let recovered = false;
  const latchCountAtExit = eventsOf(h, 'grindLatched').length;
  for (let i = 0; i < 6 * HZ; i++) {
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    const o = h.observe();
    const step = o.step;
    if (
      step <= exitStep + cooldown &&
      eventsOf(h, 'grindLatched').length > latchCountAtExit
    ) {
      cooldownRespected = false;
    }
    if (o.phase === 'ground') groundStreak += 1;
    else if (o.phase === 'bail') groundStreak = 0;
    if (groundStreak >= HZ) {
      recovered = true;
      break;
    }
  }
  return {
    latched: true,
    slipped: exitReason === 'balance-fail',
    cooldownRespected,
    recovered,
    exitReason,
  };
}
