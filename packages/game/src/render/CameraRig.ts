/**
 * CameraRig (M7) — the presentation camera. It READS sim state (interpolated
 * board pose + ObserveState) and writes ONLY its own three.js camera. It never
 * touches input or the sim, and it never changes the board-local input frame
 * (spec §6): the pad→board mapping is camera-independent, so the rig is free to
 * frame however reads best.
 *
 * Shot modes are keyed off `ObserveState.phase`:
 *   ground/none/pop → low broadside 3/4 (mostly beside the board, with a small
 *                     trailing bias so both feet and deck motion stay legible)
 *   air             → pull-back (more distance + wider FOV so a full rotation
 *                     reads; the heading is FROZEN at take-off so flips don't
 *                     swing the camera)
 *   catch           → air pose tightening back toward chase
 *   bail            → wide slow-orbit hold (failure readable)
 *   grind           → overhead blend (implemented; only triggers once M6 emits
 *                     phase 'grind')
 *   replay/tutorial → mode enum placeholders (fall through to chase for now)
 *
 * Transitions: a critically damped spring (Unity-style SmoothDamp — the analytic
 * critically damped solution) on position, and a slerp with a max angular-rate
 * clamp on orientation. Occlusion: a sphere-cast spring-arm that shortens the
 * boom when a scene static sits between the look target and the camera.
 *
 * `reducedMotion` collapses every spring/slerp to an instant cut.
 */

import * as THREE from "three";
import type { CameraConfig, ObserveState } from "@slackpad/shared";
import type { RenderPose } from "../sim/SimWorld";

