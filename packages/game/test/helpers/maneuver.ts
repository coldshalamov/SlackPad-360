/**
 * M4 test helpers — a deterministic scripted "pad driver" that injects one
 * synthetic ContactFrame per sim step through the AgentHarness (inject-only:
 * every test drives the REAL FootTracker → KickArbiter → GestureFSM →
 * ManeuverAssist → SimWorld pipeline; no shortcuts exist).
 */

import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import type { Contact } from '@slackpad/shared';
import { AgentHarness } from '../../src/agent/AgentHarness';
import type { InjectableFrame } from '../../src/agent/AgentHarness';
import type { TelemetryEvent } from '../../src/telemetry/Telemetry';

export const DT_MS = 1000 / DEFAULT_SIM_CONFIG.physics.hz;

/** Default right-hand stance: index/pad-left=tail, middle/pad-right=nose. */
export const TAIL_POS = { x: 0.4, y: 0.5 };
export const NOSE_POS = { x: 0.6, y: 0.5 };

export interface FootInput {
  x: number;
  y: number;
}

export interface DriveOptions {
  /** Nose contact position, or null/undefined for lifted. */
  nose?: FootInput | null;
  /** Tail contact position, or null/undefined for lifted. */
  tail?: FootInput | null;
  primary?: boolean;
  /** RMB — front-foot kick under 'buttonSide' attribution (IMPL-007). */
  secondary?: boolean;
  /** Explicit acceleration action (native/DEV Ctrl). */
  auxiliary?: boolean;
}

/**
 * One frame per step, hardware-faithful ids: a replant after a lift gets a
 * FRESH contact id (real pads never resurrect ids), exercising the
 * FootTracker proximity rebind exactly like the native adapter would.
 */
export class PadDriver {
  private frameId = 0;
  private nextContactId = 1;
  private noseId: number | null = null;
  private tailId: number | null = null;

  constructor(
    readonly harness: AgentHarness,
    readonly stance: 'regular' | 'goofy' = 'regular',
    readonly kickAttribution: 'motionTap' | 'buttonSide' | 'plantMask' = 'motionTap',
  ) {}

  get step(): number {
    return this.harness.getStep();
  }

  /** Inject one frame for the current step, then advance one step. */
  drive(opts: DriveOptions): void {
    const contacts: Contact[] = [];
    if (opts.nose) {
      if (this.noseId == null) this.noseId = this.nextContactId++;
      contacts.push({ id: this.noseId, tip: true, x: opts.nose.x, y: opts.nose.y, confidence: true });
    } else {
      this.noseId = null;
    }
    if (opts.tail) {
      if (this.tailId == null) this.tailId = this.nextContactId++;
      contacts.push({ id: this.tailId, tip: true, x: opts.tail.x, y: opts.tail.y, confidence: true });
    } else {
      this.tailId = null;
    }
    const frame: InjectableFrame = {
      schemaVersion: 1,
      frameId: this.frameId++,
      tPerfMs: this.step * DT_MS,
      contacts,
      buttons: {
        primary: opts.primary ?? false,
        secondary: opts.secondary ?? false,
        auxiliary: opts.auxiliary ?? false,
      },
    };
    this.harness.injectContactFrame(frame);
    this.harness.step(1);
  }

  /** Drive logical board roles while preserving regular/goofy pad binding. */
  driveLogical(opts: DriveOptions): void {
    if (this.stance === 'regular') {
      this.drive(opts);
      return;
    }
    this.drive({
      ...opts,
      // On goofy, pad-left is nose and pad-right is tail. PadDriver's original
      // fields own those physical contact lifetimes in the opposite order.
      nose: opts.tail,
      tail: opts.nose,
    });
  }

  logicalNoseBase(): FootInput {
    return this.stance === 'regular' ? NOSE_POS : TAIL_POS;
  }

  logicalTailBase(): FootInput {
    return this.stance === 'regular' ? TAIL_POS : NOSE_POS;
  }

  /** Advance n steps with NO input frames at all. */
  idle(n: number): void {
    this.harness.step(n);
  }

  /** Both feet planted with explicit acceleration for n steps (cruise). */
  cruise(n: number): void {
    for (let i = 0; i < n; i++) {
      this.driveLogical({
        nose: this.logicalNoseBase(),
        tail: this.logicalTailBase(),
        auxiliary: true,
      });
    }
  }
}

