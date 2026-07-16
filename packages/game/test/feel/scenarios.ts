/**
 * Sprint 02 S0 — feel-report scenario scripts (reviews/03 §Stage 0.2).
 *
 * Every scenario drives the REAL input pipeline (FootTracker → KickArbiter →
 * GestureFSM → ManeuverAssist/BoardController → SimWorld) via PadDriver frame
 * injection — no pose shortcuts exist. Determinism: fixed seeds + a local LCG;
 * no wall clock, no Math.random. These scripts are measurement fixtures: they
 * record what the build DOES, they never assert what it SHOULD do (gates live
 * in scripts/feel-report.ts and are enforced only in gated mode).
 */

import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import {
  DT_MS,
  NOSE_POS,
  TAIL_POS,
  lastEventOf,
  scriptOllie,
  settled,
  flyWithGesture,
} from '../helpers/maneuver';
import type { PadDriver } from '../helpers/maneuver';
import type { FootInput } from '../helpers/maneuver';

const HZ = DEFAULT_SIM_CONFIG.physics.hz;

/** Steering scenarios rotate the two-finger line around the pad centre. */
const MID = { x: 0.5, y: 0.5 };
/** Half the rest segment length (rest contacts are (0.4,0.5)/(0.6,0.5)). */
const SEG_R = 0.1;

/** Contact pair rotated `angleRad` from the rest line (regular stance). */
export function pairAt(angleRad: number): { nose: FootInput; tail: FootInput } {
  const c = Math.cos(angleRad) * SEG_R;
  const s = Math.sin(angleRad) * SEG_R;
  return {
    nose: { x: MID.x + c, y: MID.y + s },
    tail: { x: MID.x - c, y: MID.y - s },
  };
}

/** World yaw (heading) of the board, rad — same convention as ControlDiagnostics. */
export function yawRad(q: { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
}

/**
 * Nose-up pitch, deg. forward=(0,0,1) rotated by q has world-Y component
 * 2(qy·qz − qw·qx); nose-over-tail height uses the same term (ollie-feel M4),
 * so positive = physical nose above tail.
 */
export function pitchNoseUpDeg(q: { x: number; y: number; z: number; w: number }): number {
  const s = 2 * (q.y * q.z - q.w * q.x);
  return (Math.asin(Math.max(-1, Math.min(1, s))) * 180) / Math.PI;
}

function wrapPi(a: number): number {
  let out = a;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out <= -Math.PI) out += Math.PI * 2;
  return out;
}

/** Accumulates yaw across ±π wraps so scripted multi-turn yaw reads linearly. */
class YawUnwrapper {
  private prev: number | null = null;
  private acc = 0;
  next(yaw: number): number {
    if (this.prev == null) {
      this.prev = yaw;
      this.acc = 0; // relative to first sample
      return 0;
    }
    this.acc += wrapPi(yaw - this.prev);
    this.prev = yaw;
    return this.acc;
  }
}

/** Tiny deterministic PRNG (mulberry32) for seeded scenario spread. */
export function lcg(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, options: readonly T[]): T {
  return options[Math.min(options.length - 1, Math.floor(rand() * options.length))]!;
}

// ---------------------------------------------------------------------------
// Steering scenarios
// ---------------------------------------------------------------------------

export interface SteerSample {
  step: number;
  /** Scripted pad segment rotation from rest, deg (input-side ground truth). */
  padAngleDeg: number;
  /**
   * Scripted rotation mapped through the design boundary sign (BoardController
   * negates the calibrated pad angle exactly once), deg — i.e. the WORLD yaw
   * delta the fingers are asking for.
   */
  commandedYawDeg: number;
  /** Unwrapped world yaw delta since the first sample, deg. */
  yawDeg: number;
  speedMps: number;
}

export interface SteerScenarioResult {
  samples: SteerSample[];
  /** Index into samples where the scripted rotation begins. */
  rotationStartIndex: number;
  /** Mean horizontal speed over rotation+hold, m/s. */
  meanSpeedMps: number;
}

interface SteerScriptOptions {
  /** Steps of dual-plant at angle 0 before anything else (rest capture). */
  restSteps: number;
  /** Steps of cruise (auxiliary held) after rest capture; 0 = standstill. */
  cruiseSteps: number;
  /** Steps of coast between cruise and the sampled window. */
  coastSteps: number;
  /** Sampled pre-roll steps (angle 0) before rotation starts. */
  preRollSteps: number;
  /** deg/s of scripted segment rotation. */
  rateDegPerSec: number;
  /** Total scripted rotation, deg (signed). */
  totalDeg: number;
  /** Steps to keep sampling after the target angle is reached. */
  holdSteps: number;
  /** Hold auxiliary during rotation+hold (cruiseTurn variant). */
  auxDuringWindow: boolean;
}

