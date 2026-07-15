/**
 * GestureFSM — the maneuver phase state machine (M4; research/control-grammar
 * §7, final-input-and-trick-spec §3/§5/§7, final-physics §3.3).
 *
 * Phases: 'none' (not riding) | 'ground' | 'pop' | 'air' | 'catch' | 'grind' |
 * 'bail'. Legal edges (the property test pins this exact table):
 *
 *   none   → ground                         (board settles onto the ground)
 *   ground → pop | none                     (pop recognition / lost the ground)
 *   pop    → air | ground | bail            (liftoff / fizzle / interrupt)
 *   air    → catch | ground | grind | bail  (catch / land / GRIND LATCH / interrupt)
 *   catch  → ground | bail                  (land check / interrupt)
 *   grind  → pop | air | ground | bail      (hop-out / slip / low dismount / hard fail)
 *   bail   → none                           (respawn — SimWorld game rule)
 *
 * Grind (M6): air→grind on a soft-snap latch (GrindSystem, geometric contact
 * required — no teleport). Exits: hop reuses the pop path (grind→pop→air);
 * balance slip / foot lift / off-end drop to grind→air (land check resolves);
 * a low speed-end dismounts grind→ground; a hard collision grind→bail. While a
 * grind CANDIDATE is live in the air, air-shuv/flip + catch are suppressed
 * (phase exclusive; final-input-and-trick §3.1).
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
 *  - Shipping assists L1/L2 automatically catch a stable two-contact riding
 *    stance after apex. The player's swipe chooses the trick; they do not have
 *    to lift and re-place a virtual foot in 3D to stop the board.
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

import { TRICK_INTENT_VERSION } from '@slackpad/shared';
import type { SimConfig, Stance, TrickIntentV1 } from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';
import type { FeetSample, FeetState } from '../input/FootTracker';
import type { BoardPose } from '../sim/SimWorld';
import type { RailProximity } from '../sim/rails';
import type { PopRecognition } from './KickArbiter';
import { AirGestureClassifier, labelFor } from './AirGestureClassifier';
import type { AirGesture, AirGestureKind } from './AirGestureClassifier';
import { GrindSystem } from './GrindSystem';
import type { GrindExitReason, GrindInputs, GrindSnapshot, GrindStepResult } from './GrindSystem';

export type GesturePhase = 'none' | 'ground' | 'pop' | 'air' | 'catch' | 'grind' | 'bail';

export type FailReason =
  | 'over-rotation'
  | 'hard-impact'
  | 'inverted'
  | 'timeout'
  | 'out-of-bounds'
  | 'unrideable';

/** Recognition label per policy §3: occurrence + confidence + window. */
export interface RecognitionLabelState {
  label: 'ollie' | 'nollie';
  confidence: number;
  openStep: number;
  /** End of the air-trick recognition window (M5 flicks land inside it). */
  expireStep: number;
  /** Pop prep quality (intensity input for ManeuverAssist). */
  q: number;
  /**
   * M5 open air gesture (flick→flip / sweep→shuv) recognized inside the window,
   * or null. Carries the board-local axis + signed omegaTarget the per-step
   * ManeuverAssist envelope drives. Null keeps the maneuver a plain ollie/nollie.
   */
  air: AirGesture | null;
}

export type FsmEvent =
  | { kind: 'pop'; label: 'ollie' | 'nollie'; q: number }
  | {
      kind: 'catch';
      foot: 'nose' | 'tail' | 'both';
      /** Open air-gesture family at catch (drives quantize axis), or null. */
      gesture: AirGestureKind | null;
      /** Signed completed roll (turns) and yaw (deg) at the catch instant. */
      flipRotations: number;
      shuvDegrees: number;
    }
  | {
      kind: 'land';
      cleanliness: 'clean' | 'dirty';
      thetaDeg: number;
      label: string | null;
      /** Signed measured rotation at land (for the M9 scorer). */
      flipRotations: number;
      shuvDegrees: number;
    }
  | { kind: 'bail'; reason: FailReason }
  | { kind: 'popFizzled' };