/** Reset + settle onto the ground (phase 'ground', rest pose fresh). */
export async function settled(seed: number, levelId = 'flat-dev', harness?: AgentHarness): Promise<PadDriver> {
  const h = harness ?? new AgentHarness();
  await h.reset(seed, levelId);
  h.step(60); // drop from spawnHeight and settle
  return new PadDriver(h, 'regular', 'motionTap');
}

/**
 * settled() with an explicit stance/assist profile (M5). A fresh harness reads
 * the profile at reset(), so stance/assist apply from step 0 (and thus reach
 * the FootTracker's pad-role binding, the AirGestureClassifier, and the flip
 * torque clamps).
 */
export async function settledProfiled(
  seed: number,
  opts: {
    stance?: 'regular' | 'goofy';
    assistLevel?: 0 | 1 | 2;
    levelId?: string;
    kickAttribution?: 'motionTap' | 'buttonSide' | 'plantMask';
  } = {},
): Promise<PadDriver> {
  const h = new AgentHarness(DEFAULT_SIM_CONFIG, () => ({
    stance: opts.stance ?? 'regular',
    padYawOffset: 0,
    swapFeet: false,
    assistLevel: opts.assistLevel ?? 1,
    bothClickMeans: 'push',
    kickAttribution: opts.kickAttribution ?? 'motionTap',
    tapToClickIsKick: true,
    accessibility: { reducedMotion: false, highContrastHud: false },
  }));
  await h.reset(seed, opts.levelId ?? 'flat-dev');
  h.step(60);
  return new PadDriver(
    h,
    opts.stance ?? 'regular',
    opts.kickAttribution ?? 'motionTap',
  );
}

/** All telemetry events of one type (typed as loose records for assertions). */
export function eventsOf(h: AgentHarness, type: string): Array<Record<string, unknown>> {
  return h
    .getTelemetry()
    .snapshot()
    .events.filter((e: TelemetryEvent) => e.type === type) as Array<Record<string, unknown>>;
}

export function lastEventOf(h: AgentHarness, type: string): Record<string, unknown> | undefined {
  const all = eventsOf(h, type);
  return all[all.length - 1];
}

/**
 * Scripted shipping ollie: lift and quickly retap the tail role. Legacy timing
 * options remain accepted for scenario setup, but no button is involved.
 */
export function scriptOllie(
  d: PadDriver,
  opts: { prepMoveFrames?: number; prepSpeedPerFrame?: number; gapSteps?: number } = {},
): number {
  const prepFrames = opts.prepMoveFrames ?? 0;
  const speed = opts.prepSpeedPerFrame ?? 0;
  const gap = opts.gapSteps ?? 0;
  const noseBase = d.logicalNoseBase();
  const tailBase = d.logicalTailBase();

  // Crisp prep: move the nose fast for a few frames (raises the vel EMA).
  for (let i = 1; i <= prepFrames; i++) {
    d.driveLogical({ nose: { x: noseBase.x, y: noseBase.y - speed * i }, tail: tailBase });
  }
  d.driveLogical({ nose: noseBase, tail: tailBase });
  for (let i = 0; i < gap; i++) d.driveLogical({ nose: noseBase, tail: tailBase });

  if (d.kickAttribution === 'motionTap') {
    // Lift the logical tail for two reports, then retap its socket.
    d.driveLogical({ nose: noseBase, tail: null });
    d.driveLogical({ nose: noseBase, tail: null });
    d.driveLogical({ nose: noseBase, tail: tailBase });
  } else if (d.kickAttribution === 'buttonSide') {
    d.driveLogical({ nose: noseBase, tail: tailBase, primary: true });
  } else {
    // Explicit legacy plant-mask path: lift the prep/nose role, then click with
    // only the logical tail planted.
    d.driveLogical({ nose: null, tail: tailBase });
    d.driveLogical({ nose: null, tail: tailBase, primary: true });
  }
  return d.step - 1; // the sim step at which the kick was consumed
}

export interface FlightResult {
  /** Max board-center height above its pre-pop height, m. */
  height: number;
  /** Steps spent airborne (phase air/catch), converted to seconds. */
  airtimeSec: number;
  /** Land/bail outcome from telemetry. */
  outcome: 'clean' | 'dirty' | 'bail' | 'none';
  thetaDeg: number | null;
  failReason: string | null;
}