async function steerScript(seed: number, opts: SteerScriptOptions): Promise<SteerScenarioResult> {
  const d = await settled(seed);
  for (let i = 0; i < opts.restSteps; i++) d.drive({ ...pairAt(0), auxiliary: false });
  for (let i = 0; i < opts.cruiseSteps; i++) d.drive({ ...pairAt(0), auxiliary: true });
  for (let i = 0; i < opts.coastSteps; i++) d.drive(pairAt(0));

  const unwrap = new YawUnwrapper();
  const samples: SteerSample[] = [];
  const rotationSteps = Math.ceil(Math.abs(opts.totalDeg) / (opts.rateDegPerSec / HZ));
  const perStepDeg = (Math.sign(opts.totalDeg) * opts.rateDegPerSec) / HZ;

  const sampleAfterDrive = (padAngleDeg: number): void => {
    const obs = d.harness.observe();
    samples.push({
      step: obs.step,
      padAngleDeg,
      commandedYawDeg: -padAngleDeg,
      yawDeg: (unwrap.next(yawRad(obs.board.q)) * 180) / Math.PI,
      speedMps: Math.hypot(obs.board.lv.x, obs.board.lv.z),
    });
  };

  for (let i = 0; i < opts.preRollSteps; i++) {
    d.drive({ ...pairAt(0), auxiliary: opts.auxDuringWindow });
    sampleAfterDrive(0);
  }
  let angleDeg = 0;
  for (let k = 0; k < rotationSteps; k++) {
    angleDeg =
      Math.sign(opts.totalDeg) *
      Math.min(Math.abs(opts.totalDeg), Math.abs(perStepDeg) * (k + 1));
    d.drive({ ...pairAt((angleDeg * Math.PI) / 180), auxiliary: opts.auxDuringWindow });
    sampleAfterDrive(angleDeg);
  }
  for (let i = 0; i < opts.holdSteps; i++) {
    d.drive({ ...pairAt((angleDeg * Math.PI) / 180), auxiliary: opts.auxDuringWindow });
    sampleAfterDrive(angleDeg);
  }

  const window = samples.slice(opts.preRollSteps);
  const meanSpeedMps =
    window.reduce((acc, s) => acc + s.speedMps, 0) / Math.max(1, window.length);
  return { samples, rotationStartIndex: opts.preRollSteps, meanSpeedMps };
}

/** 45° segment rotation at ~200°/s while coasting at cruise speed. */
export function steerTurn(dir: 1 | -1, seed: number): Promise<SteerScenarioResult> {
  return steerScript(seed, {
    restSteps: 30,
    cruiseSteps: 150,
    coastSteps: 6,
    preRollSteps: 12,
    rateDegPerSec: 200,
    totalDeg: dir * 45,
    holdSteps: 45,
    auxDuringWindow: false,
  });
}

/** 1 s standstill finger rotation at 200°/s (a 200° ask; gate is ≥80 achieved). */
export function steerPivot(seed: number): Promise<SteerScenarioResult> {
  return steerScript(seed, {
    restSteps: 30,
    cruiseSteps: 0,
    coastSteps: 0,
    preRollSteps: 12,
    rateDegPerSec: 200,
    totalDeg: 200,
    holdSteps: 30,
    auxDuringWindow: false,
  });
}

/** Cruise + turn: same 45° rotation with auxiliary held through the window. */
export function steerCruiseTurn(seed: number): Promise<SteerScenarioResult> {
  return steerScript(seed, {
    restSteps: 30,
    cruiseSteps: 150,
    coastSteps: 0,
    preRollSteps: 12,
    rateDegPerSec: 200,
    totalDeg: 45,
    holdSteps: 45,
    auxDuringWindow: true,
  });
}

export interface RatchetResult {
  samples: SteerSample[];
  /** Total scripted rotation across grips, deg. */
  commandedDeg: number;
  /** |yaw(end) − yaw(first sample)|, deg. */
  achievedDeg: number;
}

/**
 * Ratchet: rotate +45°, lift BOTH fingers, re-plant at 0°, rotate +45° again —
 * the tech-deck re-grip. Commanded total 90°. Absolute-angle steering cannot
 * accumulate this by construction; relative steering (S2) must.
 *
 * Lifts last 20 steps (~333 ms) — beyond motionTapMaxLiftMs (280 ms) — so the
 * re-grip can never read as a motion-tap pop. (A faster human re-grip WOULD
 * arm the tap recognizer; that ambiguity is corpus material, not a bug this
 * scenario should trip.)
 */
