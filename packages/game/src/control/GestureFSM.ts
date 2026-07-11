/**
 * GestureFSM — the maneuver phase state machine (M4; research/control-grammar
 * §7, final-input-and-trick-spec §3/§5/§7, final-physics §3.3).
 *
 * Phases: 'none' (not riding) | 'ground' | 'pop' | 'air' | 'catch' | 'bail'.
 * Legal edges (the property test pins this exact table):
 *
 *   none   → ground                         (board settles onto the ground)
 *   ground → pop | none                     (pop recognition / lost the ground)
 *   pop    → air | ground | bail            (liftoff / fizzle / interrupt)
 *   air    → catch | ground | bail          (catch / land check / interrupt)
 *   catch  → ground | bail                  (land check / interrupt)
 *   bail   → none                           (respawn — SimWorld game rule)
 *
 * The FSM consumes PLAIN DATA only (FeetState, arbitrated PopRecognitions,
 * BoardPose reads, the last-step contact impulse). It never touches the body:
 * ManeuverAssist turns the emitted events into clamped SimWorld commands.
 * Assist can therefore never open without ContactFrame-derived recognition —
 * every FsmEvent is causally downstream of a recognized primitive or a
 * physics observation (final-physics §3: "Assist never opens without
 * ContactFrame-derived recognition").
 *
 * Failure policy (final-input-and-trick-spec §7): every failure sets a
 * lastFailReason ('over-rotation' | 'hard-impact' | 'inverted' | 'timeout')
 * plus a telemetry event — never undefined, never silent.
 *
 * Catch generosity notes (M4, documented hypotheses):
 *  - Catch volumes are board-local spheres of catch.volumeRadius around each
 *    shoe socket; a replant hits when padToBoardScale·|offsetFromRest| is
 *    inside the radius. When the rest pose was cleared by a long dual lift,
 *    offsetFromRest reads 0 and any replant catches — deliberately generous.
 *  - The FootTracker ballistic hold (~200 ms) masks replant edges for very
 *    short dual-lift airs; the common case (pivot foot stays planted) is
 *    unaffected.
 *
 * Determinism: step arithmetic only (ms → steps via hz); no wall clock, no
 * Math.random.
 */

import type { SimConfig } from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';
import type { FeetState } from '../input/FootTracker';
import type { BoardPose } from '../sim/SimWorld';
import type { PopRecognition } from './KickArbiter';

export type GesturePhase = 'none' | 'ground' | 'pop' | 'air' | 'catch' | 'bail';

export type FailReason = 'over-rotation' | 'hard-impact' | 'inverted' | 'timeout';

/** Recognition label per policy §3: occurrence + confidence + window. */
export interface RecognitionLabelState {
  label: 'ollie' | 'nollie';
  confidence: number;
  openStep: number;
  /** End of the air-trick recognition window (M5 flicks land inside it). */
  expireStep: number;
  /** Pop prep quality (intensity input for ManeuverAssist). */
  q: number;
}

export type FsmEvent =
  | { kind: 'pop'; label: 'ollie' | 'nollie'; q: number }
  | { kind: 'catch'; foot: 'nose' | 'tail' | 'both' }
  | { kind: 'land'; cleanliness: 'clean' | 'dirty'; thetaDeg: number; label: string | null }
  | { kind: 'bail'; reason: FailReason }
  | { kind: 'popFizzled' };

export interface FsmInputs {
  feet: FeetState;
  pops: PopRecognition[];
  grounded: boolean;
  pose: BoardPose;
  /** Max board contact impulse (N·s) observed during the previous step. */
  contactImpulse: number;
  step: number;
}

export interface FsmResult {
  phase: GesturePhase;
  label: RecognitionLabelState | null;
  lastFailReason: FailReason | null;
  events: FsmEvent[];
}

function msToSteps(ms: number, hz: number): number {
  return Math.max(1, Math.round((ms / 1000) * hz));
}

