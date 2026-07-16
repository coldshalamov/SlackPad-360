/**
 * Sprint 02 S1.5 — playability probes (reviews/03 §Stage 0.4).
 *
 * Task-level bot scripts on PadDriver that measure whether the game is
 * NAVIGABLE, the layer unit tests structurally cannot see. Policies are
 * mapping-agnostic (closed-loop, incremental pad adjustments, wrist-range
 * clamped, re-grips slower than motionTapMaxLiftMs) so the same bots are fair
 * to the shipped absolute steering AND the S2 relative steering.
 *
 * Note on "pop over test-obstacle": that level's wall is 6 m tall by design
 * (interrupt tests) — nothing can ollie it. The probe instead measures
 * clearance over a VIRTUAL 0.25 m curb on flat-dev: pure measurement, no
 * gameplay/level code touched.
 */

import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { lastEventOf, scriptOllie, settled } from '../helpers/maneuver';
import { pairAt, popBattery, yawRad } from './scenarios';

const HZ = DEFAULT_SIM_CONFIG.physics.hz;
/** Comfortable single-grip pad rotation range, deg (reviews/03 §2.1). */
const WRIST_RANGE_DEG = 45;
/** Human-plausible pad rotation rate cap, deg/s. */
const PAD_RATE_DEG_PER_SEC = 300;

export interface ProbeResult {
  success: boolean;
  timeSec: number | null;
  detail: Record<string, unknown>;
}

function wrapDeg(a: number): number {
  let out = a;
  while (out > 180) out -= 360;
  while (out <= -180) out += 360;
  return out;
}

// ---------------------------------------------------------------------------
// nav.rideStraight — ride 20 m without wandering
// ---------------------------------------------------------------------------

export async function probeRideStraight(seed: number): Promise<ProbeResult> {
  const d = await settled(seed);
  for (let i = 0; i < 30; i++) d.drive({ ...pairAt(0), auxiliary: false });
  const start = d.harness.observe().board.p;
  let maxLateralDevM = 0;
  const maxSteps = 12 * HZ;
  let steps = 0;
  let travelled = 0;
  while (steps < maxSteps) {
    d.drive({ ...pairAt(0), auxiliary: true });
    steps += 1;
    const p = d.harness.observe().board.p;
    travelled = p.z - start.z;
    maxLateralDevM = Math.max(maxLateralDevM, Math.abs(p.x - start.x));
    if (travelled >= 20) break;
  }
  const reached = travelled >= 20;
  return {
    success: reached && maxLateralDevM < 1.5,
    timeSec: reached ? Math.round((steps / HZ) * 1000) / 1000 : null,
    detail: {
      travelledM: Math.round(travelled * 1000) / 1000,
      maxLateralDevM: Math.round(maxLateralDevM * 1000) / 1000,
    },
  };
}

// ---------------------------------------------------------------------------
// nav.slalom — 5 gates, ±2 m offsets, 8 m apart (closed-loop steering bot)
// ---------------------------------------------------------------------------