export async function steerRatchet(seed: number): Promise<RatchetResult> {
  const d = await settled(seed);
  for (let i = 0; i < 30; i++) d.drive({ ...pairAt(0), auxiliary: false });
  for (let i = 0; i < 150; i++) d.drive({ ...pairAt(0), auxiliary: true });

  const unwrap = new YawUnwrapper();
  const samples: SteerSample[] = [];
  let scriptedTotalDeg = 0;
  const sample = (padAngleDeg: number, planted: boolean): void => {
    const obs = d.harness.observe();
    samples.push({
      step: obs.step,
      padAngleDeg,
      // While lifted the fingers ask nothing; carry the accumulated total so
      // the plot reads as a staircase toward 90°.
      commandedYawDeg: -(scriptedTotalDeg + (planted ? padAngleDeg : 0)),
      yawDeg: (unwrap.next(yawRad(obs.board.q)) * 180) / Math.PI,
      speedMps: Math.hypot(obs.board.lv.x, obs.board.lv.z),
    });
  };

  const rotSteps = Math.ceil(45 / (200 / HZ));
  for (let grip = 0; grip < 2; grip++) {
    let angleDeg = 0;
    for (let k = 0; k < rotSteps; k++) {
      angleDeg = Math.min(45, (200 / HZ) * (k + 1));
      d.drive({ ...pairAt((angleDeg * Math.PI) / 180), auxiliary: true });
      sample(angleDeg, true);
    }
    for (let i = 0; i < 6; i++) {
      d.drive({ ...pairAt((45 * Math.PI) / 180), auxiliary: true });
      sample(45, true);
    }
    scriptedTotalDeg += 45;
    if (grip === 0) {
      for (let i = 0; i < 20; i++) {
        d.drive({ nose: null, tail: null });
        sample(0, false);
      }
      for (let i = 0; i < 6; i++) {
        d.drive({ ...pairAt(0), auxiliary: true });
        sample(0, true);
      }
    }
  }
  for (let i = 0; i < 30; i++) {
    d.drive({ ...pairAt((45 * Math.PI) / 180), auxiliary: true });
    sample(45, true);
  }

  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  return {
    samples,
    commandedDeg: scriptedTotalDeg,
    achievedDeg: Math.abs(last.yawDeg - first.yawDeg),
  };
}

export interface HoldResult {
  /** |yaw drift| over the hold, deg. */
  yawDriftDeg: number;
  /** Horizontal position drift over the hold, m. */
  posDriftM: number;
}

/** Dual plant/hold: both fingers rest still for 2 s — nothing should move. */
export async function dualPlantHold(seed: number): Promise<HoldResult> {
  const d = await settled(seed);
  d.drive({ ...pairAt(0), auxiliary: false });
  const start = d.harness.observe();
  const startYaw = yawRad(start.board.q);
  const unwrap = new YawUnwrapper();
  unwrap.next(startYaw);
  let yawAcc = 0;
  for (let i = 0; i < 120; i++) {
    d.drive({ ...pairAt(0), auxiliary: false });
    yawAcc = unwrap.next(yawRad(d.harness.observe().board.q));
  }
  const end = d.harness.observe();
  return {
    yawDriftDeg: Math.abs((yawAcc * 180) / Math.PI),
    posDriftM: Math.hypot(end.board.p.x - start.board.p.x, end.board.p.z - start.board.p.z),
  };
}

// ---------------------------------------------------------------------------
// Pop scenarios
// ---------------------------------------------------------------------------

export interface PitchSample {
  step: number;
  pitchDeg: number;
}

export interface PopRunResult {
  seed: number;
  gapSteps: number;
  prepMoveFrames: number;
  /** Step at which the retap kick was consumed. */
  kickStep: number;
  /** First step observed in phase 'air', or null if liftoff never happened. */
  firstAirStep: number | null;
  /** Step at which the trick resolved (trickCompleted/bail), or null. */
  resolveStep: number | null;
  /** (firstAirStep − kickStep) × step ms; null when liftoff never happened. */
  latencyMs: number | null;
  outcome: 'clean' | 'dirty' | 'bail' | 'none';
  label: string | null;
  heightM: number;
  airtimeSec: number;
  /** Nose-up pitch per step from the kick to resolution (or timeout). */
  pitchSamples: PitchSample[];
}

