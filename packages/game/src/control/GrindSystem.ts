/**
 * GrindSystem — grind detection, candidate signalling, soft-snap latch, balance,
 * and exits (M6; final-physics-animation-camera-spec §4, research/physics-and-
 * game-feel §6, final-input-and-trick-spec §3.1/§5).
 *
 * Owned and driven by GestureFSM (exactly as the FSM owns AirGestureClassifier):
 * it consumes PLAIN DATA only — a RailProximity readout (SimWorld's narrow query),
 * the board pose, the feet, and a few phase flags — and returns a GrindStepResult
 * the FSM turns into phase transitions and ManeuverAssist turns into a clamped
 * grindLatch command. It NEVER touches the body.
 *
 * THE FAIRNESS MANDATE (research §6.4/§9) is enforced structurally here:
 *  1. SOFT SNAP, NEVER TELEPORT — latch requires GEOMETRIC CONTACT (board within
 *     rSnap[assist] of the rail centre-line laterally AND within rSnap of the
 *     per-family ride height vertically — tight in BOTH axes; there is no loose
 *     vertical band, which would be vertical magnetism). The latch itself is a
 *     force command; nothing is repositioned.
 *  2. VISIBLE SNAP — a CANDIDATE (larger candidateVolumeRadius, plausible speed +
 *     approach angle, airborne/recent-pop) is signalled BEFORE any latch, with
 *     `grindCandidate` telemetry, so magnetism is never invisible.
 *  3. FORGIVING BALANCE, NO DEATH LOOP — a wide survive band, self-centring drift,
 *     and a post-slip re-latch cooldown; a slip exits to AIR (recoverable), never
 *     an inescapable state.
 *  4. EXPLICIT ENVELOPE REJECTION — a near-but-wrong-speed/angle approach emits
 *     `grindRejected {reason}` and NEVER latches.
 *  5. PHASE EXCLUSIVE — while a candidate is active in the air (approach) or a
 *     grind is latched, the FSM suppresses air-shuv/flip and catch (the FSM gates
 *     on `candidateActive()` / phase==='grind').
 *
 * Determinism: step arithmetic + pure maths on plain data; no wall clock, no
 * Math.random.
 */

import type { GrindFamily, SimConfig, Vec3 } from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';
import type { FeetState } from '../input/FootTracker';
import type { BoardPose } from '../sim/SimWorld';
import type { RailProximity } from '../sim/rails';

export type GrindExitReason = 'hop' | 'speed-end' | 'foot-lift' | 'balance-fail' | 'collision';
export type GrindRejectReason = 'too-slow' | 'too-fast' | 'bad-angle';

export interface GrindInputs {
  rail: RailProximity | null;
  pose: BoardPose;
  feet: FeetState;
  /** FSM is airborne (air phase) — a latch may OPEN this step. */
  canLatch: boolean;
  /** A pop was recognised within recentPopSteps — candidate gate (§6.1). */
  recentPop: boolean;
  /** A pop/kick was recognised THIS step while grinding → ollie-out hop. */
  hopRequested: boolean;
  /** Max board contact impulse (N·s) last step (collision interrupt). */
  contactImpulse: number;
  step: number;
}

/** Grind observation exposed on ObserveState.grind + carried into FsmResult. */
export interface GrindSnapshot {
  active: boolean;
  family: GrindFamily;
  balance: number;
  candidate: boolean;
}

export interface GrindStepResult {
  candidate: boolean;
  /** Predicted (candidate) or latched grind family, or null when neither. */
  family: GrindFamily | null;
  active: boolean;
  balance: number;
  /** True on the step the latch OPENS. */
  latchedThisStep: boolean;
  /** Set on the step the grind EXITS, else null. */
  exit: GrindExitReason | null;
  /** Set when a near approach is rejected by the envelope, else null. */
  rejected: GrindRejectReason | null;
  /** True when balance is inside the clean band this step (score fraction). */
  cleanThisStep: boolean;
  // --- grindLatch command data ---------------------------------------------
  /** True when this carries the airborne APPROACH orientation snap (not a latch). */
  approachOnly: boolean;
  axis: Vec3 | null;
  perp: Vec3 | null;
  anchor: Vec3 | null;
  lateralOffset: number;
  springGain: number;
  balanceLateral: number;
  /** One-shot upward impulse for a physical rail-clearing dismount. */
  dismountLiftImpulse: number;
}

function inactiveResult(candidate: boolean, family: GrindFamily | null, rejected: GrindRejectReason | null): GrindStepResult {
  return {
    candidate,
    family,
    active: false,
    balance: 0,
    latchedThisStep: false,
    exit: null,
    rejected,
    cleanThisStep: false,
    approachOnly: false,
    axis: null,
    perp: null,
    anchor: null,
    lateralOffset: 0,
    springGain: 0,
    balanceLateral: 0,
    dismountLiftImpulse: 0,
  };
}

