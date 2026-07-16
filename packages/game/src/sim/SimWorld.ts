/**
 * SimWorld — the deterministic Rapier wrapper and the single step authority.
 *
 * Hard rules (final-technical-architecture §4, final-physics §2):
 *  - ONE physics world; the integer `step` counter is THE clock.
 *  - Fixed timestep 1 / physics.hz; `world.step()` is the only integrator call.
 *  - Identical construction order every reset (delegated to the level builder).
 *  - Seeded PRNG only — NO Math.random, NO Date.now, NO wall clock in the sim.
 *
 * SimWorld owns physics + the step counter + pose snapshots (for render
 * interpolation). It knows nothing about input, recognition, telemetry, or
 * recording — those live one layer up in AgentHarness.
 */

import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type {
  EventQueue,
  RigidBody,
  World,
} from '@dimforge/rapier3d-deterministic-compat';
import type { Quat, SimConfig, Vec3 } from '@slackpad/shared';
import { getLevelBuilder } from './levels/index';
import type { Rng } from './levels/types';
import type { GroundCommand } from '../control/GroundCommand';
import type { ManeuverCommand } from '../control/ManeuverCommand';
import { nearestRail } from './rails';
import type { RailDescriptor, RailProximity } from './rails';
import { grindLatchImpulse } from './grindForces';
import { skateboardTruckSteering } from './skateboardTrucks';
import {
  SkateboardContactSolver,
  type SkateWheelId,
  type SkateWheelObservation,
} from './SkateboardContactSolver';
import { positiveSubstepCount } from './simRates';
import {
  isRideableWheelSupport,
  TransitionAssist,
  type TransitionAssistAction,
} from './TransitionAssist';

/** Full rigid-body observation (position, orientation, linear/angular velocity). */
export interface BoardPose {
  p: Vec3;
  q: Quat;
  lv: Vec3;
  av: Vec3;
}

/** Interpolated pose for rendering (position + orientation only). */
export interface RenderPose {
  p: Vec3;
  q: Quat;
}

export type WheelId = SkateWheelId;

/** Fresh plain-data wheel telemetry. Physics handles never cross this boundary. */
export interface WheelObservation extends SkateWheelObservation {}

export interface PhysicsDiagnostics {
  boardMass: number;
  riderMass: number;
  totalMass: number;
  physicsSubsteps: number;
  internalHz: number;
  ccdEnabled: boolean;
  activePopSubstepsRemaining: number;
  centerOfMassLocal: Vec3;
  inertia: Vec3;
  /** Actual stability torque requested and applied before the last step, N·m. */
  lastStepGroundBalanceTorque: Vec3;
  /** Net linear pop impulse applied during the last step, N·s. */
  lastStepPopLinearImpulse: Vec3;
  /** Pop angular impulse applied about the physical nose/tail lever, N·m·s. */
  lastStepPopAngularImpulse: Vec3;
  /** Net transition pump/lip impulse applied during the last step, N·s. */
  lastStepTransitionLinearImpulse: Vec3;
  /** Transition landing angular impulse applied during the last step, N·m·s. */
  lastStepTransitionAngularImpulse: Vec3;
}

interface PopEnvelope {
  totalSubsteps: number;
  nextSubstep: number;
  jY: number;
  kick: number;
  popSide: 'tail' | 'nose';
}

/** Deterministic world-level recovery causes surfaced to the harness. */
export type WorldRecoveryReason = 'out-of-bounds' | 'unrideable';

export interface WorldStepResult {
  recovery: WorldRecoveryReason | null;
}

/** Distance below the physical ground at which a malformed/stuck fall resets. */
const KILL_DEPTH_BELOW_GROUND_M = 2;

/**
 * Contact-force events become ride support only when the physical wheel solve
 * verifies the same surface. This prevents a rolled deck striking a wall (or
 * an inverted deck striking a ceiling) from hiding in the landing channel.
 * Near-vertical support additionally requires the stateful transition system,
 * which distinguishes a continued ramp/landing from an arbitrary wall face.
 */
export function isVerifiedRideSupportForce(
  force: Vec3,
  supportNormal: Vec3 | null,
  wheelContacts: number,
  transitionSurface: boolean,
  preContactVerticalVelocity = 0,
): boolean {
  const forceLength = Math.hypot(force.x, force.y, force.z);
  if (!Number.isFinite(forceLength) || forceLength <= 1e-9) return false;
  // A floor/ledge can hit the deck before two swept wheels report support.
  // Pre-step velocity supplies the missing orientation: a descending body with
  // a vertical contact is landing, while an ascending ceiling strike is not.
  const verticalAlignment = Math.abs(force.y) / forceLength;
  if (
    verticalAlignment >= 0.75 &&
    Number.isFinite(preContactVerticalVelocity) &&
    preContactVerticalVelocity <= 0
  ) return true;
  if (wheelContacts < 2 || !supportNormal) return false;
  const normalLength = Math.hypot(supportNormal.x, supportNormal.y, supportNormal.z);
  if (!Number.isFinite(normalLength) || normalLength <= 1e-9) return false;
  const nx = supportNormal.x / normalLength;
  const ny = supportNormal.y / normalLength;
  const nz = supportNormal.z / normalLength;
  // Downward-facing normals are ceilings/undersides. Surfaces steeper than
  // roughly 75° need the transition continuity/landing proof.
  if (ny <= 0 || (ny < 0.25 && !transitionSurface)) return false;
  const alignment = Math.abs(force.x * nx + force.y * ny + force.z * nz) / forceLength;
  return alignment >= 0.55;
}

// --- Rapier init (module-level guard: init exactly once) --------------------
let rapierInit: Promise<void> | null = null;
export function ensureRapier(): Promise<void> {
  if (!rapierInit) rapierInit = RAPIER.init();
  return rapierInit;
}

/**
 * mulberry32 — tiny, fast, dependency-free seeded PRNG. Deterministic across
 * platforms (pure integer ops via Math.imul). Returns a float in [0, 1).
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mix a JS safe-integer seed (arch §4 says u64; JS numbers give 53 usable
 * bits) into a single 32-bit state without discarding the high word. Seeds
 * differing only above bit 31 (e.g. 1 and 2^32 + 1) still produce different
 * streams — a plain `seed >>> 0` truncation would silently collapse them.
 */
