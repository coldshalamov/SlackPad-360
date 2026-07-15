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

/** Deterministic world-level recovery causes surfaced to the harness. */
export type WorldRecoveryReason = 'out-of-bounds' | 'unrideable';

export interface WorldStepResult {
  recovery: WorldRecoveryReason | null;
}

/** Distance below the physical ground at which a malformed/stuck fall resets. */
const KILL_DEPTH_BELOW_GROUND_M = 2;

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
): void {
  const inertia = body.effectiveAngularInertia();
  let impulse = {
    x: inertia.m11 * delta.x + inertia.m12 * delta.y + inertia.m13 * delta.z,
    y: inertia.m21 * delta.x + inertia.m22 * delta.y + inertia.m23 * delta.z,
    z: inertia.m31 * delta.x + inertia.m32 * delta.y + inertia.m33 * delta.z,
  };
  const magnitude = Math.hypot(impulse.x, impulse.y, impulse.z);
  const cap = Math.max(0, maxImpulse);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-9 || cap <= 0) return;
  if (magnitude > cap) {
    const scale = cap / magnitude;
    impulse = { x: impulse.x * scale, y: impulse.y * scale, z: impulse.z * scale };
  }
  body.applyTorqueImpulse(impulse, true);
}

export class SimWorld {
  // ECMAScript #private: the raw Rapier world/body must be unreachable at
  // runtime from anything holding a SimWorld (G6 anti-cheat hardening).
  #world: World | null = null;
  #board: RigidBody | null = null;
  #contactSolver: SkateboardContactSolver | null = null;
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
  /** Consecutive floor-supported steps with the deck outside the rideable cone. */
  #unrideableSupportSteps = 0;
  /** False while a real pop/air/catch/grind/bail outcome owns recovery. */
  #unrideableRecoveryEnabled = true;

  /** Pose snapshots for render interpolation (previous + current step). */
  private prevPose: RenderPose = { p: zero(), q: { x: 0, y: 0, z: 0, w: 1 } };
  private currPose: RenderPose = { p: zero(), q: { x: 0, y: 0, z: 0, w: 1 } };