export class GrindSystem {
  #latched = false;
  #family: GrindFamily = 'fifty-fifty';
  #railId: string | null = null;
  #balance = 0;
  #candidate = false;
  #candidateFamily: GrindFamily | null = null;
  #durationSteps = 0;
  #cleanSteps = 0;
  #cooldownUntilStep = 0;
  #lastRejectStep = -100;

  constructor(
    private readonly config: SimConfig,
    private readonly assistLevel: 0 | 1 | 2,
    private readonly telemetry?: Telemetry,
  ) {}

  /** Currently latched? */
  get active(): boolean {
    return this.#latched;
  }

  /**
   * A candidate is active in the air right now (approach window). The FSM gates
   * air-shuv/flip + catch off this so a boardslide approach is never misread as
   * a shuv (final-input-and-trick §3.1: "grind candidate + lateral yaw near rail
   * → grind path; phase exclusive").
   */
  candidateActive(): boolean {
    return this.#candidate;
  }

  /** Observation for ObserveState.grind (null when neither candidate nor active). */
  snapshot(): GrindSnapshot | null {
    if (!this.#latched && !this.#candidate) return null;
    return {
      active: this.#latched,
      family: this.#latched ? this.#family : this.#candidateFamily ?? 'fifty-fifty',
      balance: this.#balance,
      candidate: this.#candidate,
    };
  }

  /** Clear on a fresh maneuver / reset (called by the FSM on pop-open + respawn). */
  reset(): void {
    this.#latched = false;
    this.#balance = 0;
    this.#candidate = false;
    this.#candidateFamily = null;
    this.#railId = null;
    this.#durationSteps = 0;
    this.#cleanSteps = 0;
    // cooldown intentionally persists across a pop so a hop can't instantly re-latch.
  }

  update(inp: GrindInputs): GrindStepResult {
    const g = this.config.grind;
    const rail = inp.rail;

    // --- Geometry from the nearest rail + board pose ------------------------
    let approach: Approach | null = null;
    if (rail) approach = this.#approach(rail, inp.pose);

    // --- Latched: integrate + check exits ----------------------------------
    if (this.#latched) {
      return this.#updateLatched(inp, rail, approach);
    }

    // --- Not latched: candidate signalling + latch decision ----------------
    this.#candidate = false;
    this.#candidateFamily = null;

    if (!approach || !rail) return inactiveResult(false, null, null);

    const airborneOrRecent = inp.canLatch || inp.recentPop;
    const nearHoriz = approach.lateralDist <= g.candidateVolumeRadius;
    if (!airborneOrRecent || !nearHoriz) return inactiveResult(false, null, null);

    // Envelope: speed window + family approach angle. A near approach that fails
    // the envelope is REJECTED (bounce/scrape; never a silent snap) — §3.1/§7.
    const speedReason = this.#speedReject(approach.relSpeed, g);
    const family = this.#classify(approach.acuteDeg, g);
    if (speedReason || family === null) {
      const reason: GrindRejectReason = speedReason ?? 'bad-angle';
      if (inp.step - this.#lastRejectStep >= 6) {
        this.#lastRejectStep = inp.step;
        this.telemetry?.log({ type: 'grindRejected', step: inp.step, reason, railId: rail.railId });
      }
      return inactiveResult(false, null, reason);
    }

    // Latch only from the air, past the re-latch cooldown, with GEOMETRIC CONTACT
    // in BOTH axes (tight rSnap laterally AND vertically — no teleport from far).
    const rSnap = g.rSnap[this.assistLevel];
    const rideY = rail.topY + (family === 'fifty-fifty' ? g.rideHeightFiftyFifty : g.rideHeightBoardslide);
    const heightDelta = inp.pose.p.y - rideY;

    // Candidate is now live (visible BEFORE latch).
    if (!this.#candidate) {
      this.telemetry?.log({
        type: 'grindCandidate',
        step: inp.step,
        family,
        railId: rail.railId,
        acuteDeg: approach.acuteDeg,
        relSpeed: approach.relSpeed,
        lateralDist: approach.lateralDist,
        heightDelta,
      });
    }
    this.#candidate = true;
    this.#candidateFamily = family;

    const contact = approach.lateralDist <= rSnap && Math.abs(heightDelta) <= Math.max(rSnap, 0.03);
    if (inp.canLatch && inp.step >= this.#cooldownUntilStep && contact) {
      return this.#openLatch(inp, rail, approach, family);
    }

    // Airborne candidate not yet latched: emit the APPROACH orientation snap — a
    // yaw-align-only command (no lateral spring, no positional magnetism) that
    // assists the player's rotation into the family orientation "on entry" so a
    // boardslide can actually be entered before the phase-exclusive gate would
    // otherwise freeze its yaw near the rail. Assist-scaled (springGain 0 at L0).
    const res = inactiveResult(true, family, null);
    if (inp.canLatch && inp.step >= this.#cooldownUntilStep) {
      res.approachOnly = true;
      res.axis = { ...approach.tangent };
      res.perp = { ...rail.perp };
      res.springGain = g.latchLateralSpring[this.assistLevel];
    }
    return res;
  }

  // --- latch lifecycle -----------------------------------------------------

  #openLatch(inp: GrindInputs, rail: RailProximity, approach: Approach, family: GrindFamily): GrindStepResult {
    this.#latched = true;
    this.#family = family;
    this.#railId = rail.railId;
    this.#durationSteps = 0;
    this.#cleanSteps = 0;
    // Entry imbalance from how crooked the landing was (bounded well inside the
    // survive band): a dead-centre entry starts ~stable, a crooked one leans.
    this.#balance = clamp(approach.lateralOffset * this.config.grind.balanceOffsetWeight, -0.3, 0.3);
    this.#candidate = true;
    this.#candidateFamily = family;
    this.telemetry?.log({ type: 'grindLatched', step: inp.step, family, railId: rail.railId });
    return this.#latchResult(inp, rail, approach, false);
  }