export interface FsmInputs {
  feet: FeetState;
  /** Every calibrated contact sample consumed during this physics step. */
  footSamples?: FeetSample[];
  pops: PopRecognition[];
  grounded: boolean;
  pose: BoardPose;
  /** Max board contact impulse (N·s) observed during the previous step. */
  contactImpulse: number;
  /** Vertical-dominant contact impulse (floor/rail support, excludes walls). */
  supportContactImpulse?: number;
  /** Nearest grindable rail readout (SimWorld.railProximity), or null (M6). */
  railProximity: RailProximity | null;
  step: number;
}

export interface FsmResult {
  phase: GesturePhase;
  label: RecognitionLabelState | null;
  lastFailReason: FailReason | null;
  events: FsmEvent[];
  /**
   * Per-step grind result (M6): candidate/latch state + the grindLatch command
   * data ManeuverAssist flushes. Null outside the air/grind phases.
   */
  grind: GrindStepResult | null;
  /** Current categorical player intent; base pop remains the safe fallback. */
  intent: TrickIntentV1 | null;
}

function msToSteps(ms: number, hz: number): number {
  return Math.max(1, Math.round((ms / 1000) * hz));
}

export class GestureFSM {
  #phase: GesturePhase = 'none';
  #label: RecognitionLabelState | null = null;
  #intent: TrickIntentV1 | null = null;
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

  /** Rolling window of AIRBORNE contact impulses (interrupt rule §3.3). */
  #impulseWindow: number[] = [];

  // --- M5 air-gesture recognition + rotation bookkeeping -------------------
  #airClassifier: AirGestureClassifier;
  /** Signed accumulated roll about the board long axis (+Z) since takeoff, rad. */
  #rollAngle = 0;
  /** Signed accumulated yaw about board up (+Y) since takeoff, rad. */
  #shuvAngle = 0;

  // --- M6 grind subsystem (owned like #airClassifier) ----------------------
  #grind: GrindSystem;
  /** Grind result of the LAST update (air/grind only), for observe + assist. */
  #lastGrind: GrindStepResult | null = null;

  private readonly airTrickWindowSteps: number;
  private readonly catchWindowSteps: number;

  constructor(
    private readonly config: SimConfig,
    private readonly assistLevel: 0 | 1 | 2,
    private readonly stance: Stance,
    private readonly telemetry?: Telemetry,
  ) {
    const hz = config.physics.hz;
    this.airTrickWindowSteps = msToSteps(config.recognition.airTrickWindowMs, hz);
    this.catchWindowSteps = msToSteps(config.catch.windowMs, hz);
    this.#airClassifier = new AirGestureClassifier(config, stance, telemetry);
    this.#grind = new GrindSystem(config, assistLevel, telemetry);
  }

  /** Current phase (read by the KickArbiter gate and the checkpoint hash). */
  get phase(): GesturePhase {
    return this.#phase;
  }