export class GestureFSM {
  #phase: GesturePhase = 'none';
  #label: RecognitionLabelState | null = null;
  #lastFailReason: FailReason | null = null;

  // Maneuver bookkeeping (steps, not wall time).
  #popStep = 0;
  #airStartStep = 0;
  #apexSeen = false;
  #catchWindowEndStep = 0;
  #caught = false;
  #bailStepsLeft = 0;

  // Previous-step foot plants for replant/lift edge detection.
  #prevNosePlanted = false;
  #prevTailPlanted = false;
  #prevNoseSpeed = 0;
  #prevTailSpeed = 0;

  /** Rolling window of AIRBORNE contact impulses (interrupt rule §3.3). */
  #impulseWindow: number[] = [];

  private readonly airTrickWindowSteps: number;
  private readonly catchWindowSteps: number;

  constructor(
    private readonly config: SimConfig,
    private readonly assistLevel: 0 | 1 | 2,
    private readonly telemetry?: Telemetry,
  ) {
    const hz = config.physics.hz;
    this.airTrickWindowSteps = msToSteps(config.recognition.airTrickWindowMs, hz);
    this.catchWindowSteps = msToSteps(config.catch.windowMs, hz);
  }

  /** Current phase (read by the KickArbiter gate and the checkpoint hash). */
  get phase(): GesturePhase {
    return this.#phase;
  }

  get label(): RecognitionLabelState | null {
    return this.#label ? { ...this.#label } : null;
  }

  get lastFailReason(): FailReason | null {
    return this.#lastFailReason;
  }