  #updateLatched(inp: GrindInputs, rail: RailProximity | null, approach: Approach | null): GrindStepResult {
    const g = this.config.grind;
    this.#durationSteps += 1;

    // Lost the rail entirely (data gone) — defensive dismount to air.
    if (!rail || !approach || rail.railId !== this.#railId) {
      return this.#exit(inp, 'foot-lift', rail, approach);
    }

    // --- Balance integration (lateral offset + roll − foot counter-lean) ----
    const dt = 1 / this.config.physics.hz;
    const footBias = inp.feet.bothPlanted ? inp.feet.segment.midpointOffsetFromRest.x : 0;
    const tilt = this.#railTilt(inp.pose, rail);
    const disturbance = g.balanceOffsetWeight * approach.lateralOffset + g.balanceRollWeight * tilt;
    const control = g.balanceInputGain * footBias;
    this.#balance += (g.balanceGain * disturbance - control) * dt;
    this.#balance -= this.#balance * g.balanceSelfCenter * dt;
    this.#balance = clamp(this.#balance, -g.balanceClampMax, g.balanceClampMax);
    const clean = Math.abs(this.#balance) < g.cleanBalanceBand;
    if (clean) this.#cleanSteps += 1;

    // --- Exits (priority: hard interrupt → hop → step-off → speed → balance) -
    if (inp.contactImpulse > g.interruptImpulse) return this.#exit(inp, 'collision', rail, approach);
    if (inp.hopRequested) return this.#exit(inp, 'hop', rail, approach);
    if (!inp.feet.nose.planted && !inp.feet.tail.planted) return this.#exit(inp, 'foot-lift', rail, approach);
    if (approach.relSpeed < g.speedEndSpeed) return this.#exit(inp, 'speed-end', rail, approach);
    if (Math.abs(this.#balance) > g.balanceLimit) return this.#exit(inp, 'balance-fail', rail, approach);

    return this.#latchResult(inp, rail, approach, clean);
  }

  #exit(
    inp: GrindInputs,
    reason: GrindExitReason,
    rail: RailProximity | null,
    approach: Approach | null,
  ): GrindStepResult {
    const g = this.config.grind;
    const family = this.#family;
    const durationSteps = this.#durationSteps;
    const cleanFraction = durationSteps > 0 ? this.#cleanSteps / durationSteps : 0;
    const balanceAtExit = this.#balance;

    this.telemetry?.log({ type: 'grindExit', step: inp.step, reason, family, durationSteps });
    this.telemetry?.log({ type: 'grindCompleted', step: inp.step, family, durationSteps, cleanFraction });

    this.#latched = false;
    this.#candidate = false;
    this.#candidateFamily = null;
    this.#balance = 0;
    this.#railId = null;
    // Suppress a re-latch for a cooldown so a slip cannot instantly re-latch
    // within rSnap — the anti-death-loop guard (research §5).
    this.#cooldownUntilStep = inp.step + Math.max(1, Math.floor(g.relatchCooldownSteps));

    const res = inactiveResult(false, family, null);
    res.exit = reason;
    res.balance = balanceAtExit;
    // Kick the board OFF the rail on any air-bound dismount (slip / step-off /
    // speed-end) so it visibly leaves laterally, falls, and re-grounds normally
    // rather than resting on an elevated rail until the air timeout bails it (a
    // "bail after clean" — the §9 unfairness signal). Carried as a one-shot
    // grindLatch whose only force is the lateral kick (springGain 0). F = J / dt.
    // Hop (pop impulse handles it) and collision (→ bail) get no kick.
    const kickExit = reason === 'balance-fail' || reason === 'speed-end' || reason === 'foot-lift';
    if (kickExit && rail && approach) {
      const dt = 1 / this.config.physics.hz;
      // Kick toward the imbalanced side (or a deterministic default when centred).
      const side = balanceAtExit !== 0 ? Math.sign(balanceAtExit) : 1;
      res.axis = { ...approach.tangent };
      res.perp = { ...rail.perp };
      res.family = family;
      res.springGain = 0;
      res.lateralOffset = 0;
      res.balanceLateral = side * (g.slipLateralImpulse / dt);
      res.dismountLiftImpulse = g.dismountLiftImpulse;
    }
    return res;
  }

  #latchResult(inp: GrindInputs, rail: RailProximity, approach: Approach, clean: boolean): GrindStepResult {
    const g = this.config.grind;
    const springGain = g.latchLateralSpring[this.assistLevel];
    // Balance manifests as a lateral force (bounded) so an imbalanced grind
    // visibly drifts toward the fall — the meter is not purely cosmetic.
    const balanceLateral = clamp(this.#balance / g.balanceLimit, -1.5, 1.5) * (g.latchLateralForceMax * 0.3);
    return {
      candidate: true,
      family: this.#family,
      active: true,
      balance: this.#balance,
      latchedThisStep: this.#durationSteps === 0,
      exit: null,
      rejected: null,
      cleanThisStep: clean,
      approachOnly: false,
      axis: { ...approach.tangent },
      perp: { ...rail.perp },
      anchor: { ...rail.anchor },
      lateralOffset: approach.lateralOffset,
      springGain,
      balanceLateral,
      dismountLiftImpulse: 0,
    };
  }

  // --- geometry helpers ----------------------------------------------------

  /** Per-step approach signals from the rail + board pose. */
  #approach(rail: RailProximity, pose: BoardPose): Approach {
    const lv = pose.lv;
    const t = rail.tangent;
    // Along-rail (relative) speed and total horizontal speed.
    const vTan = lv.x * t.x + lv.z * t.z;
    const relSpeed = Math.abs(vTan);
    // Board forward (+Z nose) in world, projected horizontal.
    const fwd = quatForward(pose.q);
    const fh = Math.hypot(fwd.x, fwd.z) || 1;
    const fx = fwd.x / fh;
    const fz = fwd.z / fh;
    // Acute angle between board-forward and rail tangent, folded to [0, 90].
    const dot = Math.abs(fx * t.x + fz * t.z);
    const acuteDeg = (Math.acos(clamp(dot, 0, 1)) * 180) / Math.PI;
    return {
      relSpeed,
      acuteDeg,
      lateralDist: rail.lateralDist,
      lateralOffset: rail.lateralOffset,
      tangent: { x: t.x, y: 0, z: t.z },
    };
  }