/**
 * Fly out a pop: keep driving `tailFrames` (default tail planted) until the
 * flight resolves (trickCompleted or bail) or maxSteps pass. Optionally
 * replant the nose `catchAfterApexSteps` after the apex at `catchPos`.
 */
export function flyOut(
  d: PadDriver,
  opts: {
    maxSteps?: number;
    catchAfterApexSteps?: number | null;
    catchPos?: FootInput;
    holdTail?: boolean;
  } = {},
): FlightResult {
  const h = d.harness;
  const maxSteps = opts.maxSteps ?? 240;
  const catchAfter = opts.catchAfterApexSteps ?? null;
  const catchPos = opts.catchPos ?? d.logicalNoseBase();
  const holdTail = opts.holdTail ?? true;

  const y0 = h.observe().board.p.y;
  let maxY = y0;
  let airSteps = 0;
  let apexStep: number | null = null;
  let nosePlanted = false;

  for (let i = 0; i < maxSteps; i++) {
    const obs = h.observe();
    if (obs.board.p.y > maxY) maxY = obs.board.p.y;
    const phase = obs.phase;
    if (phase === 'air' || phase === 'catch') {
      airSteps += 1;
      if (apexStep == null && obs.board.lv.y <= 0) apexStep = obs.step;
    }
    const done = lastEventOf(h, 'trickCompleted') ?? lastEventOf(h, 'bail');
    if (done && (phase === 'ground' || phase === 'bail')) break;

    if (
      !nosePlanted &&
      catchAfter != null &&
      apexStep != null &&
      obs.step >= apexStep + catchAfter
    ) {
      nosePlanted = true;
    }
    d.driveLogical({
      nose: nosePlanted ? catchPos : null,
      tail: holdTail ? d.logicalTailBase() : null,
    });
  }

  const trick = lastEventOf(h, 'trickCompleted');
  const bail = lastEventOf(h, 'bail');
  const trickStep = trick ? (trick.step as number) : -1;
  const bailStep = bail ? (bail.step as number) : -1;

  let outcome: FlightResult['outcome'] = 'none';
  let thetaDeg: number | null = null;
  if (bailStep > trickStep) {
    outcome = 'bail';
  } else if (trick) {
    outcome = trick.cleanliness as 'clean' | 'dirty';
    thetaDeg = trick.thetaDeg as number;
  }

  return {
    height: maxY - y0,
    airtimeSec: airSteps / DEFAULT_SIM_CONFIG.physics.hz,
    outcome,
    thetaDeg,
    failReason: h.observe().lastFailReason,
  };
}

// --- M5 air-gesture (flick/sweep) scripting ---------------------------------

export type GestureScript = 'flip-heel' | 'flip-toe' | 'shuv-bs' | 'shuv-fs';

export interface FlipFlightResult extends FlightResult {
  /** Signed completed roll (turns) at land, from trickCompleted telemetry. */
  flipRotations: number;
  /** Signed completed yaw (deg) at land. */
  shuvDegrees: number;
  /** Outcome label ('kickflip'|'heelflip'|'fs-shuv'|'bs-shuv'|'ollie'|'nollie'). */
  label: string | null;
  caught: boolean;
  /** Recognized flick/sweep intensity s (from flip/shuvRecognized), or null. */
  recIntensity: number | null;
  /** Provisional recognized label, or null if nothing recognized. */
  recLabel: string | null;
}

/**
 * The free foot's (TAIL) scripted pad position at gesture frame k (1-based).
 * The tail stays planted throughout the pop, so moving it is a free-foot flick
 * with NO replant edge — it never false-triggers a catch. A flick is a straight
 * lateral slide (heelside = +y for the default regular frame); a shuv traces a
 * yaw arc so the velocity DIRECTION turns past sweepMinAngleRad.
 */
export function gesturePos(g: GestureScript, k: number, perFrame: number, frames: number): FootInput {
  if (g === 'flip-heel') return { x: TAIL_POS.x, y: clampPad(TAIL_POS.y + perFrame * k) };
  if (g === 'flip-toe') return { x: TAIL_POS.x, y: clampPad(TAIL_POS.y - perFrame * k) };
  // Shuv arc: velocity tangent rotates by `span` over the sweep.
  const dir = g === 'shuv-bs' ? 1 : -1;
  const R = 0.13;
  const span = Math.PI * 0.8;
  const a0 = 0;
  const a = a0 + dir * span * (k / frames);
  return {
    x: clampPad(TAIL_POS.x + R * (Math.cos(a) - Math.cos(a0))),
    y: clampPad(TAIL_POS.y + R * (Math.sin(a) - Math.sin(a0))),
  };
}