  update(inp: FsmInputs): FsmResult {
    const events: FsmEvent[] = [];
    const from = this.#phase;

    switch (this.#phase) {
      case 'none':
        if (inp.grounded) this.#phase = 'ground';
        break;

      case 'ground': {
        const pop = inp.pops[0];
        if (pop && inp.grounded) {
          this.#openPop(pop, inp.step);
          events.push({ kind: 'pop', label: pop.label, q: pop.q });
        } else if (!inp.grounded) {
          // Lost the ground without a pop (bounce / rolled off something).
          this.#phase = 'none';
        }
        break;
      }

      case 'pop': {
        if (this.#collisionInterrupt(inp, events)) break;
        if (!inp.grounded) {
          this.#phase = 'air';
          this.#airStartStep = inp.step;
          this.#apexSeen = false;
          this.#caught = false;
        } else if (inp.step - this.#popStep > this.config.pop.groundLeaveTimeoutSteps) {
          // Blocked pop: the board never left the ground. Cancel the label —
          // a readable non-event, never a silent success.
          this.telemetry?.log({ type: 'popFizzled', step: inp.step, label: this.#label?.label ?? 'unknown' });
          events.push({ kind: 'popFizzled' });
          this.#label = null;
          this.#phase = 'ground';
        }
        break;
      }

      case 'air': {
        if (inp.grounded) {
          this.#landCheck(inp, events);
          break;
        }
        if (this.#collisionInterrupt(inp, events)) break;
        if (this.#airTimeout(inp, events)) break;
        this.#trackApex(inp);
        this.#logAirGestures(inp);
        const hit = this.#catchAttempt(inp);
        if (hit) {
          this.#caught = true;
          this.#phase = 'catch';
          events.push({ kind: 'catch', foot: hit });
          this.telemetry?.log({ type: 'catch', step: inp.step, foot: hit, factor: this.#catchFactor() });
        }
        break;
      }

      case 'catch': {
        if (inp.grounded) {
          this.#landCheck(inp, events);
          break;
        }
        if (this.#collisionInterrupt(inp, events)) break;
        this.#airTimeout(inp, events);
        break;
      }

      case 'bail': {
        this.#bailStepsLeft -= 1;
        if (this.#bailStepsLeft <= 0) {
          // SimWorld's internal game rule respawned the board one step earlier
          // (same recoverSteps config) — the FSM re-enters the not-riding state
          // and re-grounds when the respawned board settles.
          this.#phase = 'none';
          this.telemetry?.log({ type: 'respawn', step: inp.step });
        }
        break;
      }
    }

    if (this.#phase !== from) {
      this.telemetry?.log({ type: 'phaseChanged', step: inp.step, from, to: this.#phase });
    }

    this.#prevNosePlanted = inp.feet.nose.planted;
    this.#prevTailPlanted = inp.feet.tail.planted;
    this.#prevNoseSpeed = Math.hypot(inp.feet.nose.vel.x, inp.feet.nose.vel.y);
    this.#prevTailSpeed = Math.hypot(inp.feet.tail.vel.x, inp.feet.tail.vel.y);

    return {
      phase: this.#phase,
      label: this.label,
      lastFailReason: this.#lastFailReason,
      events,
    };
  }

  // --- transitions ---------------------------------------------------------

  #openPop(pop: PopRecognition, step: number): void {
    const rec = this.config.recognition;
    // Confidence per recognition policy §3: mask-rule recognition opens at
    // c_enter; prep quality raises it toward 1. Static in M4 (no decay), so
    // hysteresis (c_exit) never closes a label early; the window/phase does.
    const confidence = Math.min(1, rec.cEnter + (1 - rec.cEnter) * pop.q);
    this.#label = {
      label: pop.label,
      confidence,
      openStep: step,
      expireStep: step + this.airTrickWindowSteps,
      q: pop.q,
    };
    this.#lastFailReason = null; // a new attempt clears the old failure
    this.#impulseWindow.length = 0; // fresh maneuver, fresh interrupt window
    this.#popStep = step;
    this.#phase = 'pop';
    this.telemetry?.log({ type: 'popRecognized', step, label: pop.label, q: pop.q, confidence });
  }

  /** Land check (final-physics §3.2 landing cones): θ = ∠(board-up, world-up). */
  #landCheck(inp: FsmInputs, events: FsmEvent[]): void {
    const q = inp.pose.q;
    // board-up = quat * (0,1,0); its world Y component (the cos of θ) is
    // 1 − 2(qx² + qz²) for a unit quaternion.
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    const cos = Math.max(-1, Math.min(1, upY));
    const thetaDeg = (Math.acos(cos) * 180) / Math.PI;
    const land = this.config.land;
    const label = this.#label?.label ?? null;

    if (thetaDeg <= land.thetaCleanDeg) {
      events.push({ kind: 'land', cleanliness: 'clean', thetaDeg, label });
      this.telemetry?.log({ type: 'trickCompleted', step: inp.step, label: label ?? 'unknown', cleanliness: 'clean', thetaDeg });
      this.#label = null;
      this.#phase = 'ground';
    } else if (thetaDeg <= land.thetaDirtyDeg) {
      events.push({ kind: 'land', cleanliness: 'dirty', thetaDeg, label });
      this.telemetry?.log({ type: 'trickCompleted', step: inp.step, label: label ?? 'unknown', cleanliness: 'dirty', thetaDeg });
      this.#label = null;
      this.#phase = 'ground';
    } else {
      this.#bail(cos < 0 ? 'inverted' : 'over-rotation', inp.step, events);
    }
  }

  /**
   * Interrupt rule (final-physics §3.3): hard collision while airborne. The
   * contact solver spreads a sharp impact across a few steps, so impulses
   * accumulate over `physics.interruptWindowSteps` and the SUM is compared to
   * T_col — see the config doc for the measured separation between a wall
   * crash and a scrappy-landing tail strike. Grounded steps reset the window
   * (ground contact routes through the land check instead).
   */
  #collisionInterrupt(inp: FsmInputs, events: FsmEvent[]): boolean {
    if (inp.grounded) {
      this.#impulseWindow.length = 0;
      return false;
    }
    this.#impulseWindow.push(inp.contactImpulse);
    while (this.#impulseWindow.length > this.config.physics.interruptWindowSteps) {
      this.#impulseWindow.shift();
    }
    let sum = 0;
    for (const v of this.#impulseWindow) sum += v;
    if (sum > this.config.physics.interruptCollisionImpulse) {
      this.#impulseWindow.length = 0;
      this.#bail('hard-impact', inp.step, events);
      return true;
    }
    return false;
  }

  #airTimeout(inp: FsmInputs, events: FsmEvent[]): boolean {
    if (inp.step - this.#airStartStep > this.config.air.timeoutSteps) {
      this.#bail('timeout', inp.step, events);
      return true;
    }
    return false;
  }

  #bail(reason: FailReason, step: number, events: FsmEvent[]): void {
    // Interrupt (§3.3): clear open labels/envelopes; physics continues.
    this.#label = null;
    this.#lastFailReason = reason;
    this.#phase = 'bail';
    this.#bailStepsLeft = Math.max(1, Math.floor(this.config.bail.recoverSteps));
    events.push({ kind: 'bail', reason });
    this.telemetry?.log({ type: 'bail', step, reason });
  }

  // --- air-phase helpers -----------------------------------------------------

  #trackApex(inp: FsmInputs): void {
    if (!this.#apexSeen && inp.pose.lv.y <= 0) {
      this.#apexSeen = true;
      this.#catchWindowEndStep = inp.step + this.catchWindowSteps;
    }
  }

  /**
   * Replant → catch-volume test. Returns which socket volume was hit, or null.
   * A replant is a plant edge (was lifted, now planted) of either foot; the
   * board-local position is padToBoardScale·offsetFromRest around the socket,
   * so the hit test is scale·|offsetFromRest| ≤ catch.volumeRadius.
   */
  #catchAttempt(inp: FsmInputs): 'nose' | 'tail' | 'both' | null {
    if (this.#caught) return null;
    const cfg = this.config.catch;
    const windowOpen = cfg.apexOnly
      ? this.#apexSeen && inp.step <= this.#catchWindowEndStep
      : true;
    if (!windowOpen) return null;

    const scale = this.config.locomotion.padToBoardScale;
    const inVolume = (off: { x: number; y: number }): boolean =>
      scale * Math.hypot(off.x, off.y) <= cfg.volumeRadius;

    const noseReplant = !this.#prevNosePlanted && inp.feet.nose.planted;
    const tailReplant = !this.#prevTailPlanted && inp.feet.tail.planted;
    const noseHit = noseReplant && inVolume(inp.feet.nose.offsetFromRest);
    const tailHit = tailReplant && inVolume(inp.feet.tail.offsetFromRest);

    if (noseHit && tailHit) return 'both';
    if (noseHit) return 'nose';
    if (tailHit) return 'tail';
    return null;
  }

  /** The spec catch factor at this run's assist level (telemetry echo only —
   * ManeuverAssist computes the command value independently from the same
   * config, so the two can never diverge without a test noticing). */
  #catchFactor(): number {
    const cfg = this.config.catch;
    return 1 - cfg.catchGain * cfg.assistScale[this.assistLevel];
  }

  /**
   * M5 extension point: free-foot flicks/sweeps land inside the air-trick
   * window. In M4 lift edges above flickSpeedMin are ROUTED here and logged
   * only — no physics. M5 replaces this with flick/sweep classification.
   */
  #logAirGestures(inp: FsmInputs): void {
    if (!this.#label || inp.step > this.#label.expireStep) return;
    const min = this.config.recognition.flickSpeedMin;
    if (this.#prevNosePlanted && !inp.feet.nose.planted && this.#prevNoseSpeed >= min) {
      this.telemetry?.log({ type: 'airGesture', step: inp.step, foot: 'nose', kind: 'flickCandidate', speed: this.#prevNoseSpeed });
    }
    if (this.#prevTailPlanted && !inp.feet.tail.planted && this.#prevTailSpeed >= min) {
      this.telemetry?.log({ type: 'airGesture', step: inp.step, foot: 'tail', kind: 'flickCandidate', speed: this.#prevTailSpeed });
    }
  }
}