/** Camera shot modes (spec §6). Replay/tutorial are enum placeholders. */
export type ShotMode =
  "chase" | "air" | "catch" | "bail" | "grind" | "tutorial" | "replay";

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Vec3 critically damped spring (Unity SmoothDamp), velocity mutated in place. */
function smoothDampVec3(
  current: THREE.Vector3,
  target: THREE.Vector3,
  vel: THREE.Vector3,
  smoothTime: number,
  dt: number,
  out: THREE.Vector3,
): void {
  const st = Math.max(1e-4, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const changeX = current.x - target.x;
  const tempX = (vel.x + omega * changeX) * dt;
  const vx = (vel.x - omega * tempX) * exp;
  const ox = target.x + (changeX + tempX) * exp;
  const changeY = current.y - target.y;
  const tempY = (vel.y + omega * changeY) * dt;
  const vy = (vel.y - omega * tempY) * exp;
  const oy = target.y + (changeY + tempY) * exp;
  const changeZ = current.z - target.z;
  const tempZ = (vel.z + omega * changeZ) * dt;
  const vz = (vel.z - omega * tempZ) * exp;
  const oz = target.z + (changeZ + tempZ) * exp;
  vel.set(vx, vy, vz);
  out.set(ox, oy, oz);
}

/** Board heading (nose) projected flat onto the XZ plane. */
function flatHeading(q: THREE.Quaternion, out: THREE.Vector3): boolean {
  out.set(0, 0, 1).applyQuaternion(q);
  out.y = 0;
  if (out.lengthSq() < 1e-6) return false;
  out.normalize();
  return true;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  #cfg: CameraConfig;
  #reducedMotion: boolean;
  #initialized = false;

  // Spring state.
  readonly #posVel = new THREE.Vector3();
  #fov: number;

  // Frozen heading (updated only on the ground so mid-air flips never swing the
  // camera) + working temporaries reused each frame (no per-frame allocation).
  readonly #heading = new THREE.Vector3(0, 0, 1);
  #bailOrbit = 0;
  #lastMode: ShotMode = "chase";

  #occluders: THREE.Object3D[] = [];
  readonly #ray = new THREE.Raycaster();
  readonly #occlusionHits: THREE.Intersection[] = [];

  // Scratch.
  readonly #boardPos = new THREE.Vector3();
  readonly #boardQuat = new THREE.Quaternion();
  readonly #right = new THREE.Vector3();
  readonly #desiredPos = new THREE.Vector3();
  readonly #lookTarget = new THREE.Vector3();
  readonly #chasePos = new THREE.Vector3();
  readonly #chaseLook = new THREE.Vector3();
  readonly #airPos = new THREE.Vector3();
  readonly #airLook = new THREE.Vector3();
  readonly #smoothed = new THREE.Vector3();
  readonly #armDir = new THREE.Vector3();
  readonly #lookQuat = new THREE.Quaternion();
  readonly #lookMat = new THREE.Matrix4();

  constructor(config: CameraConfig, aspect: number, reducedMotion = false) {
    this.#cfg = config;
    this.#reducedMotion = reducedMotion;
    this.#fov = config.fovBase;
    this.camera = new THREE.PerspectiveCamera(
      config.fovBase,
      aspect,
      config.near,
      config.far,
    );
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setReducedMotion(flag: boolean): void {
    this.#reducedMotion = flag;
  }

  /** Static meshes the occlusion spring-arm may sphere-cast against. */
  setOccluders(meshes: THREE.Object3D[]): void {
    this.#occluders = meshes;
  }

  /** Map a maneuver phase to a shot mode. */
  #modeForPhase(phase: ObserveState["phase"]): ShotMode {
    switch (phase) {
      case "air":
        return "air";
      case "catch":
        return "catch";
      case "bail":
        return "bail";
      case "grind":
        return "grind";
      default:
        return "chase"; // none | ground | pop
    }
  }

  /**
   * Advance one presentation frame. `pose` is the interpolated board pose;
   * `obs` supplies phase + velocity; `dt` is real elapsed seconds.
   */
  update(pose: RenderPose, obs: ObserveState, dt: number): void {
    const cfg = this.#cfg;
    this.#boardPos.set(pose.p.x, pose.p.y, pose.p.z);
    this.#boardQuat.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);
    const mode = this.#modeForPhase(obs.phase);

    // Heading is refreshed only while grounded; airborne flips keep the frame.
    const grounded =
      obs.phase === "ground" || obs.phase === "none" || obs.phase === "pop";
    if (grounded) flatHeading(this.#boardQuat, this.#heading);
    const heading = this.#heading;
    this.#right.copy(WORLD_UP).cross(heading).normalize(); // right = up × heading

    const speed = Math.hypot(obs.board.lv.x, obs.board.lv.z);
    const laT = Math.min(
      1,
      Math.max(0, speed / Math.max(1e-3, cfg.lookAheadSpeedRef)),
    );
    const lookAhead =
      cfg.lookAheadMin + (cfg.lookAheadMax - cfg.lookAheadMin) * laT;

    // --- Chase low 3/4 (reused as the catch tighten target) ----------------
    this.#chasePos
      .copy(this.#boardPos)
      .addScaledVector(heading, -cfg.chaseDistance)
      .addScaledVector(WORLD_UP, cfg.chaseHeight)
      .addScaledVector(this.#right, cfg.chaseSide);
    this.#chaseLook
      .copy(this.#boardPos)
      .addScaledVector(heading, lookAhead)
      .addScaledVector(WORLD_UP, cfg.aimHeight);

    // --- Air pull-back ------------------------------------------------------
    this.#airPos
      .copy(this.#boardPos)
      .addScaledVector(heading, -cfg.airDistance)
      .addScaledVector(WORLD_UP, cfg.airHeight)
      .addScaledVector(this.#right, cfg.chaseSide * 1.15);
    this.#airLook
      .copy(this.#boardPos)
      .addScaledVector(WORLD_UP, cfg.aimHeight * 0.5);

    let desiredFov = cfg.fovBase;
    if (mode === "chase") {
      this.#desiredPos.copy(this.#chasePos);
      this.#lookTarget.copy(this.#chaseLook);
      desiredFov = cfg.fovBase;
    } else if (mode === "air") {
      this.#desiredPos.copy(this.#airPos);
      this.#lookTarget.copy(this.#airLook);
      desiredFov = cfg.fovAir;
    } else if (mode === "catch") {
      // Tighten from the air pose back toward chase.
      this.#desiredPos
        .copy(this.#airPos)
        .lerp(this.#chasePos, cfg.catchTighten);
      this.#lookTarget
        .copy(this.#airLook)
        .lerp(this.#chaseLook, cfg.catchTighten);
      desiredFov = cfg.fovAir + (cfg.fovBase - cfg.fovAir) * cfg.catchTighten;
    } else if (mode === "bail") {
      // Wide slow orbit; failure readable.
      this.#bailOrbit += cfg.bailOrbitRate * dt;
      this.#armDir.copy(heading).applyAxisAngle(WORLD_UP, this.#bailOrbit);
      this.#desiredPos
        .copy(this.#boardPos)
        .addScaledVector(this.#armDir, -cfg.bailDistance)
        .addScaledVector(WORLD_UP, cfg.bailHeight);
      this.#lookTarget
        .copy(this.#boardPos)
        .addScaledVector(WORLD_UP, cfg.aimHeight);
      desiredFov = cfg.fovBase;
    } else {
      // grind (overhead) + tutorial/replay placeholders → overhead-ish framing.
      this.#desiredPos
        .copy(this.#boardPos)
        .addScaledVector(WORLD_UP, cfg.grindHeight)
        .addScaledVector(this.#right, cfg.grindSide)
        .addScaledVector(heading, -cfg.grindLookAhead * 0.5);
      this.#lookTarget
        .copy(this.#boardPos)
        .addScaledVector(heading, cfg.grindLookAhead);
      desiredFov = cfg.fovBase;
    }
    if (mode !== "bail") this.#bailOrbit = 0;
    this.#lastMode = mode;

    // --- Position: critically damped spring (or instant cut) ---------------
    // The first pose must be a complete cut: easing orientation from the
    // PerspectiveCamera's identity rotation while position has already cut to
    // its target leaves the board behind the camera on the opening frame.
    const cutToTarget = !this.#initialized || this.#reducedMotion;
    if (cutToTarget) {
      this.#smoothed.copy(this.#desiredPos);
      this.#posVel.set(0, 0, 0);
      this.#initialized = true;
    } else {
      smoothDampVec3(
        this.camera.position,
        this.#desiredPos,
        this.#posVel,
        cfg.positionSmoothTime,
        dt,
        this.#smoothed,
      );
    }

    // --- Occlusion spring-arm (sphere-cast shorten) ------------------------
    this.#applyOcclusion(this.#smoothed);
    this.camera.position.copy(this.#smoothed);

    // --- Orientation: rate-clamped slerp toward the look-at --------------
    this.#lookMat.lookAt(this.camera.position, this.#lookTarget, WORLD_UP);
    this.#lookQuat.setFromRotationMatrix(this.#lookMat);
    if (cutToTarget) {
      this.camera.quaternion.copy(this.#lookQuat);
    } else {
      const maxStep = THREE.MathUtils.degToRad(cfg.maxAngularRateDeg) * dt;
      const angle = this.camera.quaternion.angleTo(this.#lookQuat);
      if (angle <= maxStep || angle < 1e-5) {
        this.camera.quaternion.copy(this.#lookQuat);
      } else {
        this.camera.quaternion.rotateTowards(this.#lookQuat, maxStep);
      }
    }

    // --- FOV ease -----------------------------------------------------------
    if (this.#reducedMotion) {
      this.#fov = desiredFov;
    } else {
      const k = 1 - Math.exp(-dt / Math.max(1e-4, cfg.positionSmoothTime));
      this.#fov += (desiredFov - this.#fov) * k;
    }
    if (Math.abs(this.camera.fov - this.#fov) > 1e-3) {
      this.camera.fov = this.#fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Shorten the boom if a static occluder sits between target and camera. */
  #applyOcclusion(pos: THREE.Vector3): void {
    if (this.#occluders.length === 0) return;
    this.#armDir.copy(pos).sub(this.#lookTarget);
    const dist = this.#armDir.length();
    if (dist < 1e-4) return;
    this.#armDir.divideScalar(dist);
    this.#ray.set(this.#lookTarget, this.#armDir);
    this.#ray.far = dist;
    this.#occlusionHits.length = 0;
    this.#ray.intersectObjects(this.#occluders, true, this.#occlusionHits);
    if (this.#occlusionHits.length > 0) {
      const hit = this.#occlusionHits[0]!;
      const shortened = Math.max(
        this.#cfg.occlusionMinDistance,
        hit.distance - this.#cfg.occlusionRadius,
      );
      pos
        .copy(this.#lookTarget)
        .addScaledVector(this.#armDir, Math.min(dist, shortened));
    }
  }

  /**
   * Run the rig to convergence for a still capture (screenshots): steps the
   * spring at a fixed dt until it settles. Presentation-only; does not touch sim.
   */
  settle(
    pose: RenderPose,
    obs: ObserveState,
    iterations = 48,
    dt = 1 / 60,
  ): void {
    for (let i = 0; i < iterations; i++) this.update(pose, obs, dt);
  }

  /** Current shot mode (diagnostics / self-check). */
  get mode(): ShotMode {
    return this.#lastMode;
  }
}