  get label(): RecognitionLabelState | null {
    if (!this.#label) return null;
    return { ...this.#label, air: this.#label.air ? { ...this.#label.air } : null };
  }

  get intent(): TrickIntentV1 | null {
    return this.#intent ? structuredClone(this.#intent) : null;
  }

  /** Signed completed roll (turns) since the pop — read by tests/telemetry. */
  get flipRotations(): number {
    return this.#rollAngle / (2 * Math.PI);
  }

  /** Signed completed yaw (degrees) since the pop. */
  get shuvDegrees(): number {
    return (this.#shuvAngle * 180) / Math.PI;
  }

  get lastFailReason(): FailReason | null {
    return this.#lastFailReason;
  }

  /**
   * A finite level boundary is a simulation failure, not a user-commanded
   * teleport. SimWorld has already returned the board to its spawn when this
   * runs; keep the visible FSM, telemetry, and HUD in sync with that recovery.
   */
  recoverFromWorld(reason: FailReason, step: number): void {
    const from = this.#phase;
    const flipRotations = this.flipRotations;
    const shuvDegrees = this.shuvDegrees;
    this.#label = null;
    this.#intent = null;
    this.#grind.reset();
    this.#lastGrind = null;
    this.#lastFailReason = reason;
    this.#phase = 'none';
    this.#bailStepsLeft = 0;
    this.#impulseWindow.length = 0;
    this.#airClassifier.reset();
    this.telemetry?.log({ type: 'bail', step, reason, flipRotations, shuvDegrees });
    this.telemetry?.log({ type: 'respawn', step });
    if (from !== this.#phase) {
      this.telemetry?.log({ type: 'phaseChanged', step, from, to: this.#phase });
    }
  }

  /**
   * Grind observation for ObserveState.grind (M6): {active, family, balance,
   * candidate}, or null when there is neither a live candidate nor an active
   * grind. Derived from the last update's grind result so it is null outside the
   * air/grind phases.
   */
  grindObservation(): GrindSnapshot | null {
    const g = this.#lastGrind;
    if (!g || (!g.active && !g.candidate)) return null;
    return {
      active: g.active,
      family: g.family ?? 'fifty-fifty',
      balance: g.balance,
      candidate: g.candidate,
    };
  }

  update(inp: FsmInputs): FsmResult {
    const events: FsmEvent[] = [];
    const from = this.#phase;
    // Grind result is recomputed each step by the air/grind cases; null elsewhere.
    this.#lastGrind = null;

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
        this.#integrateRotation(inp);
        this.#trackApex(inp);
        // Grind evaluation (airborne here): a soft-snap latch opens grind; a live
        // candidate suppresses air-shuv/flip + catch so a boardslide approach is
        // never misread as a shuv (phase exclusive, §3.1). Rails sit above the
        // grounded band, so the latch never races the land check.
        const gr = this.#grind.update(this.#grindInputs(inp, /*canLatch*/ true));
        this.#lastGrind = gr;
        if (gr.latchedThisStep) {
          this.#phase = 'grind';
          break;
        }
        // Height alone detects a landing too late on a pitched deck: the nose
        // or tail can hit, bounce, and self-level before the centre reaches the
        // old grounded band. A reported contact-force event near the floor is
        // the first physical landing and must be judged at that pose. Grind gets
        // first refusal above so real rail contacts still latch.
        const groundContact =
          (inp.supportContactImpulse ?? 0) > 0 &&
          inp.pose.p.y <= this.config.physics.boardLength * 0.62 &&
          inp.pose.lv.y < -0.25;
        if (inp.grounded || groundContact) {
          this.#landCheck(inp, events);
          break;
        }
        if (this.#collisionInterrupt(inp, events)) break;
        if (this.#airTimeout(inp, events)) break;
        if (!gr.candidate) {
          this.#classifyAir(inp);
          const hit = this.#catchAttempt(inp);
          if (hit) {
            this.#caught = true;
            this.#phase = 'catch';
            events.push(this.#catchEvent(hit));
            this.telemetry?.log({ type: 'catch', step: inp.step, foot: hit, factor: this.#catchFactor() });
          }
        }
        break;
      }

      case 'catch': {
        // Catch assistance must not steal a rail approach. A held stance may
        // auto-catch at apex while actual rail contact happens later on
        // descent, so keep the physical grind candidate/latch path live.
        const gr = this.#grind.update(this.#grindInputs(inp, /*canLatch*/ true));
        this.#lastGrind = gr;
        if (gr.latchedThisStep) {
          this.#phase = 'grind';
          break;
        }
        const groundContact =
          (inp.supportContactImpulse ?? 0) > 0 &&
          inp.pose.p.y <= this.config.physics.boardLength * 0.62;
        if (inp.grounded || groundContact) {
          this.#landCheck(inp, events);
          break;
        }
        if (this.#collisionInterrupt(inp, events)) break;
        this.#integrateRotation(inp);
        this.#airTimeout(inp, events);
        break;
      }

      case 'grind': {
        const gr = this.#grind.update(this.#grindInputs(inp, /*canLatch*/ false));
        this.#lastGrind = gr;
        if (gr.exit) this.#exitGrind(gr.exit, inp, events);
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

    return {
      phase: this.#phase,
      label: this.label,
      lastFailReason: this.#lastFailReason,
      events,
      grind: this.#lastGrind,
      intent: this.intent,
    };
  }

  // --- grind helpers (M6) --------------------------------------------------

  /** Assemble the plain-data GrindInputs from the FSM step inputs. */
  #grindInputs(inp: FsmInputs, canLatch: boolean): GrindInputs {
    return {
      rail: inp.railProximity,
      pose: inp.pose,
      feet: inp.feet,
      canLatch,
      recentPop: inp.step - this.#popStep <= this.config.grind.recentPopSteps,
      // A recognised pop while grinding is an ollie-out hop.
      hopRequested: inp.pops.length > 0,
      contactImpulse: inp.contactImpulse,
      step: inp.step,
    };
  }

  /** Resolve a grind exit into the right phase transition (GrindSystem cleared its latch). */
  #exitGrind(reason: GrindExitReason, inp: FsmInputs, events: FsmEvent[]): void {
    switch (reason) {
      case 'hop': {
        // Ollie-out: reuse the pop path (grind→pop→air) so the impulse + air
        // bookkeeping are exactly the ground ollie's. Hop strength is a fixed
        // config impulse mapped back to a prep quality.
        const pop = this.#hopPop(inp.pops[0]);
        this.#openPop(pop, inp.step);
        events.push({ kind: 'pop', label: pop.label, q: pop.q });
        break;
      }
      case 'speed-end':
        // Low dismount rolls back onto the ground; an elevated speed-end drops to
        // the air and the land check resolves it.
        this.#phase = inp.grounded ? 'ground' : 'air';
        if (!inp.grounded) this.#enterAir(inp.step);
        break;
      case 'foot-lift':
      case 'balance-fail':
        // Slip / step-off into the air — recoverable; the land check (or bail by
        // cone) resolves it. Never an inescapable state (research §5).
        this.#enterAir(inp.step);
        break;
      case 'collision':
        this.#bail('hard-impact', inp.step, events);
        break;
    }
  }

  /** A synthetic pop for an ollie-out hop: fixed exit-hop impulse → prep quality q. */
  #hopPop(recognized: PopRecognition | undefined): PopRecognition {
    const pop = this.config.pop;
    const span = pop.jMax - pop.jMin;
    const q = span > 1e-6 ? Math.max(0, Math.min(1, (this.config.grind.exitHopImpulse - pop.jMin) / span)) : 0;
    return { step: 0, label: recognized?.label ?? 'ollie', q };
  }

  /** Enter the air phase fresh (used by grind slip/drop exits). */
  #enterAir(step: number): void {
    this.#phase = 'air';
    this.#airStartStep = step;
    this.#apexSeen = false;
    this.#caught = false;
    this.#rollAngle = 0;
    this.#shuvAngle = 0;
    this.#impulseWindow.length = 0;
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
      air: null,
    };
    this.#intent = {
      version: TRICK_INTENT_VERSION,
      attemptId: `${step}:${pop.label}`,
      popSide: pop.label === 'ollie' ? 'tail' : 'nose',
      base: pop.label,
      family: 'ollie',
      direction: 'none',
      label: pop.label,
      gestureSpeed: 0,
      gestureAccuracy: 1,
      confidence,
      fallback: true,
      stance: this.stance,
      source: { popStep: step, recognizedStep: null },
    };
    this.telemetry?.log({ type: 'trickIntent', step, intent: this.intent! });
    this.#lastFailReason = null; // a new attempt clears the old failure
    this.#impulseWindow.length = 0; // fresh maneuver, fresh interrupt window
    this.#airClassifier.reset(); // fresh maneuver, fresh flick/sweep evidence
    this.#grind.reset(); // fresh maneuver, fresh grind candidate/latch (keeps cooldown)
    this.#rollAngle = 0;
    this.#shuvAngle = 0;
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
    // Names come from the OUTCOME (measured board-state history), never from the
    // recognized intent — a flick whose rotation died early lands as what it
    // physically was (final-input-and-trick-spec §7; no silent success).
    const label = this.#outcomeLabel();
    const flipRotations = this.flipRotations;
    const shuvDegrees = this.shuvDegrees;

    const finish = (cleanliness: 'clean' | 'dirty'): void => {
      events.push({ kind: 'land', cleanliness, thetaDeg, label, flipRotations, shuvDegrees });
      this.telemetry?.log({
        type: 'trickCompleted',
        step: inp.step,
        label,
        cleanliness,
        thetaDeg,
        flipRotations,
        shuvDegrees,
      });
      this.#label = null;
      this.#intent = null;
      this.#phase = 'ground';
    };

    const cleanLimit = land.thetaCleanDeg + land.cleanAssistBonusDeg[this.assistLevel];
    const dirtyLimit = land.thetaDirtyDeg + land.dirtyAssistBonusDeg[this.assistLevel];
    if (thetaDeg <= cleanLimit) finish('clean');
    else if (thetaDeg <= dirtyLimit) finish('dirty');
    else this.#bail(cos < 0 ? 'inverted' : 'over-rotation', inp.step, events);
  }

  /**
   * OUTCOME label from the measured rotation history (§7 "names from board state
   * history"). Prefers the dominant completed rotation over its naming threshold;
   * falls back to the base pop label (ollie/nollie) when neither flip nor shuv
   * accrued enough — so a flicked-but-fizzled attempt reads honestly.
   */
  #outcomeLabel(): string {
    const flip = this.config.flip;
    const rec = this.config.recognition;
    const base = this.#label?.label ?? 'ollie';
    const turns = Math.abs(this.#rollAngle) / (2 * Math.PI);
    const yawDeg = Math.abs((this.#shuvAngle * 180) / Math.PI);
    const flipOk = turns >= flip.nameMinTurns;
    const shuvOk = yawDeg >= rec.shuvNameMinDeg;
    if (flipOk && (!shuvOk || turns / flip.nameMinTurns >= yawDeg / rec.shuvNameMinDeg)) {
      return labelFor('flip', this.#rollAngle >= 0 ? 1 : -1);
    }
    if (shuvOk) return labelFor('shuv', this.#shuvAngle >= 0 ? 1 : -1);
    return base;
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
    // A bailed maneuver still has a rotation history (§7: every failure has
    // telemetry; the M9 scorer reads the partial rotation).
    const flipRotations = this.flipRotations;
    const shuvDegrees = this.shuvDegrees;
    // Interrupt (§3.3): clear open labels/envelopes; physics continues.
    this.#label = null;
    this.#intent = null;
    this.#grind.reset(); // a bail clears any grind candidate/latch too
    this.#lastFailReason = reason;
    this.#phase = 'bail';
    this.#bailStepsLeft = Math.max(1, Math.floor(this.config.bail.recoverSteps));
    events.push({ kind: 'bail', reason });
    this.telemetry?.log({ type: 'bail', step, reason, flipRotations, shuvDegrees });
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
    // Default/strong assists interpret a held two-finger stance as "stay over
    // the board" and catch automatically on descent. L0 preserves the manual
    // replant path for players who explicitly choose it.
    if (this.assistLevel > 0 && this.#apexSeen && inp.feet.bothPlanted) {
      const gesture = this.#label?.air;
      if (!gesture) return 'both';
      // Never freeze a flip while the grip tape faces the floor. Wait for the
      // assisted envelope to carry it near a complete turn, then catch/damp.
      if (gesture.kind === 'flip' && Math.abs(this.flipRotations) >= 0.94) return 'both';
      if (gesture.kind === 'shuv' && Math.abs(this.shuvDegrees) >= this.config.recognition.shuvTargetDeg * 0.85) {
        return 'both';
      }
    }
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
   * M5 flick/sweep classification (final-input-and-trick-spec §5). Runs only
   * inside the air-trick recognition window; feeds the free foot's calibrated
   * pad velocity to the classifier and mirrors the open air gesture onto the
   * label so ManeuverAssist can drive the per-step envelope. Flick-vs-steer
   * (§3.1) is resolved by construction: this only runs airborne, never on ground.
   */
  #classifyAir(inp: FsmInputs): void {
    if (!this.#label || inp.step > this.#label.expireStep) return;
    const samples = inp.footSamples ?? [];
    let g: AirGesture | null = null;
    if (samples.length > 0) {
      for (const sample of samples) {
        const feet = sample.state;
        g = this.#airClassifier.update({
          step: inp.step,
          dt: sample.dtSeconds,
          nose: { planted: feet.nose.planted, vel: feet.nose.vel },
          tail: { planted: feet.tail.planted, vel: feet.tail.vel },
        });
      }
    } else {
      g = this.#airClassifier.update({
        step: inp.step,
        dt: 1 / this.config.physics.hz,
        nose: { planted: inp.feet.nose.planted, vel: inp.feet.nose.vel },
        tail: { planted: inp.feet.tail.planted, vel: inp.feet.tail.vel },
      });
    }
    this.#label.air = g;
    if (g) {
      const direction: TrickIntentV1['direction'] =
        g.label === 'kickflip'
          ? 'heelside'
          : g.label === 'heelflip'
            ? 'toeside'
            : g.label === 'fs-shuv'
              ? 'frontside'
              : 'backside';
      const nextIntent: TrickIntentV1 = {
        version: TRICK_INTENT_VERSION,
        attemptId: this.#intent?.attemptId ?? `${this.#popStep}:${this.#label.label}`,
        popSide: this.#label.label === 'ollie' ? 'tail' : 'nose',
        base: this.#label.label,
        family: g.kind,
        direction,
        label: g.label,
        gestureSpeed: g.intensity,
        gestureAccuracy: g.accuracy,
        confidence: g.confidence,
        fallback: false,
        stance: this.stance,
        source: { popStep: this.#popStep, recognizedStep: inp.step },
      };
      const changed =
        this.#intent?.label !== nextIntent.label ||
        this.#intent?.confidence !== nextIntent.confidence;
      this.#intent = nextIntent;
      if (changed) this.telemetry?.log({ type: 'trickIntent', step: inp.step, intent: this.intent! });
    }
  }

  /**
   * Accumulate the board's roll about its own long axis (+Z) and yaw about its
   * up axis (+Y) since takeoff, by integrating the pre-step angular velocity
   * projected onto the CURRENT board axes (deterministic left-Riemann sum). This
   * is a net-rotation signal: a landed single flip reads ≈ ±1.0 turn by design (a
   * kickflip IS one 360° roll — the catch freezes it there; uncaught it
   * over-rotates), and a sub-threshold flick that never completes stays partial.
   * It is intentionally COARSE in magnitude — fine-grained flick strength lives
   * in the recognized intensity s (flipRecognized.intensity), while the SIGN
   * here is the load-bearing part for outcome naming. Per-axis projection (not a
   * single swing-twist decomposition) is used deliberately: it keeps roll and
   * yaw independent, so a big kickflip roll never leaks into the shuv-yaw signal
   * and misname a flip as a shuv. Never writes the body.
   */
  #integrateRotation(inp: FsmInputs): void {
    const dt = 1 / this.config.physics.hz;
    const q = inp.pose.q;
    const av = inp.pose.av;
    // World images of the board local +Z (long) and +Y (up) axes.
    const zx = 2 * (q.x * q.z + q.w * q.y);
    const zy = 2 * (q.y * q.z - q.w * q.x);
    const zz = 1 - 2 * (q.x * q.x + q.y * q.y);
    const yx = 2 * (q.x * q.y - q.w * q.z);
    const yy = 1 - 2 * (q.x * q.x + q.z * q.z);
    const yz = 2 * (q.y * q.z + q.w * q.x);
    this.#rollAngle += (av.x * zx + av.y * zy + av.z * zz) * dt;
    this.#shuvAngle += (av.x * yx + av.y * yy + av.z * yz) * dt;
  }

  /** Build the enriched catch event (carries the outcome rotation for quantize). */
  #catchEvent(foot: 'nose' | 'tail' | 'both'): Extract<FsmEvent, { kind: 'catch' }> {
    return {
      kind: 'catch',
      foot,
      gesture: this.#label?.air ? this.#label.air.kind : null,
      flipRotations: this.flipRotations,
      shuvDegrees: this.shuvDegrees,
    };
  }
}
