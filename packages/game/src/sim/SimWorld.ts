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
import type { RigidBody, World } from '@dimforge/rapier3d-deterministic-compat';
import type { Quat, SimConfig, Vec3 } from '@slackpad/shared';
import { getLevelBuilder } from './levels/index';
import type { Rng } from './levels/types';
import type { GroundCommand } from '../control/GroundCommand';

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

export class SimWorld {
  // ECMAScript #private: the raw Rapier world/body must be unreachable at
  // runtime from anything holding a SimWorld (G6 anti-cheat hardening).
  #world: World | null = null;
  #board: RigidBody | null = null;
  private stepCount = 0;
  private seed = 0;
  private levelId = '';

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
    if (this.#world) {
      this.#world.free();
      this.#world = null;
      this.#board = null;
    }

    const phys = this.config.physics;
    const world = new RAPIER.World(phys.gravity);
    world.timestep = 1 / phys.hz;

    const rng = mulberry32(mixSeed(seed));
    const handle = getLevelBuilder(levelId)(RAPIER, world, this.config, rng);

    this.#world = world;
    this.#board = handle.board;
    this.stepCount = 0;
    this.seed = seed;
    this.levelId = levelId;

    const pose = this.readRenderPose();
    this.prevPose = pose;
    this.currPose = pose;
  }

  /** Advance exactly one fixed step and refresh pose snapshots. */
  step(): void {
    const world = this.requireWorld();
    world.step();
    this.stepCount += 1;
    this.prevPose = this.currPose;
    this.currPose = this.readRenderPose();
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
   * Ground-proximity read (M3). True when the board center is within
   * `physics.groundedTolerance` of its resting height (truckDropY + truck
   * half-height). During the spawn drop the board is high, so this reads false
   * until it settles — the controller applies no ground forces mid-air. This is
   * the narrow query BoardController may consult; it never exposes the body.
   */
  isGrounded(): boolean {
    const body = this.requireBoard();
    const phys = this.config.physics;
    const restHeight = phys.truckDropY + phys.truckHalfExtents.y;
    const y = body.translation().y;
    return Number.isFinite(y) && y <= restHeight + phys.groundedTolerance;
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
    if (!cmd.active) return;
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

    // --- Cruise drive: force-based saturation toward cruiseTargetSpeed --------
    if (hasForward && loco.cruiseTargetSpeed > 1e-4) {
      const drive = clampNum(cmd.driveForce, 0, loco.cruiseDriveForce);
      const scale = clampNum(1 - fwdSpeed / loco.cruiseTargetSpeed, 0, 1);
      const mag = drive * scale * dt;
      impulse.x += fx * mag;
      impulse.z += fz * mag;
    }

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

    // --- Steering: torque servo toward the clamped target yaw rate ------------
    const targetYaw = clampNum(cmd.targetYawRate, -phys.steerYawRateMax, phys.steerYawRateMax);
    const yawErr = targetYaw - av.y;
    const yawTorque = clampNum(loco.steerServoGain * yawErr, -loco.steerMaxTorque, loco.steerMaxTorque);
    const yawImpulse = yawTorque * dt;

    // --- Lean roll: small clamped torque about the board-forward axis ---------
    const rollTorque = clampNum(cmd.rollTorque, -loco.leanMaxRollTorque, loco.leanMaxRollTorque);
    const rollImpulse = rollTorque * dt;

    const tx = fwd.x * rollImpulse;
    const ty = yawImpulse + fwd.y * rollImpulse;
    const tz = fwd.z * rollImpulse;
    if (Number.isFinite(tx) && Number.isFinite(ty) && Number.isFinite(tz)) {
      body.applyTorqueImpulse({ x: tx, y: ty, z: tz }, true);
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
    if (this.#world) {
      this.#world.free();
      this.#world = null;
      this.#board = null;
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