/** Mirror of scriptOllie for the NOSE role: lift nose two reports, retap. */
function scriptNollie(
  d: PadDriver,
  opts: { prepMoveFrames?: number; prepSpeedPerFrame?: number; gapSteps?: number } = {},
): number {
  const prepFrames = opts.prepMoveFrames ?? 0;
  const speed = opts.prepSpeedPerFrame ?? 0;
  const gap = opts.gapSteps ?? 0;
  // Prep: move the TAIL (the foot that stays planted) to raise its vel EMA —
  // mirrors scriptOllie moving the nose before a tail tap.
  for (let i = 1; i <= prepFrames; i++) {
    d.drive({ nose: NOSE_POS, tail: { x: TAIL_POS.x, y: TAIL_POS.y - speed * i } });
  }
  d.drive({ nose: NOSE_POS, tail: TAIL_POS });
  for (let i = 0; i < gap; i++) d.drive({ nose: NOSE_POS, tail: TAIL_POS });
  d.drive({ nose: null, tail: TAIL_POS });
  d.drive({ nose: null, tail: TAIL_POS });
  d.drive({ nose: NOSE_POS, tail: TAIL_POS });
  return d.step - 1;
}

/**
 * One measured pop: cruise, script the tap, then keep BOTH feet planted until
 * the maneuver resolves (the proven L1 auto-catch recipe from ollie-feel).
 */
async function measuredPop(kind: 'ollie' | 'nollie', seed: number, rand: () => number): Promise<PopRunResult> {
  const gapSteps = pick(rand, [0, 1, 2] as const);
  const prepMoveFrames = pick(rand, [2, 3, 4] as const);
  const prepSpeedPerFrame = pick(rand, [0.05, 0.06, 0.07] as const);

  const d = await settled(seed);
  d.cruise(90);
  const script = { prepMoveFrames, prepSpeedPerFrame, gapSteps };
  const kickStep = kind === 'ollie' ? scriptOllie(d, script) : scriptNollie(d, script);

  const h = d.harness;
  const y0 = h.observe().board.p.y;
  let maxY = y0;
  let airSteps = 0;
  let firstAirStep: number | null = null;
  let resolveStep: number | null = null;
  const pitchSamples: PitchSample[] = [];

  for (let i = 0; i < 240; i++) {
    const obs = h.observe();
    if (obs.board.p.y > maxY) maxY = obs.board.p.y;
    pitchSamples.push({ step: obs.step, pitchDeg: pitchNoseUpDeg(obs.board.q) });
    if (obs.phase === 'air' || obs.phase === 'catch') {
      airSteps += 1;
      if (firstAirStep == null && obs.phase === 'air') firstAirStep = obs.step;
    }
    const done = lastEventOf(h, 'trickCompleted') ?? lastEventOf(h, 'bail');
    if (done && (obs.phase === 'ground' || obs.phase === 'bail')) {
      resolveStep = obs.step;
      break;
    }
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
  }

  const trick = lastEventOf(h, 'trickCompleted');
  const bail = lastEventOf(h, 'bail');
  const trickStep = trick ? (trick.step as number) : -1;
  const bailStep = bail ? (bail.step as number) : -1;
  let outcome: PopRunResult['outcome'] = 'none';
  let label: string | null = null;
  if (bailStep > trickStep) {
    outcome = 'bail';
    label = h.observe().lastFailReason;
  } else if (trick) {
    outcome = trick.cleanliness as 'clean' | 'dirty';
    label = trick.label as string;
  }

  return {
    seed,
    gapSteps,
    prepMoveFrames,
    kickStep,
    firstAirStep,
    resolveStep,
    latencyMs: firstAirStep == null ? null : (firstAirStep - kickStep) * DT_MS,
    outcome,
    label,
    heightM: maxY - y0,
    airtimeSec: airSteps / HZ,
    pitchSamples,
  };
}

/** N seeded pops with scripted timing spread. */
export async function popBattery(
  kind: 'ollie' | 'nollie',
  n: number,
  seedBase: number,
): Promise<PopRunResult[]> {
  const out: PopRunResult[] = [];
  for (let i = 0; i < n; i++) {
    const rand = lcg(seedBase * 31 + i);
    out.push(await measuredPop(kind, seedBase + i, rand));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Flick scenario (kickflip recipe from flip-direction, regular stance)
// ---------------------------------------------------------------------------

export interface FlickRunResult {
  seed: number;
  recLabel: string | null;
  label: string | null;
  outcome: 'clean' | 'dirty' | 'bail' | 'none';
  flipRotations: number;
}

export async function flickBattery(n: number, seedBase: number): Promise<FlickRunResult[]> {
  const out: FlickRunResult[] = [];
  for (let i = 0; i < n; i++) {
    const d = await settled(seedBase + i);
    d.cruise(90);
    scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
    const flight = flyWithGesture(d, {
      gesture: 'flip-heel',
      perFrame: 0.13,
      frames: 6,
      startAfterAir: 2,
      catchAfterApexSteps: 6,
    });
    out.push({
      seed: seedBase + i,
      recLabel: flight.recLabel,
      label: flight.label,
      outcome: flight.outcome,
      flipRotations: flight.flipRotations,
    });
  }
  return out;
}