  /** Signed lean of the board relative to rail-up (world +Y), along the rail perp. */
  #railTilt(pose: BoardPose, rail: RailProximity): number {
    const up = quatUp(pose.q);
    // How much board-up leans toward the rail perpendicular (a sideways tilt).
    return up.x * rail.perp.x + up.z * rail.perp.z;
  }

  #speedReject(relSpeed: number, g: SimConfig['grind']): GrindRejectReason | null {
    if (relSpeed < g.vMin) return 'too-slow';
    if (relSpeed > g.vMax) return 'too-fast';
    return null;
  }

  #classify(acuteDeg: number, g: SimConfig['grind']): GrindFamily | null {
    if (acuteDeg <= g.fiftyFiftyEnvelopeDeg) return 'fifty-fifty';
    if (Math.abs(acuteDeg - 90) <= g.boardslideEnvelopeDeg) return 'boardslide';
    return null;
  }
}

interface Approach {
  relSpeed: number;
  acuteDeg: number;
  lateralDist: number;
  lateralOffset: number;
  tangent: Vec3;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < lo ? lo : v > hi ? hi : v;
}

/** World image of the board-local +Z (nose) axis. */
function quatForward(q: BoardPose['q']): Vec3 {
  return {
    x: 2 * (q.x * q.z + q.w * q.y),
    y: 2 * (q.y * q.z - q.w * q.x),
    z: 1 - 2 * (q.x * q.x + q.y * q.y),
  };
}

/** World image of the board-local +Y (up) axis. */
function quatUp(q: BoardPose['q']): Vec3 {
  return {
    x: 2 * (q.x * q.y - q.w * q.z),
    y: 1 - 2 * (q.x * q.x + q.z * q.z),
    z: 2 * (q.y * q.z + q.w * q.x),
  };
}
