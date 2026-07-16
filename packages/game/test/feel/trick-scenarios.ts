/**
 * Sprint 03 T0 — trick scenario scripts (air layer instruments).
 *
 * Same rules as the Sprint 02 scenarios: everything drives the REAL pipeline
 * via PadDriver injection, fixed seeds, no wall clock, measurement only.
 * One instrumented flight loop yields every air metric: recognition lag,
 * torque lag, completion, catch residual, outcome.
 */

import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import {
  DT_MS,
  NOSE_POS,
  TAIL_POS,
  eventsOf,
  gesturePos,
  lastEventOf,
  scriptOllie,
  settledProfiled,
} from '../helpers/maneuver';
import type { GestureScript } from '../helpers/maneuver';
import { lcg } from './scenarios';

const HZ = DEFAULT_SIM_CONFIG.physics.hz;

export type TrickLabel = 'kickflip' | 'heelflip' | 'bs-shuv' | 'fs-shuv';

const GESTURE_BY_LABEL: Record<TrickLabel, GestureScript> = {
  kickflip: 'flip-heel',
  heelflip: 'flip-toe',
  'bs-shuv': 'shuv-bs',
  'fs-shuv': 'shuv-fs',
};

export interface TrickRunResult {
  seed: number;
  wanted: TrickLabel;
  assistLevel: 0 | 1 | 2;
  /** Step of the first scripted gesture frame (evidence starts here). */
  firstGestureStep: number | null;
  /** flip/shuvRecognized telemetry step. */
  recognizedStep: number | null;
  recogLagMs: number | null;
  /** Recognition → first step with on-axis |Δω| above threshold. */
  torqueLagMs: number | null;
  /** Signed completion at resolution: turns (flips) / degrees (shuvs). */
  completionTurns: number | null;
  completionDeg: number | null;
  /** Deck tilt vs world-up one step after the catch event, deg. */
  catchResidualDeg: number | null;
  /** Deck tilt vs world-up four steps (~67 ms) after the catch event, deg. */
  catchResidual4Deg: number | null;
  caught: boolean;
  recLabel: string | null;
  label: string | null;
  outcome: 'clean' | 'dirty' | 'bail' | 'none';
  bailReason: string | null;
}

function deckTiltDeg(q: { x: number; y: number; z: number; w: number }): number {
  // World-up component of the deck normal: acos clamps handle noise.
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
  return (Math.acos(Math.max(-1, Math.min(1, upY))) * 180) / Math.PI;
}

/** ω projected on the trick axis (flips: board-long; shuvs: deck-up). */
function omegaOnAxis(
  q: { x: number; y: number; z: number; w: number },
  av: { x: number; y: number; z: number },
  axis: 'long' | 'up',
): number {
  const rotate = (vx: number, vy: number, vz: number): { x: number; y: number; z: number } => {
    // v' = q v q* expanded (same math as SimWorld quatRotate).
    const { x, y, z, w } = q;
    const uvx = y * vz - z * vy;
    const uvy = z * vx - x * vz;
    const uvz = x * vy - y * vx;
    const uuvx = y * uvz - z * uvy;
    const uuvy = z * uvx - x * uvz;
    const uuvz = x * uvy - y * uvx;
    return {
      x: vx + 2 * (w * uvx + uuvx),
      y: vy + 2 * (w * uvy + uuvy),
      z: vz + 2 * (w * uvz + uuvz),
    };
  };
  const a = axis === 'long' ? rotate(0, 0, 1) : rotate(0, 1, 0);
  return av.x * a.x + av.y * a.y + av.z * a.z;
}