function clampPad(v: number): number {
  return v < 0.02 ? 0.02 : v > 0.98 ? 0.98 : v;
}

export interface GestureOptions {
  gesture: GestureScript;
  /** Lateral pad step per sim step for a flick (ignored for shuv arc). */
  perFrame?: number;
  frames?: number;
  /** Steps after air entry before the gesture starts. */
  startAfterAir?: number;
  catchAfterApexSteps?: number | null;
  catchPos?: FootInput;
  maxSteps?: number;
}

/**
 * Fly out a pop while scripting a free-foot air gesture, then optionally catch.
 * Assumes the caller already ran scriptOllie (tail planted, nose lifted).
 */
export function flyWithGesture(d: PadDriver, opts: GestureOptions): FlipFlightResult {
  const h = d.harness;
  const perFrame = opts.perFrame ?? 0.1;
  const frames = opts.frames ?? 6;
  const startAfterAir = opts.startAfterAir ?? 2;
  const catchAfter = opts.catchAfterApexSteps ?? null;
  const catchPos = opts.catchPos ?? d.logicalNoseBase();
  const maxSteps = opts.maxSteps ?? 240;

  const y0 = h.observe().board.p.y;
  let maxY = y0;
  let airSteps = 0;
  let airStart: number | null = null;
  let apexStep: number | null = null;
  let gi = 0;
  let nosePlanted = false;

  for (let i = 0; i < maxSteps; i++) {
    const obs = h.observe();
    if (obs.board.p.y > maxY) maxY = obs.board.p.y;
    const phase = obs.phase;
    if (phase === 'air' || phase === 'catch') {
      airSteps += 1;
      if (airStart == null) airStart = obs.step;
      if (apexStep == null && obs.board.lv.y <= 0) apexStep = obs.step;
    }
    const done = lastEventOf(h, 'trickCompleted') ?? lastEventOf(h, 'bail');
    if (done && (phase === 'ground' || phase === 'bail')) break;

    const tailBase = d.logicalTailBase();
    let tail: FootInput = tailBase;
    if (airStart != null && obs.step >= airStart + startAfterAir) {
      if (gi < frames) gi += 1;
      const scripted = gesturePos(opts.gesture, gi, perFrame, frames);
      tail = {
        x: clampPad(tailBase.x + scripted.x - TAIL_POS.x),
        y: clampPad(tailBase.y + scripted.y - TAIL_POS.y),
      }; // holds at final after `frames`
    }

    if (!nosePlanted && catchAfter != null && apexStep != null && obs.step >= apexStep + catchAfter) {
      nosePlanted = true;
    }
    d.driveLogical({ nose: nosePlanted ? catchPos : null, tail });
  }

  const trick = lastEventOf(h, 'trickCompleted');
  const bail = lastEventOf(h, 'bail');
  const trickStep = trick ? (trick.step as number) : -1;
  const bailStep = bail ? (bail.step as number) : -1;
  const rec = eventsOf(h, 'flipRecognized').concat(eventsOf(h, 'shuvRecognized'));
  const recFirst = rec[0];

  let outcome: FlightResult['outcome'] = 'none';
  let thetaDeg: number | null = null;
  const bailed = bailStep > trickStep;
  const outcomeEv = bailed ? bail : trick;
  if (bailed) {
    outcome = 'bail';
  } else if (trick) {
    outcome = trick.cleanliness as 'clean' | 'dirty';
    thetaDeg = trick.thetaDeg as number;
  }

  return {
    height: maxY - y0,
    airtimeSec: airSteps / DEFAULT_SIM_CONFIG.physics.hz,
    outcome,
    thetaDeg,
    failReason: h.observe().lastFailReason,
    flipRotations: outcomeEv ? ((outcomeEv.flipRotations as number) ?? 0) : 0,
    shuvDegrees: outcomeEv ? ((outcomeEv.shuvDegrees as number) ?? 0) : 0,
    label: trick ? (trick.label as string) : bailed ? h.observe().lastFailReason : null,
    caught: lastEventOf(h, 'catch') !== undefined,
    recIntensity: recFirst ? (recFirst.intensity as number) : null,
    recLabel: recFirst ? (recFirst.label as string) : null,
  };
}