export async function probeSlalom(seed: number): Promise<ProbeResult> {
  const d = await settled(seed);
  for (let i = 0; i < 30; i++) d.drive({ ...pairAt(0), auxiliary: false });
  const start = d.harness.observe().board.p;
  const gates = [1, 2, 3, 4, 5].map((i) => ({
    z: start.z + 8 * i,
    x: start.x + (i % 2 === 1 ? 2 : -2),
    passed: false,
    errM: null as number | null,
  }));

  let padAngleDeg = 0;
  const maxPadStep = PAD_RATE_DEG_PER_SEC / HZ;
  let prevZ = start.z;
  const maxSteps = 25 * HZ;
  let steps = 0;
  let lastGateStep: number | null = null;

  while (steps < maxSteps) {
    const obs = d.harness.observe();
    const p = obs.board.p;
    const next = gates.find((g) => g.errM == null);
    if (!next) break;

    // Closed-loop: steer the CURRENT heading toward the next gate centre by
    // incremental pad rotation (mapping-agnostic), wrist-clamped.
    const desiredHeadingDeg = (Math.atan2(next.x - p.x, next.z - p.z) * 180) / Math.PI;
    const headingDeg = (yawRad(obs.board.q) * 180) / Math.PI;
    const errDeg = wrapDeg(desiredHeadingDeg - headingDeg);
    const step = Math.max(-maxPadStep, Math.min(maxPadStep, -errDeg * 0.9));
    padAngleDeg = Math.max(-WRIST_RANGE_DEG, Math.min(WRIST_RANGE_DEG, padAngleDeg + step));
    d.drive({ ...pairAt((padAngleDeg * Math.PI) / 180), auxiliary: true });
    steps += 1;

    const now = d.harness.observe().board.p;
    if (prevZ < next.z && now.z >= next.z) {
      next.errM = Math.round(Math.abs(now.x - next.x) * 1000) / 1000;
      next.passed = next.errM <= 1.0;
      lastGateStep = steps;
    }
    prevZ = now.z;
  }

  const crossed = gates.filter((g) => g.errM != null).length;
  const passed = gates.filter((g) => g.passed).length;
  return {
    success: passed === gates.length,
    timeSec: lastGateStep != null && crossed === gates.length
      ? Math.round((lastGateStep / HZ) * 1000) / 1000
      : null,
    detail: {
      gatesPassed: passed,
      gatesCrossed: crossed,
      gateErrorsM: gates.map((g) => g.errM),
    },
  };
}

// ---------------------------------------------------------------------------
// nav.pivot90 — standstill 90° via two wrist-range grips within 1.5 s
// ---------------------------------------------------------------------------

export async function probePivot90(seed: number): Promise<ProbeResult> {
  const d = await settled(seed);
  for (let i = 0; i < 30; i++) d.drive({ ...pairAt(0), auxiliary: false });
  const y0 = yawRad(d.harness.observe().board.q);
  let unwrapped = 0;
  let prev = y0;
  const track = (): void => {
    const y = yawRad(d.harness.observe().board.q);
    let dy = y - prev;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy <= -Math.PI) dy += Math.PI * 2;
    unwrapped += dy;
    prev = y;
  };

  const budgetSteps = Math.round(1.5 * HZ);
  let steps = 0;
  let successStep: number | null = null;
  const rotSteps = Math.ceil(45 / (200 / HZ));
  const doStep = (drive: () => void): void => {
    if (steps >= budgetSteps) return;
    drive();
    steps += 1;
    track();
    if (successStep == null && Math.abs((unwrapped * 180) / Math.PI) >= 90) successStep = steps;
  };

  for (let grip = 0; grip < 2; grip++) {
    for (let k = 0; k < rotSteps; k++) {
      const a = Math.min(45, (200 / HZ) * (k + 1));
      doStep(() => d.drive(pairAt((a * Math.PI) / 180)));
    }
    for (let i = 0; i < 3; i++) doStep(() => d.drive(pairAt((45 * Math.PI) / 180)));
    if (grip === 0) {
      // Re-grip slower than motionTapMaxLiftMs so it can never read as a pop.
      for (let i = 0; i < 20; i++) doStep(() => d.drive({ nose: null, tail: null }));
      for (let i = 0; i < 6; i++) doStep(() => d.drive(pairAt(0)));
    }
  }
  while (steps < budgetSteps) doStep(() => d.drive(pairAt((45 * Math.PI) / 180)));

  const achievedDeg = Math.round(Math.abs((unwrapped * 180) / Math.PI) * 1000) / 1000;
  return {
    success: successStep != null,
    timeSec: successStep != null ? Math.round((successStep / HZ) * 1000) / 1000 : null,
    detail: { achievedDeg, commandedDeg: 90 },
  };
}

// ---------------------------------------------------------------------------
// nav.ollieBattery — 10/10 pops land without bail
// ---------------------------------------------------------------------------