export function mixSeed(seed: number): number {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error(`seed must be a non-negative safe integer, got ${seed}`);
  }
  const lo = seed >>> 0;
  const hi = Math.floor(seed / 4294967296) >>> 0;
  let h = lo ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h ^= hi + 0x9e3779b9 + ((h << 6) | 0) + (h >>> 2);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function zero(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

/** Apply a desired angular-velocity delta through a bounded physical impulse. */
function applyAngularDelta(
  body: RigidBody,
  delta: Vec3,
  maxImpulse: number,
): Vec3 {
  const inertia = body.effectiveAngularInertia();
  let impulse = {
    x: inertia.m11 * delta.x + inertia.m12 * delta.y + inertia.m13 * delta.z,
    y: inertia.m21 * delta.x + inertia.m22 * delta.y + inertia.m23 * delta.z,
    z: inertia.m31 * delta.x + inertia.m32 * delta.y + inertia.m33 * delta.z,
  };
  const magnitude = Math.hypot(impulse.x, impulse.y, impulse.z);
  const cap = Math.max(0, maxImpulse);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-9 || cap <= 0) return zero();
  if (magnitude > cap) {
    const scale = cap / magnitude;
    impulse = { x: impulse.x * scale, y: impulse.y * scale, z: impulse.z * scale };
  }
  body.applyTorqueImpulse(impulse, true);
  return impulse;
}

export class SimWorld {
  // ECMAScript #private: the raw Rapier world/body must be unreachable at
  // runtime from anything holding a SimWorld (G6 anti-cheat hardening).
  #world: World | null = null;
  #board: RigidBody | null = null;
  #contactSolver: SkateboardContactSolver | null = null;
  #transitionAssist: TransitionAssist;
  #eventQueue: EventQueue | null = null;
  private stepCount = 0;
  private seed = 0;
  private levelId = '';

  // --- M4 maneuver/bail state (all #private: game rules, not agent API) ----
  /** Level spawn marker captured at build time (deterministic per seed). */
  #spawn: Vec3 = zero();
  /** Grindable rail descriptors from the level (plain data; queried, never leaked). */
  #rails: RailDescriptor[] = [];
  /** Bail-respawn countdown; null when not bailing (the respawn game rule). */
  #bailStepsLeft: number | null = null;
  /** Max board contact impulse (N·s) observed during the LAST step(). */
  #lastContactImpulse = 0;
  /** Vertical-dominant subset of the last contact impulse (floor/rail support). */
  #lastSupportContactImpulse = 0;
  /** Off-axis subset of the last contact impulse (walls/obstacles, not support). */
  #lastImpactContactImpulse = 0;
  /** Consecutive floor-supported steps with the deck outside the rideable cone. */
  #unrideableSupportSteps = 0;
  /** False while a real pop/air/catch/grind/bail outcome owns recovery. */
  #unrideableRecoveryEnabled = true;
  /** Short force/impulse envelope that gives pop a physical contact duration. */
  #activePop: PopEnvelope | null = null;
  /** Stability torque queued by applyGroundForces for the next integration step. */
  #pendingGroundBalanceTorque: Vec3 = zero();
  #lastGroundBalanceTorque: Vec3 = zero();
  /**
   * Servoed world-yaw heading target of the direct steering authority, rad.
   * Accumulates clamped GroundCommand.headingDelta while steering is engaged;
   * null when disengaged (fingers off → physics owns yaw). State lives here so
   * the target survives per-step command plumbing but is validated per step.
   */
  #steerHeadingTarget: number | null = null;
  #lastPopLinearImpulse: Vec3 = zero();
  #lastPopAngularImpulse: Vec3 = zero();
  #lastTransitionLinearImpulse: Vec3 = zero();
  #lastTransitionAngularImpulse: Vec3 = zero();
  /** Highest-priority transition action physically applied during the last step. */
  #lastTransitionAssist: TransitionAssistAction | null = null;

  /** Pose snapshots for render interpolation (previous + current step). */
  private prevPose: RenderPose = { p: zero(), q: { x: 0, y: 0, z: 0, w: 1 } };
  private currPose: RenderPose = { p: zero(), q: { x: 0, y: 0, z: 0, w: 1 } };

  constructor(private readonly config: SimConfig) {
    this.#transitionAssist = new TransitionAssist(config.transition);
  }

  /** Idempotent one-time engine init. */
  init(): Promise<void> {
    return ensureRapier();
  }

  /**
   * Rebuild the world from (seed, levelId). Frees any prior world first, so
   * construction order is identical every time. Resets the step clock to 0.
   */
  async reset(seed: number, levelId: string): Promise<void> {
    await ensureRapier();
    this.free();
    this.#unrideableSupportSteps = 0;
    this.#unrideableRecoveryEnabled = true;

    const phys = this.config.physics;
    const substeps = positiveSubstepCount(phys.physicsSubsteps);
    const world = new RAPIER.World(phys.gravity);
    world.timestep = 1 / (phys.hz * substeps);
    world.maxCcdSubsteps = positiveSubstepCount(phys.ccdSubsteps);

    const rng = mulberry32(mixSeed(seed));
    const handle = getLevelBuilder(levelId)(RAPIER, world, this.config, rng);

    this.#world = world;
    this.#board = handle.board;
    this.#contactSolver = new SkateboardContactSolver(phys);
    this.#eventQueue = new RAPIER.EventQueue(true);
    this.#spawn = { ...handle.spawn };
    this.#rails = handle.rails ? handle.rails.map((r) => ({ ...r })) : [];
    this.#bailStepsLeft = null;
    this.#lastContactImpulse = 0;
    this.#lastSupportContactImpulse = 0;
    this.#lastImpactContactImpulse = 0;
    this.#activePop = null;
    this.#pendingGroundBalanceTorque = zero();
    this.#lastGroundBalanceTorque = zero();
    this.#lastPopLinearImpulse = zero();
    this.#lastPopAngularImpulse = zero();
    this.#lastTransitionLinearImpulse = zero();
    this.#lastTransitionAngularImpulse = zero();
    this.#transitionAssist.reset();
    this.#lastTransitionAssist = null;
    this.#steerHeadingTarget = null;
    this.stepCount = 0;
    this.seed = seed;
    this.levelId = levelId;

    const pose = this.readRenderPose();
    this.prevPose = pose;
    this.currPose = pose;
  }