/** One instrumented trick flight through the real pipeline. */
export async function measuredTrick(
  wanted: TrickLabel,
  seed: number,
  assistLevel: 0 | 1 | 2,
  opts: { perFrame?: number; catchAfterApexSteps?: number } = {},
): Promise<TrickRunResult> {
  const gesture = GESTURE_BY_LABEL[wanted];
  const isShuv = wanted.endsWith('shuv');
  const perFrame = opts.perFrame ?? (isShuv ? 0.1 : 0.13);
  const catchAfter = opts.catchAfterApexSteps ?? (isShuv ? 8 : 6);
  const axis: 'long' | 'up' = isShuv ? 'up' : 'long';

  const d = await settledProfiled(seed, { assistLevel });
  const h = d.harness;
  d.cruise(90);
  scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });

  let airStart: number | null = null;
  let apexStep: number | null = null;
  let firstGestureStep: number | null = null;
  let gi = 0;
  let nosePlanted = false;
  const omegaByStep = new Map<number, number>();
  let catchResidualDeg: number | null = null;
  let catchResidual4Deg: number | null = null;
  let catchStepSeen: number | null = null;

  for (let i = 0; i < 240; i++) {
    const obs = h.observe();
    if (airStart == null && (obs.phase === 'air' || obs.phase === 'catch')) airStart = obs.step;
    if (airStart != null && apexStep == null && obs.board.lv.y <= 0) apexStep = obs.step;
    omegaByStep.set(obs.step, omegaOnAxis(obs.board.q, obs.board.av, axis));

    const catchEv = eventsOf(h, 'catch')[0];
    if (catchEv && catchStepSeen == null) catchStepSeen = catchEv.step as number;
    if (
      catchStepSeen != null &&
      catchResidualDeg == null &&
      obs.step === catchStepSeen + 1
    ) {
      catchResidualDeg = deckTiltDeg(obs.board.q);
    }
    if (
      catchStepSeen != null &&
      catchResidual4Deg == null &&
      obs.step === catchStepSeen + 4
    ) {
      catchResidual4Deg = deckTiltDeg(obs.board.q);
    }

    const done = lastEventOf(h, 'trickCompleted') ?? lastEventOf(h, 'bail');
    if (done && (obs.phase === 'ground' || obs.phase === 'bail')) break;

    const tailBase = d.logicalTailBase();
    let tail = tailBase;
    if (airStart != null && obs.step >= airStart + 2 && gi < 6) {
      gi += 1;
      if (firstGestureStep == null) firstGestureStep = obs.step;
    }
    if (gi > 0) {
      const scripted = gesturePos(gesture, gi, perFrame, 6);
      tail = {
        x: Math.min(0.98, Math.max(0.02, tailBase.x + scripted.x - TAIL_POS.x)),
        y: Math.min(0.98, Math.max(0.02, tailBase.y + scripted.y - TAIL_POS.y)),
      };
    }
    if (!nosePlanted && apexStep != null && obs.step >= apexStep + catchAfter) {
      nosePlanted = true;
    }
    d.drive({ nose: nosePlanted ? d.logicalNoseBase() : null, tail });
  }

  const rec = eventsOf(h, 'flipRecognized').concat(eventsOf(h, 'shuvRecognized'))[0];
  const recognizedStep = rec ? (rec.step as number) : null;

  // Torque lag: recognition → first step whose on-axis ω moved ≥ 0.5 rad/s
  // from its value at recognition (angular acceleration evidence).
  let torqueLagMs: number | null = null;
  if (recognizedStep != null && omegaByStep.has(recognizedStep)) {
    const omega0 = omegaByStep.get(recognizedStep)!;
    for (const [step, omega] of omegaByStep) {
      if (step > recognizedStep && Math.abs(omega - omega0) >= 0.5) {
        torqueLagMs = (step - recognizedStep) * DT_MS;
        break;
      }
    }
  }

  const trick = lastEventOf(h, 'trickCompleted');
  const bail = lastEventOf(h, 'bail');
  const trickStep = trick ? (trick.step as number) : -1;
  const bailStep = bail ? (bail.step as number) : -1;
  const bailed = bailStep > trickStep;
  let outcome: TrickRunResult['outcome'] = 'none';
  if (bailed) outcome = 'bail';
  else if (trick) outcome = trick.cleanliness as 'clean' | 'dirty';
  const outcomeEv = bailed ? bail : trick;

  return {
    seed,
    wanted,
    assistLevel,
    firstGestureStep,
    recognizedStep,
    recogLagMs:
      recognizedStep != null && firstGestureStep != null
        ? (recognizedStep - firstGestureStep) * DT_MS
        : null,
    torqueLagMs,
    completionTurns: outcomeEv ? ((outcomeEv.flipRotations as number) ?? null) : null,
    completionDeg: outcomeEv ? ((outcomeEv.shuvDegrees as number) ?? null) : null,
    catchResidualDeg,
    catchResidual4Deg,
    caught: eventsOf(h, 'catch').length > 0,
    recLabel: rec ? (rec.label as string) : null,
    label: trick ? (trick.label as string) : null,
    outcome,
    bailReason: bailed && bail ? ((bail.reason as string) ?? null) : null,
  };
}

/** N seeded runs of one trick at one assist level (deterministic spread). */
export async function trickBattery(
  wanted: TrickLabel,
  n: number,
  seedBase: number,
  assistLevel: 0 | 1 | 2,
): Promise<TrickRunResult[]> {
  const out: TrickRunResult[] = [];
  for (let i = 0; i < n; i++) {
    const rand = lcg(seedBase * 17 + i);
    const isShuv = wanted.endsWith('shuv');
    const perFrame = isShuv
      ? [0.09, 0.1, 0.11][Math.floor(rand() * 3)]!
      : [0.12, 0.13, 0.14][Math.floor(rand() * 3)]!;
    out.push(await measuredTrick(wanted, seedBase + i, assistLevel, { perFrame }));
  }
  return out;
}
