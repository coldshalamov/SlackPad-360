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

/** Default calibrated foot positions (regular stance: pad-left = nose). */
export const NOSE_POS = { x: 0.4, y: 0.5 };
export const TAIL_POS = { x: 0.6, y: 0.5 };

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

  constructor(readonly harness: AgentHarness) {}

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
      buttons: { primary: opts.primary ?? false, secondary: false, auxiliary: false },
    };
    this.harness.injectContactFrame(frame);
    this.harness.step(1);
  }

  /** Advance n steps with NO input frames at all. */
  idle(n: number): void {
    this.harness.step(n);
  }

  /** Both feet planted at rest positions for n steps (cruise). */
  cruise(n: number): void {
    for (let i = 0; i < n; i++) this.drive({ nose: NOSE_POS, tail: TAIL_POS });
  }
}

/** Reset + settle onto the ground (phase 'ground', rest pose fresh). */
export async function settled(seed: number, levelId = 'flat-dev', harness?: AgentHarness): Promise<PadDriver> {
  const h = harness ?? new AgentHarness();
  await h.reset(seed, levelId);
  h.step(60); // drop from spawnHeight and settle
  return new PadDriver(h);
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
 * Scripted ollie: from a settled, cruising state — crisp nose prep (fast
 * pad movement), nose lift, kick. Returns the pop step. `gapSteps` separates
 * the lift and the kick (0 = same step → perfect click-centering).
 */
export function scriptOllie(
  d: PadDriver,
  opts: { prepMoveFrames?: number; prepSpeedPerFrame?: number; gapSteps?: number } = {},
): number {
  const prepFrames = opts.prepMoveFrames ?? 0;
  const speed = opts.prepSpeedPerFrame ?? 0;
  const gap = opts.gapSteps ?? 0;

  // Crisp prep: move the nose fast for a few frames (raises the vel EMA).
  for (let i = 1; i <= prepFrames; i++) {
    d.drive({ nose: { x: NOSE_POS.x, y: NOSE_POS.y - speed * i }, tail: TAIL_POS });
  }
  // Lift the nose; wait `gap` steps; kick on a tail-only frame.
  if (gap === 0) {
    d.drive({ tail: TAIL_POS, primary: true });
  } else {
    d.drive({ tail: TAIL_POS });
    for (let i = 1; i < gap; i++) d.drive({ tail: TAIL_POS });
    d.drive({ tail: TAIL_POS, primary: true });
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
  const catchPos = opts.catchPos ?? NOSE_POS;
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
    d.drive({
      nose: nosePlanted ? catchPos : null,
      tail: holdTail ? TAIL_POS : null,
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