  /** Advance exactly one fixed step and refresh pose snapshots. */
  step(): WorldStepResult {
    const world = this.requireWorld();
    const hz = this.config.physics.hz;
    const substeps = positiveSubstepCount(this.config.physics.physicsSubsteps);
    const substepDt = 1 / (hz * substeps);
    const queue = this.#eventQueue;
    let contactImpulse = 0;
    let supportImpulse = 0;
    let impactImpulse = 0;
    this.#lastGroundBalanceTorque = { ...this.#pendingGroundBalanceTorque };
    this.#pendingGroundBalanceTorque = zero();
    this.#lastPopLinearImpulse = zero();
    this.#lastPopAngularImpulse = zero();
    this.#lastTransitionLinearImpulse = zero();
    this.#lastTransitionAngularImpulse = zero();
    this.#lastTransitionAssist = null;
    for (let substep = 0; substep < substeps; substep++) {
      this.#applyPopEnvelopeSubstep();
      this.#contactSolver?.update(world, this.requireBoard(), substepDt);
      this.#applyTransitionAssistSubstep(substepDt);
      supportImpulse += this.#contactSolver?.maxSupportImpulse ?? 0;
      if (queue) {
        const preContactVerticalVelocity = this.requireBoard().linvel().y;
        world.step(queue);
        queue.drainContactForceEvents((ev) => {
          const force = ev.maxForceMagnitude();
          if (Number.isFinite(force)) contactImpulse += force * substepDt;
          const total = ev.totalForce();
          const directionMagnitude = Math.hypot(total.x, total.y, total.z);
          if (Number.isFinite(force) && directionMagnitude > 1e-9) {
            // A loaded skateboard produces large, correct forces when the deck,
            // trucks, or wheels meet the ground. Those must drive landing feel,
            // not the crash detector. Classify a contact as support when its
            // force agrees with a live multi-wheel support plane. The remaining
            // channel represents walls, ceilings, and obstacle strikes.
            const solver = this.#contactSolver;
            const transitionSurface =
              this.#lastTransitionAssist?.kind === 'pump' ||
              this.#lastTransitionAssist?.kind === 'landing';
            const impulse = force * substepDt;
            if (isVerifiedRideSupportForce(
              total,
              solver?.supportNormal ?? null,
              solver?.contactCount ?? 0,
              transitionSurface,
              preContactVerticalVelocity,
            )) {
              supportImpulse += impulse;
            } else {
              impactImpulse += impulse;
            }
          }
        });
      } else {
        world.step();
      }
    }
    this.#lastContactImpulse = contactImpulse;
    this.#lastSupportContactImpulse = supportImpulse;
    this.#lastImpactContactImpulse = impactImpulse;
    this.stepCount += 1;

    // --- Bail-respawn game rule (M4). Internal + deterministic: the countdown
    // starts when applyManeuver receives 'bailStart' and NOTHING external can
    // trigger or retime the respawn. This is the one sanctioned pose write —
    // the checkpoint respawn of final-input-and-trick-spec §7.
    if (this.#bailStepsLeft !== null) {
      this.#bailStepsLeft -= 1;
      if (this.#bailStepsLeft <= 0) this.#respawn();
    }

    // World recovery is simulation-owned so live play, replay, and headless
    // tests agree. A player can never remain in the `none` state below a finite
    // floor after rolling past the map edge.
    let recovery: WorldRecoveryReason | null = null;
    if (this.#needsWorldRecovery()) {
      this.#respawn();
      recovery = 'out-of-bounds';
    } else if (this.#needsUnrideableRecovery()) {
      this.#respawn();
      recovery = 'unrideable';
    }

    this.prevPose = this.currPose;
    this.currPose = this.readRenderPose();
    return { recovery };
  }

  /** Deterministic checkpoint respawn to the level spawn marker (bail rule). */
  #respawn(): void {
    const body = this.requireBoard();
    const phys = this.config.physics;
    body.setTranslation({ ...this.#spawn }, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.setLinearDamping(phys.linearDamping);
    body.setAngularDamping(phys.angularDamping);
    this.#bailStepsLeft = null;
    this.#unrideableSupportSteps = 0;
    this.#activePop = null;
    this.#pendingGroundBalanceTorque = zero();
    this.#lastGroundBalanceTorque = zero();
    this.#lastPopLinearImpulse = zero();
    this.#lastPopAngularImpulse = zero();
    this.#lastTransitionLinearImpulse = zero();
    this.#lastTransitionAngularImpulse = zero();
    this.#transitionAssist.reset();
    this.#lastTransitionAssist = null;
  }

  getStep(): number {
    return this.stepCount;
  }

  getSeed(): number {
    return this.seed;
  }

  /**
   * Current servoed heading target of the direct steering authority, rad, or
   * null while steering is disengaged. Read-only diagnostics for
   * ControlDiagnostics.requestedHeadingRad; no write path exists.
   */
  steerHeadingTarget(): number | null {
    return this.#steerHeadingTarget;
  }

  getLevelId(): string {
    return this.levelId;
  }

  /** Fresh, deep-copied full pose of the board body. */
  boardPose(): BoardPose {
    const body = this.requireBoard();
    const p = body.translation();
    const q = body.rotation();
    const lv = body.linvel();
    const av = body.angvel();
    return {
      p: { x: p.x, y: p.y, z: p.z },
      q: { x: q.x, y: q.y, z: q.z, w: q.w },
      lv: { x: lv.x, y: lv.y, z: lv.z },
      av: { x: av.x, y: av.y, z: av.z },
    };
  }

  /** Plain-data physics configuration/state for traces and acceptance tests. */
  physicsDiagnostics(): PhysicsDiagnostics {
    const phys = this.config.physics;
    const substeps = positiveSubstepCount(phys.physicsSubsteps);
    const body = this.requireBoard();
    const localCom = body.localCom();
    const inertia = body.effectiveAngularInertia();
    return {
      boardMass: phys.boardMass,
      riderMass: phys.riderMass,
      totalMass: body.mass(),
      physicsSubsteps: substeps,
      internalHz: phys.hz * substeps,
      ccdEnabled: body.isCcdEnabled(),
      activePopSubstepsRemaining: this.#activePop
        ? this.#activePop.totalSubsteps - this.#activePop.nextSubstep
        : 0,
      centerOfMassLocal: { x: localCom.x, y: localCom.y, z: localCom.z },
      inertia: { x: inertia.m11, y: inertia.m22, z: inertia.m33 },
      lastStepGroundBalanceTorque: { ...this.#lastGroundBalanceTorque },
      lastStepPopLinearImpulse: { ...this.#lastPopLinearImpulse },
      lastStepPopAngularImpulse: { ...this.#lastPopAngularImpulse },
      lastStepTransitionLinearImpulse: { ...this.#lastTransitionLinearImpulse },
      lastStepTransitionAngularImpulse: { ...this.#lastTransitionAngularImpulse },
    };
  }

  /**
   * Rideable-support read (M3). At least two real wheels must be in contact and
   * deck-up must align with world-up OR the live support normal. The latter is
   * what keeps ground control active through steep transition/vert; a deck on
   * its side on flat ground still has zero support-normal alignment.
   */
  isGrounded(): boolean {
    const body = this.requireBoard();
    const phys = this.config.physics;
    const q = body.rotation();
    const deckUp = quatRotate(q, 0, 1, 0);
    const supportNormal = this.#contactSolver?.supportNormal ?? null;
    return isRideableWheelSupport(
      deckUp,
      supportNormal,
      this.#wheelContactCount(),
      phys.ridableDeckUpDot,
    );
  }

  /** Four copied ray-wheel observations for tests and rendering only. */
  wheelObservations(): WheelObservation[] {
    const solver = this.#contactSolver;
    if (!solver) throw new Error('SimWorld.reset() must run before use');
    return solver.observations();
  }

  /** Load-weighted world-space ride surface from the latest wheel solve. */
  wheelSupportNormal(): Vec3 | null {
    const normal = this.#contactSolver?.supportNormal ?? null;
    return normal ? { ...normal } : null;
  }

  /**
   * Limit the generic stuck-on-edge fallback to idle/riding states. Active
   * maneuvers own their more specific landing and bail classifications.
   */
  setUnrideableRecoveryEnabled(enabled: boolean): void {
    this.#unrideableRecoveryEnabled = enabled;
    if (!enabled) this.#unrideableSupportSteps = 0;
  }

  /**
   * Nearest grindable rail to the board centre (M6), or null when the level has
   * no rails or the board is far from all of them. A narrow observational query
   * exactly like isGrounded(): it returns fresh PLAIN DATA (rail tangent, anchor,
   * lateral offset) computed from the rail descriptors + the board position, and
   * never exposes a body or collider. GrindSystem consults this to decide the
   * candidate/latch/exit; it cannot reach the physics world through it.
   */
  railProximity(): RailProximity | null {
    if (this.#rails.length === 0) return null;
    const body = this.requireBoard();
    const p = body.translation();
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
    return nearestRail(this.#rails, p.x, p.z);
  }

  /**
   * Apply a GroundCommand to the board (M3). This is the ONLY place ground
   * intents touch the body: every component is validated + clamped from config,
   * velocity caps are enforced as FORCE limiting (no hard velocity writes, no
   * teleports), and any non-finite input is dropped. BoardController never gets
   * body/world access — it produces the plain-data command; SimWorld applies it.
   *
   * Must be called BEFORE step() so the impulses integrate this tick.
   */
  applyGroundForces(cmd: GroundCommand): void {
    this.#pendingGroundBalanceTorque = zero();
    if (!cmd.active) {
      this.#setWheelEngineForce(0);
      this.#setWheelBrake(0);
      this.#setTruckSteering(0, 0);
      this.#steerHeadingTarget = null;
      return;
    }
    const body = this.requireBoard();
    const phys = this.config.physics;
    const loco = this.config.locomotion;
    const dt = 1 / phys.hz;
    const mass = phys.boardMass + phys.riderMass;

    const lv = body.linvel();
    const av = body.angvel();
    const q = body.rotation();
    // Bail on any non-finite body state rather than propagate NaN into step().
    for (const v of [lv.x, lv.y, lv.z, av.x, av.y, av.z, q.x, q.y, q.z, q.w]) {
      if (!Number.isFinite(v)) return;
    }

    // Board-forward (+Z nose) in world space, projected onto the horizontal
    // plane so ground drive/push never push the board into or out of the floor.
    const fwd = quatRotate(q, 0, 0, 1);
    const right = quatRotate(q, 1, 0, 0);
    const fh = Math.hypot(fwd.x, fwd.z);
    const hasForward = fh > 1e-4;
    const fx = hasForward ? fwd.x / fh : 0;
    const fz = hasForward ? fwd.z / fh : 0;
    const fwdSpeed = lv.x * fx + lv.z * fz;

    const impulse = { x: 0, y: 0, z: 0 };

    // --- Rolling friction: horizontal, speed-proportional coast drag ---------
    // Gives a physical terminal speed (drive = drag) and stops push coasting
    // from feeling like ice, without a hard velocity clamp.
    const rf = clampNum(phys.rollingFriction, 0, 4);
    impulse.x -= rf * mass * lv.x * dt;
    impulse.z -= rf * mass * lv.z * dt;

    // --- Cruise drive: wheel engine force toward cruiseTargetSpeed ---------
    // Longitudinal drive belongs at the wheel contacts. Applying it as a second
    // chassis impulse would bypass load and grip, so feed the clamped force
    // through the four physical wheels instead.
    let wheelDriveForce = 0;
    if (hasForward && loco.cruiseTargetSpeed > 1e-4) {
      const drive = clampNum(cmd.driveForce, 0, loco.accelerationStrokePeakForce);
      const scale = clampNum(1 - fwdSpeed / loco.cruiseTargetSpeed, 0, 1);
      wheelDriveForce = drive * scale;
    }
    this.#setWheelEngineForce(wheelDriveForce);
    this.#setWheelBrake(clampNum(cmd.brakeForce, 0, loco.coastBrakeForce));

    // Trucks are FLAVOR, not the steering authority (reviews/03 §Stage 1):
    // actual deck lean still pivots the axles in opposite directions for a
    // physical carve accent, but the commanded heading no longer routes
    // through truck geometry, wheel side friction, or suspension load.
    const frontLoad = this.#contactSolver?.frontLoad ?? 0;
    const rearLoad = this.#contactSolver?.rearLoad ?? 0;
    const rawLean = Math.asin(clampNum(right.y, -1, 1));
    const leanDeadzone = loco.truckLeanDeadzoneDeg * Math.PI / 180;
    const intentionalLean = Math.abs(rawLean) <= leanDeadzone
      ? 0
      : Math.sign(rawLean) * (Math.abs(rawLean) - leanDeadzone);
    const leanSteer = skateboardTruckSteering({
      leanRad: intentionalLean,
      speed: Math.hypot(lv.x, lv.z),
      frontLoad,
      rearLoad,
      leanToSteer: loco.truckLeanToSteer,
      maxSteerRad: (loco.truckSteerMaxDeg * Math.PI) / 180,
      speedFade: loco.truckSteerSpeedFade,
    });
    const maxTruckSteer = loco.truckSteerMaxDeg * Math.PI / 180;
    this.#setTruckSteering(
      clampNum(leanSteer.front, -maxTruckSteer, maxTruckSteer),
      clampNum(leanSteer.rear, -maxTruckSteer, maxTruckSteer),
    );

    // --- Push pulse: one-shot impulse, momentum-capped at maxGroundSpeed ------
    if (hasForward) {
      const push = clampNum(cmd.pushImpulse, 0, phys.pushImpulse);
      if (push > 0) {
        const allowed = Math.max(0, (phys.maxGroundSpeed - fwdSpeed) * mass);
        const applied = Math.min(push, allowed);
        impulse.x += fx * applied;
        impulse.z += fz * applied;
      }
    }

    // --- Grip model: heading ≠ travel (reviews/03 design law #2) -------------
    // ROTATE the horizontal velocity vector toward board-forward (never delete
    // it): the slip angle between travel and the deck decays exponentially at
    // gripRate (τ ≈ 125 ms — slow rotation carves, momentum redirects), while
    // the redirect RATE saturates at gripRate × gripSlipSpeed worth of lateral
    // velocity per second, so a fast rotation at speed out-runs the grip and
    // leaves genuine slide (powerslide) as the remainder. Riding fakie
    // redirects toward −forward (the nearer pole), never through 90°.
    // Force-based (impulse toward the rotated vector); speed magnitude is
    // untouched by construction — scrub stays owned by rolling friction and
    // the wheel model.
    {
      const rh = Math.hypot(right.x, right.z);
      if (hasForward && rh > 1e-4) {
        const rx = right.x / rh;
        const rz = right.z / rh;
        const vFwd = lv.x * fx + lv.z * fz;
        const vLat = lv.x * rx + lv.z * rz;
        const speed = Math.hypot(vFwd, vLat);
        if (speed > 1e-3 && Math.abs(vLat) > 1e-4) {
          const slipAngle = Math.atan2(vLat, vFwd);
          const pole = Math.abs(slipAngle) > Math.PI / 2 ? Math.sign(slipAngle) * Math.PI : 0;
          const error = slipAngle - pole;
          const gripRate = clampNum(loco.gripRate, 0, 60);
          const decay = 1 - Math.exp(-gripRate * dt);
          const maxTurn = (gripRate * Math.max(0, loco.gripSlipSpeed) * dt) / speed;
          const turn = clampNum(error * decay, -maxTurn, maxTurn);
          const newAngle = slipAngle - turn;
          const nFwd = speed * Math.cos(newAngle);
          const nLat = speed * Math.sin(newAngle);
          impulse.x += (fx * (nFwd - vFwd) + rx * (nLat - vLat)) * mass;
          impulse.z += (fz * (nFwd - vFwd) + rz * (nLat - vLat)) * mass;
        }
      }
    }

    if (Number.isFinite(impulse.x) && Number.isFinite(impulse.z)) {
      body.applyImpulse({ x: impulse.x, y: 0, z: impulse.z }, true);
    }

    // --- Direct yaw authority (reviews/03 design law #1) ---------------------
    // Fingers planted = the board's yaw is yours, now, at ANY speed (standstill
    // pivot included — no rideMotionFullSpeed gate). SimWorld accumulates the
    // relative headingDelta into a servoed target and tracks it with a
    // two-loop servo: position error → desired yaw rate (steerTrackGain) plus
    // the commanded rate as feedforward, then rate error → direct clamped
    // torque about deck-up (steerServoGain / steerMaxTorque). Everything is
    // clamped from config; fingers off releases the target (physics owns yaw).
    const deckUp = quatRotate(q, 0, 1, 0);
    let yawImpulse = 0;
    if (cmd.headingDelta != null && Number.isFinite(cmd.headingDelta)) {
      const boardYaw = Math.atan2(fwd.x, fwd.z);
      const maxStepDelta = phys.steerYawRateMax * dt;
      const delta = clampNum(cmd.headingDelta, -maxStepDelta, maxStepDelta);
      const target = this.#steerHeadingTarget == null
        ? wrapPi(boardYaw + delta)
        : wrapPi(this.#steerHeadingTarget + delta);
      // Anti-windup: if reality falls far behind (collision, wall pin), drag
      // the target with the board instead of storing a multi-second catch-up.
      const rawError = wrapPi(target - boardYaw);
      const maxError = 0.6;
      const error = clampNum(rawError, -maxError, maxError);
      this.#steerHeadingTarget = wrapPi(boardYaw + error);
      const yawRate = av.x * deckUp.x + av.y * deckUp.y + av.z * deckUp.z;
      const desiredRate = clampNum(
        error * loco.steerTrackGain + delta / dt,
        -phys.steerYawRateMax,
        phys.steerYawRateMax,
      );
      const yawTorque = clampNum(
        (desiredRate - yawRate) * loco.steerServoGain,
        -loco.steerMaxTorque,
        loco.steerMaxTorque,
      );
      yawImpulse = yawTorque * dt;
    } else {
      this.#steerHeadingTarget = null;
    }

    // --- Lean roll: small clamped torque about the board-forward axis ---------
    const rollTorque = clampNum(cmd.rollTorque, -loco.leanMaxRollTorque, loco.leanMaxRollTorque);
    const rollImpulse = rollTorque * dt;

    // Engine forces act below this unusually light chassis and would otherwise
    // wheelie the deck until its ray origins sink through the floor. Model the
    // planted rider's neutral fore/aft balance as an equal counter-pitch torque;
    // this changes no pose and leaves trick/air steps untouched (engine=0).
    // The contact solver receives TOTAL drive force and distributes one quarter
    // to each live wheel. Counter exactly the force actually delivered, not
    // four copies of the total.
    const drivenWheelFraction = (this.#contactSolver?.contactCount ?? 0) / 4;
    const enginePitchImpulse =
      wheelDriveForce * drivenWheelFraction *
      (phys.truckDropY + phys.truckHalfExtents.y) * dt;

    const tx = fwd.x * rollImpulse + right.x * enginePitchImpulse + deckUp.x * yawImpulse;
    const ty = fwd.y * rollImpulse + right.y * enginePitchImpulse + deckUp.y * yawImpulse;
    const tz = fwd.z * rollImpulse + right.z * enginePitchImpulse + deckUp.z * yawImpulse;
    if (Number.isFinite(tx) && Number.isFinite(ty) && Number.isFinite(tz)) {
      body.applyTorqueImpulse({ x: tx, y: ty, z: tz }, true);
    }

    // The invisible rider/load proxy is not dead cargo. While at least two
    // wheels support a rideable deck, a bounded physical PD torque balances
    // the board to the live surface normal and damps roll/pitch wobble. Yaw is
    // deliberately excluded: turning still comes only from truck curvature.
    const surfaceNormal = this.#contactSolver?.supportNormal ?? null;
    if (surfaceNormal && this.isGrounded()) {
      const errorAxis = {
        x: deckUp.y * surfaceNormal.z - deckUp.z * surfaceNormal.y,
        y: deckUp.z * surfaceNormal.x - deckUp.x * surfaceNormal.z,
        z: deckUp.x * surfaceNormal.y - deckUp.y * surfaceNormal.x,
      };
      const normalSpin =
        av.x * surfaceNormal.x + av.y * surfaceNormal.y + av.z * surfaceNormal.z;
      const tiltRate = {
        x: av.x - surfaceNormal.x * normalSpin,
        y: av.y - surfaceNormal.y * normalSpin,
        z: av.z - surfaceNormal.z * normalSpin,
      };
      let balance = {
        x: loco.groundBalanceKp * errorAxis.x - loco.groundBalanceKd * tiltRate.x,
        y: loco.groundBalanceKp * errorAxis.y - loco.groundBalanceKd * tiltRate.y,
        z: loco.groundBalanceKp * errorAxis.z - loco.groundBalanceKd * tiltRate.z,
      };
      const balanceMagnitude = Math.hypot(balance.x, balance.y, balance.z);
      const balanceCap = Math.max(0, loco.groundBalanceTorqueMax);
      if (balanceMagnitude > balanceCap && balanceMagnitude > 1e-9) {
        const scale = balanceCap / balanceMagnitude;
        balance = { x: balance.x * scale, y: balance.y * scale, z: balance.z * scale };
      }
      body.applyTorqueImpulse(
        { x: balance.x * dt, y: balance.y * dt, z: balance.z * dt },
        true,
      );
      this.#pendingGroundBalanceTorque = { ...balance };
    }
  }

  /**
   * Max board contact impulse (N·s) observed during the last step(). Narrow
   * observational query for the maneuver interrupt rule (final-physics §3.3);
   * never exposes the body or the event queue.
   */
  lastContactImpulseMagnitude(): number {
    return this.#lastContactImpulse;
  }

  /** Last vertical-dominant contact impulse: floor/rail support, not wall hits. */
  lastSupportContactImpulseMagnitude(): number {
    return this.#lastSupportContactImpulse;
  }

  /** Last off-axis contact impulse: walls/obstacles, excluding ride support. */
  lastImpactContactImpulseMagnitude(): number {
    return this.#lastImpactContactImpulse;
  }

  /** Last gameplay-step transition force request, copied for tests/observability. */
  lastTransitionAssist(): TransitionAssistAction | null {
    const action = this.#lastTransitionAssist;
    return action
      ? {
          ...action,
          linearImpulse: { ...action.linearImpulse },
          angularDelta: { ...action.angularDelta },
        }
      : null;
  }

  /**
   * Apply a ManeuverCommand (M4). Exactly the applyGroundForces pattern: the
   * ONLY place maneuver intents touch the body. Every component is validated +
   * clamped from config; everything is force/impulse-based. The single
   * exception is the catch angular damping, which the spec defines AS an
   * omega scaling (final-physics §3.2) — implemented as an angvel scale. There
   * are NO pose writes here; the bail respawn is an internal countdown game
   * rule (see step()/#respawn), not a commandable action.
   *
   * Must be called BEFORE step() so impulses integrate this tick.
   */
  applyManeuver(cmd: ManeuverCommand): void {
    const body = this.requireBoard();
    const phys = this.config.physics;
    const pop = this.config.pop;

    const q = body.rotation();
    const lv = body.linvel();
    const av = body.angvel();
    // Bail out on any non-finite body state rather than propagate NaN.
    for (const v of [lv.x, lv.y, lv.z, av.x, av.y, av.z, q.x, q.y, q.z, q.w]) {
      if (!Number.isFinite(v)) return;
    }

    switch (cmd.kind) {
      case 'pop': {
        const jY = clampNum(cmd.jY, 0, pop.jMax);
        const lever = Math.max(0.1, phys.boardLength * 0.42);
        const legacyPitch = Math.abs(cmd.pitchTorqueImpulse ?? 0);
        const requestedKick = cmd.kickImpulse ?? legacyPitch / lever;
        const kick = clampNum(requestedKick, 0, pop.pitchTorqueImpulseMax / lever);
        // Queue a short half-sine actuation. The paired lift + downward kick
        // still preserves net jY and creates pitch through the real lever arm,
        // but no longer changes the board's entire velocity in one instant.
        this.#activePop = {
          totalSubsteps: Math.max(1, Math.floor(pop.actuationSubsteps)),
          nextSubstep: 0,
          jY,
          kick,
          popSide: cmd.popSide === 'nose' ? 'nose' : 'tail',
        };
        break;
      }
      case 'ollieLevel': {
        const right = quatRotate(q, 1, 0, 0);
        const forward = quatRotate(q, 0, 0, 1);
        const currentPitch = Math.asin(clampNum(forward.y, -1, 1));
        const target = clampNum(
          cmd.targetPitch,
          -pop.noseUpTargetDeg * Math.PI / 180,
          pop.noseUpTargetDeg * Math.PI / 180,
        );
        const pitchRate = av.x * right.x + av.y * right.y + av.z * right.z;
        // Positive rotation about board-right lowers the nose, so pitch error
        // and torque have opposite signs in this axis convention.
        const tau = clampNum(
          -pop.levelKp * (target - currentPitch) - pop.levelKd * pitchRate,
          -pop.levelTorqueMax,
          pop.levelTorqueMax,
        );
        const imp = tau / phys.hz;
        body.applyTorqueImpulse({ x: right.x * imp, y: right.y * imp, z: right.z * imp }, true);
        break;
      }
      case 'flipImpulse': {
        const flip = this.config.flip;
        const axis = flipAxisWorld(q, cmd.axis);
        const omegaAxis = av.x * axis.x + av.y * axis.y + av.z * axis.z;
        const omegaLimit = cmd.axis === 'up' ? flip.shuvOmegaMax : flip.omegaFlipMax;
        const omegaTarget = clampNum(cmd.omegaTarget, -omegaLimit, omegaLimit);
        const deltaOmega = omegaTarget - omegaAxis;
        const maxConfigured =
          cmd.axis === 'up' ? flip.shuvImpulseMax[2] : flip.impulseMax[2];
        applyAngularDelta(
          body,
          { x: axis.x * deltaOmega, y: axis.y * deltaOmega, z: axis.z * deltaOmega },
          clampNum(cmd.maxTorqueImpulse, 0, maxConfigured),
        );
        break;
      }
      case 'flipTorque': {
        // Per-step flip/shuv PD torque about a board-local axis (spec §3.2).
        // The axis is resolved to world from the LIVE orientation, the live
        // angular velocity is projected onto it, and the clamped PD torque is
        // applied as a torque impulse. Pure torque — no pose/velocity write.
        const flip = this.config.flip;
        const axis = flipAxisWorld(q, cmd.axis);
        const omegaAxis = av.x * axis.x + av.y * axis.y + av.z * axis.z;
        const omegaT = clampNum(cmd.omegaTarget, -flip.omegaFlipMax, flip.omegaFlipMax);
        // Sane cap covers both the roll (tauMax) and yaw (shuvTauMax) clamps.
        const tauCap = Math.max(flip.tauMax[2], flip.shuvTauMax[2]);
        const tauMax = clampNum(cmd.tauMax, 0, tauCap);
        let tau = flip.kp * (omegaT - omegaAxis) - flip.kd * omegaAxis;
        tau = clampNum(tau, -tauMax, tauMax);
        const imp = tau / phys.hz; // torque impulse = tau·dt
        body.applyTorqueImpulse({ x: axis.x * imp, y: axis.y * imp, z: axis.z * imp }, true);
        break;
      }
      case 'catch': {
        const factor = clampNum(cmd.angularFactor, 0, 1);
        const damp = 1 - factor;
        applyAngularDelta(
          body,
          { x: -av.x * damp, y: -av.y * damp, z: -av.z * damp },
          cmd.maxTorqueImpulse ?? this.config.catch.angularImpulseMax[2],
        );
        break;
      }
      case 'catchQuantize': {
        // Extra ON-AXIS catch damping (spec §3.4 quantize). Removes a fraction
        // of the spin about the trick axis only, so continued over-rotation
        // bleeds off inside the completion cone. Never a pose write / teleport.
        const damp = clampNum(cmd.damp, 0, 1);
        if (damp <= 0) break;
        const axis = flipAxisWorld(q, cmd.axis);
        const omegaAxis = av.x * axis.x + av.y * axis.y + av.z * axis.z;
        const remove = -damp * omegaAxis;
        applyAngularDelta(
          body,
          { x: remove * axis.x, y: remove * axis.y, z: remove * axis.z },
          cmd.maxTorqueImpulse ?? this.config.catch.angularImpulseMax[2],
        );
        break;
      }
      case 'landScrub': {
        const scrub = clampNum(cmd.scrubFraction, 0, 0.9);
        const m = phys.boardMass + phys.riderMass;
        body.applyImpulse({ x: -m * scrub * lv.x, y: 0, z: -m * scrub * lv.z }, true);
        break;
      }
      case 'bailStart': {
        if (this.#bailStepsLeft !== null) break; // already bailing — idempotent
        body.setLinearDamping(this.config.bail.dampingFactor);
        body.setAngularDamping(this.config.bail.dampingFactor);
        this.#bailStepsLeft = Math.max(1, Math.floor(this.config.bail.recoverSteps));
        break;
      }
      case 'grindLatch': {
        // Soft-snap latch (spec §4): clamped HORIZONTAL forces + a yaw-align
        // torque only. Vertical support is the rail collider's contact — this
        // never writes the pose. The force maths lives in the pure, unit-tested
        // grindLatchImpulse() (single source of truth for the latch physics).
        const { lin, yaw } = grindLatchImpulse(
          { q, lv, av },
          {
            family: cmd.family,
            approachOnly: cmd.approachOnly,
            axis: cmd.axis,
            perp: cmd.perp,
            lateralOffset: cmd.lateralOffset,
            springGain: cmd.springGain,
            balanceLateral: cmd.balanceLateral,
          },
          this.config.grind,
          phys.boardMass + phys.riderMass,
          phys.hz,
        );
        if (Number.isFinite(lin.x) && Number.isFinite(lin.z) && (lin.x !== 0 || lin.z !== 0)) {
          body.applyImpulse({ x: lin.x, y: 0, z: lin.z }, true);
        }
        const lift = clampNum(cmd.dismountLiftImpulse, 0, this.config.grind.dismountLiftImpulse);
        if (lift > 0) body.applyImpulse({ x: 0, y: lift, z: 0 }, true);
        if (Number.isFinite(yaw) && yaw !== 0) {
          body.applyTorqueImpulse({ x: 0, y: yaw, z: 0 }, true);
        }
        // A hanger-on-rail contact is a narrow line support. Without the
        // rider's balancing torque the deck can lever onto its side while the
        // logical 50-50 remains latched, then dismount inverted. Default assist
        // adds a bounded physical roll PD around board-forward; L0
        // (springGain=0), approaches, and one-shot exits remain pure physics.
        if (!cmd.approachOnly && cmd.springGain > 0) {
          const forward = quatRotate(q, 0, 0, 1);
          const right = quatRotate(q, 1, 0, 0);
          const roll = Math.asin(clampNum(right.y, -1, 1));
          const rollRate = av.x * forward.x + av.y * forward.y + av.z * forward.z;
          const rollTau = clampNum(
            -this.config.grind.latchRollAlignGain * roll - this.config.grind.latchRollDamp * rollRate,
            -this.config.grind.latchRollTorqueMax,
            this.config.grind.latchRollTorqueMax,
          );
          const rollImp = rollTau / phys.hz;
          body.applyTorqueImpulse(
            { x: forward.x * rollImp, y: forward.y * rollImp, z: forward.z * rollImp },
            true,
          );
        }
        break;
      }
    }
  }

  /**
   * Render pose interpolated between the previous and current step by alpha in
   * [0, 1]. Renderer only — never feeds back into the sim.
   */
  interpolatedRenderPose(alpha: number): RenderPose {
    const a = Math.max(0, Math.min(1, alpha));
    const prev = this.prevPose;
    const curr = this.currPose;
    const p: Vec3 = {
      x: prev.p.x + (curr.p.x - prev.p.x) * a,
      y: prev.p.y + (curr.p.y - prev.p.y) * a,
      z: prev.p.z + (curr.p.z - prev.p.z) * a,
    };
    return { p, q: nlerp(prev.q, curr.q, a) };
  }

  free(): void {
    if (this.#eventQueue) {
      this.#eventQueue.free();
      this.#eventQueue = null;
    }
    if (this.#world) {
      this.#world.free();
      this.#world = null;
      this.#board = null;
      this.#contactSolver = null;
      this.#activePop = null;
      this.#transitionAssist.reset();
      this.#lastTransitionAssist = null;
      this.#pendingGroundBalanceTorque = zero();
      this.#lastGroundBalanceTorque = zero();
      this.#lastPopLinearImpulse = zero();
      this.#lastPopAngularImpulse = zero();
      this.#lastTransitionLinearImpulse = zero();
      this.#lastTransitionAngularImpulse = zero();
    }
  }

  /** Apply one bounded transition request before Rapier integrates this substep. */
  #applyTransitionAssistSubstep(dt: number): void {
    const body = this.requireBoard();
    const solver = this.#contactSolver;
    if (!solver) return;
    const q = body.rotation();
    const boardUp = quatRotate(q, 0, 1, 0);
    const action = this.#transitionAssist.update({
      supported: this.isGrounded(),
      supportNormal: solver.supportNormal,
      boardUp,
      velocity: body.linvel(),
      angularVelocity: body.angvel(),
      dt,
      totalMass: body.mass(),
    });

    const impulse = action.linearImpulse;
    if (
      Number.isFinite(impulse.x) &&
      Number.isFinite(impulse.y) &&
      Number.isFinite(impulse.z) &&
      (impulse.x !== 0 || impulse.y !== 0 || impulse.z !== 0)
    ) {
      body.applyImpulse(impulse, true);
      this.#lastTransitionLinearImpulse.x += impulse.x;
      this.#lastTransitionLinearImpulse.y += impulse.y;
      this.#lastTransitionLinearImpulse.z += impulse.z;
    }
    const appliedAngularImpulse = action.angularImpulseMax > 0
      ? applyAngularDelta(body, action.angularDelta, action.angularImpulseMax)
      : zero();
    this.#lastTransitionAngularImpulse.x += appliedAngularImpulse.x;
    this.#lastTransitionAngularImpulse.y += appliedAngularImpulse.y;
    this.#lastTransitionAngularImpulse.z += appliedAngularImpulse.z;

    if (
      action.kind !== 'none' &&
      (!this.#lastTransitionAssist ||
        transitionActionPriority(action.kind) >=
          transitionActionPriority(this.#lastTransitionAssist.kind))
    ) {
      this.#lastTransitionAssist = {
        ...action,
        linearImpulse: { ...action.linearImpulse },
        angularDelta: { ...action.angularDelta },
      };
    }
  }

  /** Deliver one normalized half-sine slice of the queued pop impulse. */
  #applyPopEnvelopeSubstep(): void {
    const envelope = this.#activePop;
    if (!envelope) return;
    const n = envelope.totalSubsteps;
    const index = envelope.nextSubstep;
    let weightSum = 0;
    for (let i = 0; i < n; i++) {
      weightSum += Math.sin(Math.PI * (i + 1) / (n + 1));
    }
    const weight = Math.sin(Math.PI * (index + 1) / (n + 1)) / weightSum;
    const body = this.requireBoard();
    const kick = envelope.kick * weight;

    body.applyImpulse(
      { x: 0, y: (envelope.jY + envelope.kick) * weight, z: 0 },
      true,
    );
    this.#lastPopLinearImpulse.y += envelope.jY * weight;
    if (kick > 0) {
      const lever = Math.max(0.1, this.config.physics.boardLength * 0.42);
      const q = body.rotation();
      const localZ = envelope.popSide === 'nose' ? lever : -lever;
      const endOffset = quatRotate(q, 0, 0, localZ);
      const com = body.worldCom();
      body.applyImpulseAtPoint(
        { x: 0, y: -kick, z: 0 },
        { x: com.x + endOffset.x, y: com.y + endOffset.y, z: com.z + endOffset.z },
        true,
      );
      this.#lastPopAngularImpulse.x += endOffset.z * kick;
      this.#lastPopAngularImpulse.z -= endOffset.x * kick;
    }

    envelope.nextSubstep += 1;
    if (envelope.nextSubstep >= envelope.totalSubsteps) this.#activePop = null;
  }

  private readRenderPose(): RenderPose {
    const body = this.requireBoard();
    const p = body.translation();
    const q = body.rotation();
    return {
      p: { x: p.x, y: p.y, z: p.z },
      q: { x: q.x, y: q.y, z: q.z, w: q.w },
    };
  }

  #wheelContactCount(): number {
    return this.#contactSolver?.contactCount ?? 0;
  }

  #setWheelEngineForce(totalForce: number): void {
    this.#contactSolver?.setEngineForce(totalForce);
  }

  #setTruckSteering(front: number, rear: number): void {
    this.#contactSolver?.setSteering(front, rear);
  }

  #setWheelBrake(perWheelForce: number): void {
    this.#contactSolver?.setBrake(perWheelForce);
  }

  /** True when the board leaves the finite floor or drops below its kill plane. */
  #needsWorldRecovery(): boolean {
    const p = this.requireBoard().translation();
    const ground = this.config.physics.ground.halfExtents;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return true;
    return (
      Math.abs(p.x) > ground.x ||
      Math.abs(p.z) > ground.z ||
      p.y < -KILL_DEPTH_BELOW_GROUND_M
    );
  }

  /**
   * A board that has settled on an edge is a bail state, not locomotion. Give
   * real dynamics a short window to right the deck; if the low, slow and
   * unrideable pose persists, recover to the deterministic checkpoint.
   */
  #needsUnrideableRecovery(): boolean {
    // GestureFSM already classified a real maneuver failure and started the
    // normal bail countdown. Preserve that more specific outcome (inverted,
    // over-rotation, hard-impact) instead of overwriting it with the generic
    // stuck-deck fallback.
    if (!this.#unrideableRecoveryEnabled || this.#bailStepsLeft !== null) {
      this.#unrideableSupportSteps = 0;
      return false;
    }
    const body = this.requireBoard();
    const phys = this.config.physics;
    const p = body.translation();
    const q = body.rotation();
    const lv = body.linvel();
    const deckUp = quatRotate(q, 0, 1, 0);
    // Preserve the old "misoriented deck" recovery condition while allowing
    // a steep board that is genuinely aligned to transition support.
    const rideableOrientation = isRideableWheelSupport(
      deckUp,
      this.#contactSolver?.supportNormal ?? null,
      2,
      phys.ridableDeckUpDot,
    );
    const supportedHeight = phys.boardLength * 0.55;
    const supportedAndUnrideable =
      Number.isFinite(p.y) &&
      Number.isFinite(lv.y) &&
      p.y <= supportedHeight &&
      Math.abs(lv.y) < 0.75 &&
      !rideableOrientation;

    this.#unrideableSupportSteps = supportedAndUnrideable
      ? this.#unrideableSupportSteps + 1
      : 0;
    return this.#unrideableSupportSteps >= Math.max(1, Math.floor(phys.unrideableRecoverSteps));
  }

  private requireWorld(): World {
    if (!this.#world) throw new Error('SimWorld.reset() must run before step()');
    return this.#world;
  }

  private requireBoard(): RigidBody {
    if (!this.#board) throw new Error('SimWorld.reset() must run before use');
    return this.#board;
  }
}

function clampNum(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapPi(angle: number): number {
  let x = angle;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x <= -Math.PI) x += Math.PI * 2;
  return x;
}

function transitionActionPriority(kind: TransitionAssistAction['kind']): number {
  switch (kind) {
    case 'lip-launch': return 3;
    case 'landing': return 2;
    case 'pump': return 1;
    case 'none': return 0;
  }
}

/** Rotate the vector (x,y,z) by quaternion q. Returns a plain Vec3. */
function quatRotate(q: Quat, x: number, y: number, z: number): Vec3 {
  // v' = v + 2*w*(qv × v) + 2*(qv × (qv × v))
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  return {
    x: x + q.w * tx + (q.y * tz - q.z * ty),
    y: y + q.w * ty + (q.z * tx - q.x * tz),
    z: z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/**
 * World-space unit vector of a board-local trick axis (M5). 'long' = board long
 * axis (+Z, nose) for flip roll; 'up' = board up (+Y) for shuv yaw. Both are
 * unit in local space; the quaternion rotation preserves length, but we
 * renormalize defensively so a denormalized body quat can never scale the torque.
 */
function flipAxisWorld(q: Quat, axis: 'long' | 'up'): Vec3 {
  const local = axis === 'long' ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const w = quatRotate(q, local.x, local.y, local.z);
  const len = Math.hypot(w.x, w.y, w.z) || 1;
  return { x: w.x / len, y: w.y / len, z: w.z / len };
}

/** Normalized quaternion lerp (shortest arc). Cosmetic render interpolation. */
function nlerp(a: Quat, b: Quat, t: number): Quat {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  const dot = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  const x = a.x + (bx - a.x) * t;
  const y = a.y + (by - a.y) * t;
  const z = a.z + (bz - a.z) * t;
  const w = a.w + (bw - a.w) * t;
  const len = Math.hypot(x, y, z, w) || 1;
  return { x: x / len, y: y / len, z: z / len, w: w / len };
}