  constructor(private readonly config: SimConfig) {}

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
    const world = new RAPIER.World(phys.gravity);
    world.timestep = 1 / phys.hz;

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
    this.#contactSolver?.update(world, this.requireBoard(), 1 / hz);
    // Query-wheel support is a physical point impulse, but it is not a Rapier
    // collider contact event. Preserve it for first-strike landing judgment.
    const wheelSupportImpulse = this.#contactSolver?.maxSupportImpulse ?? 0;
    const queue = this.#eventQueue;
    if (queue) {
      world.step(queue);
      // Observe (never alter) collision strength: max contact force over the
      // step, converted to an impulse magnitude (N·s) at the fixed timestep so
      // the FSM compares directly against physics.interruptCollisionImpulse.
      let maxForce = 0;
      let maxSupportForce = 0;
      queue.drainContactForceEvents((ev) => {
        const f = ev.maxForceMagnitude();
        if (Number.isFinite(f) && f > maxForce) maxForce = f;
        const total = ev.totalForce();
        const vertical = Math.abs(total.y);
        const horizontal = Math.hypot(total.x, total.z);
        if (Number.isFinite(vertical) && vertical > horizontal * 0.7 && f > maxSupportForce) {
          maxSupportForce = f;
        }
      });
      this.#lastContactImpulse = maxForce / hz;
      this.#lastSupportContactImpulse = Math.max(maxSupportForce / hz, wheelSupportImpulse);
    } else {
      world.step();
      this.#lastContactImpulse = 0;
      this.#lastSupportContactImpulse = wheelSupportImpulse;
    }
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
  }

  getStep(): number {
    return this.stepCount;
  }

  getSeed(): number {
    return this.seed;
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

  /**
   * Rideable-ground read (M3). At least two real wheel rays must be in contact
   * and the deck-up vector must remain inside the configured upright cone. A
   * deck balanced on its side can touch the floor, but it is not a stance a
   * rider can stand on or drive from.
   */
  isGrounded(): boolean {
    const body = this.requireBoard();
    const phys = this.config.physics;
    const q = body.rotation();
    const deckUpY = 1 - 2 * (q.x * q.x + q.z * q.z);
    return (
      Number.isFinite(deckUpY) &&
      deckUpY >= phys.ridableDeckUpDot &&
      this.#wheelContactCount() >= 2
    );
  }

  /** Four copied ray-wheel observations for tests and rendering only. */
  wheelObservations(): WheelObservation[] {
    const solver = this.#contactSolver;
    if (!solver) throw new Error('SimWorld.reset() must run before use');
    return solver.observations();
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
    if (!cmd.active) {
      this.#setWheelEngineForce(0);
      this.#setWheelBrake(0);
      this.#setTruckSteering(0, 0);
      return;
    }
    const body = this.requireBoard();
    const phys = this.config.physics;
    const loco = this.config.locomotion;
    const dt = 1 / phys.hz;
    const mass = phys.boardMass;

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
      const drive = clampNum(cmd.driveForce, 0, loco.cruiseDriveForce);
      const scale = clampNum(1 - fwdSpeed / loco.cruiseTargetSpeed, 0, 1);
      wheelDriveForce = drive * scale;
    }
    this.#setWheelEngineForce(wheelDriveForce);
    this.#setWheelBrake(clampNum(cmd.brakeForce, 0, loco.coastBrakeForce));

    // Wheel rays provide suspension contact while skateboard geometry owns
    // steering: actual deck lean pivots the two truck axles in opposite
    // directions, attenuated by speed and each axle's live suspension load.
    const frontLoad = this.#contactSolver?.frontLoad ?? 0;
    const rearLoad = this.#contactSolver?.rearLoad ?? 0;
    const truckSteer = skateboardTruckSteering({
      leanRad: Math.asin(clampNum(right.y, -1, 1)),
      speed: Math.hypot(lv.x, lv.z),
      frontLoad,
      rearLoad,
      leanToSteer: loco.truckLeanToSteer,
      maxSteerRad: (loco.truckSteerMaxDeg * Math.PI) / 180,
      speedFade: loco.truckSteerSpeedFade,
    });
    this.#setTruckSteering(truckSteer.front, truckSteer.rear);

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

    if (Number.isFinite(impulse.x) && Number.isFinite(impulse.z)) {
      body.applyImpulse({ x: impulse.x, y: 0, z: impulse.z }, true);
    }

    // --- Steering: the two-finger segment is a heading, not a throttle --------
    // Absolute control contract: the calibrated tail→nose finger angle is the
    // desired world board yaw. Initial placement is authoritative; there is no
    // hidden anchor to the board's previous heading.
    let headingRate = 0;
    if (cmd.steerAngle != null && Number.isFinite(cmd.steerAngle)) {
      const boardYaw = Math.atan2(fwd.x, fwd.z);
      const headingError = wrapPi(cmd.steerAngle - boardYaw);
      headingRate = loco.steerHeadingBiasGain * headingError;
    }
    const targetYaw = clampNum(
      cmd.targetYawRate + headingRate,
      -phys.steerYawRateMax,
      phys.steerYawRateMax,
    );
    const yawErr = targetYaw - av.y;
    const yawTorque = clampNum(loco.steerServoGain * yawErr, -loco.steerMaxTorque, loco.steerMaxTorque);
    const yawImpulse = yawTorque * dt;

    // --- Lean roll: small clamped torque about the board-forward axis ---------
    const rollTorque = clampNum(cmd.rollTorque, -loco.leanMaxRollTorque, loco.leanMaxRollTorque);
    const rollImpulse = rollTorque * dt;

    // Engine forces act below this unusually light chassis and would otherwise
    // wheelie the deck until its ray origins sink through the floor. Model the
    // planted rider's neutral fore/aft balance as an equal counter-pitch torque;
    // this changes no pose and leaves trick/air steps untouched (engine=0).
    const drivenWheels = this.#contactSolver ? 4 : 0;
    const enginePitchImpulse =
      wheelDriveForce * drivenWheels * (phys.truckDropY + phys.truckHalfExtents.y) * dt;

    const tx = fwd.x * rollImpulse + right.x * enginePitchImpulse;
    const ty = yawImpulse + fwd.y * rollImpulse + right.y * enginePitchImpulse;
    const tz = fwd.z * rollImpulse + right.z * enginePitchImpulse;
    if (Number.isFinite(tx) && Number.isFinite(ty) && Number.isFinite(tz)) {
      body.applyTorqueImpulse({ x: tx, y: ty, z: tz }, true);
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
        // A coupled lift + downward kick at the chosen end preserves the net
        // vertical pop impulse while creating pitch through the real lever arm.
        body.applyImpulse({ x: 0, y: jY + kick, z: 0 }, true);
        if (kick > 0) {
          const localZ = cmd.popSide === 'nose' ? lever : -lever;
          const endOffset = quatRotate(q, 0, 0, localZ);
          const com = body.worldCom();
          body.applyImpulseAtPoint(
            { x: 0, y: -kick, z: 0 },
            { x: com.x + endOffset.x, y: com.y + endOffset.y, z: com.z + endOffset.z },
            true,
          );
        }
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
        const m = phys.boardMass;
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
          phys.boardMass,
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
    }
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
    const deckUpY = 1 - 2 * (q.x * q.x + q.z * q.z);
    const supportedHeight = phys.boardLength * 0.55;
    const supportedAndUnrideable =
      Number.isFinite(p.y) &&
      Number.isFinite(lv.y) &&
      Number.isFinite(deckUpY) &&
      p.y <= supportedHeight &&
      Math.abs(lv.y) < 0.75 &&
      deckUpY < phys.ridableDeckUpDot;

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