export async function probeOllieBattery(seedBase: number): Promise<ProbeResult> {
  const runs = await popBattery('ollie', 10, seedBase);
  const landed = runs.filter((r) => r.outcome === 'clean' || r.outcome === 'dirty').length;
  return {
    success: landed === runs.length,
    timeSec: null,
    detail: {
      landed,
      total: runs.length,
      outcomes: runs.map((r) => r.outcome),
    },
  };
}

// ---------------------------------------------------------------------------
// nav.popOverObstacle — clear a virtual 0.25 m curb from cruise
// ---------------------------------------------------------------------------

export async function probePopOverObstacle(seed: number): Promise<ProbeResult> {
  const CURB_HEIGHT_M = 0.25;
  const CURB_HALF_DEPTH_M = 0.2;
  const d = await settled(seed);
  for (let i = 0; i < 30; i++) d.drive({ ...pairAt(0), auxiliary: false });
  const start = d.harness.observe().board.p;
  const restY = start.y;
  const curbZ = start.z + 10;

  // Approach at cruise; pop when the remaining distance matches the time the
  // flight needs to reach the curb near apex (lead ≈ speed × 0.45 s).
  let popped = false;
  let steps = 0;
  const maxSteps = 12 * HZ;
  while (!popped && steps < maxSteps) {
    const obs = d.harness.observe();
    const speed = Math.hypot(obs.board.lv.x, obs.board.lv.z);
    const remaining = curbZ - obs.board.p.z;
    if (speed > 1 && remaining <= speed * 0.45) {
      scriptOllie(d);
      steps += 3; // scriptOllie drove 3 frames
      popped = true;
      break;
    }
    d.drive({ ...pairAt(0), auxiliary: true });
    steps += 1;
  }

  let minLiftCrossingM: number | null = null;
  let crossed = false;
  let resolved = false;
  let outcome: string = 'none';
  for (let i = 0; i < 240 && popped; i++) {
    const obs = d.harness.observe();
    const p = obs.board.p;
    if (Math.abs(p.z - curbZ) <= CURB_HALF_DEPTH_M) {
      crossed = true;
      const lift = p.y - restY;
      minLiftCrossingM = minLiftCrossingM == null ? lift : Math.min(minLiftCrossingM, lift);
    }
    const done = lastEventOf(d.harness, 'trickCompleted') ?? lastEventOf(d.harness, 'bail');
    if (done && (obs.phase === 'ground' || obs.phase === 'bail') && p.z > curbZ + CURB_HALF_DEPTH_M) {
      resolved = true;
      const trick = lastEventOf(d.harness, 'trickCompleted');
      const bail = lastEventOf(d.harness, 'bail');
      const trickStep = trick ? (trick.step as number) : -1;
      const bailStep = bail ? (bail.step as number) : -1;
      outcome = bailStep > trickStep ? 'bail' : trick ? (trick.cleanliness as string) : 'none';
      break;
    }
    d.drive({ nose: pairAt(0).nose, tail: pairAt(0).tail });
    steps += 1;
  }

  const cleared = crossed && minLiftCrossingM != null && minLiftCrossingM >= CURB_HEIGHT_M;
  return {
    success: popped && cleared && resolved && outcome !== 'bail' && outcome !== 'none',
    timeSec: null,
    detail: {
      popped,
      crossedCurbWindow: crossed,
      minLiftCrossingM: minLiftCrossingM == null ? null : Math.round(minLiftCrossingM * 1000) / 1000,
      curbHeightM: CURB_HEIGHT_M,
      outcome,
    },
  };
}

export interface NavProbes {
  rideStraight: ProbeResult;
  slalom: ProbeResult;
  pivot90: ProbeResult;
  ollieBattery: ProbeResult;
  popOverObstacle: ProbeResult;
}

export async function runNavProbes(): Promise<NavProbes> {
  return {
    rideStraight: await probeRideStraight(0xa71de),
    slalom: await probeSlalom(0x51a10),
    pivot90: await probePivot90(0x91707),
    ollieBattery: await probeOllieBattery(0x0111e + 100),
    popOverObstacle: await probePopOverObstacle(0x9095),
  };
}
