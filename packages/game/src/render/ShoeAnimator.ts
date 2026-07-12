/**
 * ShoeAnimator (M7) — drives the disembodied hero shoes per the spec §5
 * placement table. PRESENTATION ONLY: reads ObserveState.feet + phase +
 * board.av and the interpolated board pose; never writes sim.
 *
 * The shoes are co-authored in board-local space and parented under the board
 * group, so their AUTHORED local transform IS the resting nose/tail socket. Each
 * foot's live board-local offset (ObserveState.feet[role].offset) is expressed
 * relative to the harness rest base `(0, deckTop, ±truckInsetZ)`; the difference
 * is a "pad delta" added on top of the authored socket. This decouples the art's
 * socket position from the harness's rest convention (advisor note) and means
 * the ground-both case sits exactly on the authored sockets with zero delta.
 *
 *   | Phase        | Placement                                              |
 *   | Ground both  | authored sockets, slight vertical squash               |
 *   | One plant    | planted foot follows its pad delta; free foot at socket |
 *   | Air          | freeze last offsets + subtle lean opposing flip roll   |
 *   | Catch        | ease delta → 0 (back to sockets) over the catch rate    |
 *   | Bail         | detach, integrate ballistic in render space, fade out   |
 *   | Respawn      | reattach cleanly at the sockets                        |
 *
 * All blends are per-second exponential (a = 1 − e^(−rate·dt)) → no pops.
 */

import * as THREE from 'three';
import type { PresentationConfig, Stance, ObserveState } from '@slackpad/shared';
import type { RenderPose } from '../sim/SimWorld';

/** Harness rest base used to derive the pad delta (board-local). */
export interface ShoeRestBase {
  deckTopY: number;
  noseZ: number;
  tailZ: number;
}

/** Clamp on the pad delta so a big foot slide never throws a shoe off the deck. */
const MAX_DELTA = 0.3;

type Role = 'nose' | 'tail';

interface ShoeState {
  role: Role;
  obj: THREE.Object3D;
  materials: THREE.Material[];
  authoredPos: THREE.Vector3;
  authoredQuat: THREE.Quaternion;
  authoredScale: THREE.Vector3;
  // Smoothed presentation state.
  delta: THREE.Vector3;
  scaleY: number;
  lean: number;
  // Bail ballistic (render-space world) state.
  worldPos: THREE.Vector3;
  worldQuat: THREE.Quaternion;
  worldVel: THREE.Vector3;
  tumble: number;
  fade: number;
}

function collectMaterials(obj: THREE.Object3D): THREE.Material[] {
  const out: THREE.Material[] = [];
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material;
    if (Array.isArray(m)) out.push(...m);
    else if (m) out.push(m);
  });
  return out;
}

export class ShoeAnimator {
  #shoes: ShoeState[];
  #cfg: PresentationConfig;
  #base: ShoeRestBase;
  #bailActive = false;

  // Per-frame scratch (no allocation in update()).
  readonly #boardPos = new THREE.Vector3();
  readonly #boardQuat = new THREE.Quaternion();
  readonly #invQuat = new THREE.Quaternion();
  readonly #av = new THREE.Vector3();
  readonly #tmp = new THREE.Vector3();
  readonly #leanQuat = new THREE.Quaternion();
  readonly #tumbleQuat = new THREE.Quaternion();
  readonly #zAxis = new THREE.Vector3(0, 0, 1);
  readonly #tumbleAxis = new THREE.Vector3(1, 0.4, 0).normalize();

  /**
   * @param shoeNose the shoe object representing the NOSE (front) foot
   * @param shoeTail the shoe object representing the TAIL (back) foot
   * Both must already be parented under the board group with their authored
   * board-local transforms (use boardGroup.attach()).
   */
  constructor(
    shoeNose: THREE.Object3D,
    shoeTail: THREE.Object3D,
    cfg: PresentationConfig,
    base: ShoeRestBase,
  ) {
    this.#cfg = cfg;
    this.#base = base;
    this.#shoes = [
      this.#mkState('nose', shoeNose),
      this.#mkState('tail', shoeTail),
    ];
  }

  /** Resolve which authored shoe (L/R) is the nose foot for a stance. */
  static roleOfShoe(stance: Stance): { nose: 'L' | 'R'; tail: 'L' | 'R' } {
    // Regular = left foot forward (nose); goofy = right foot forward.
    return stance === 'goofy' ? { nose: 'R', tail: 'L' } : { nose: 'L', tail: 'R' };
  }

  #mkState(role: Role, obj: THREE.Object3D): ShoeState {
    return {
      role,
      obj,
      materials: collectMaterials(obj),
      authoredPos: obj.position.clone(),
      authoredQuat: obj.quaternion.clone(),
      authoredScale: obj.scale.clone(),
      delta: new THREE.Vector3(),
      scaleY: 1,
      lean: 0,
      worldPos: new THREE.Vector3(),
      worldQuat: new THREE.Quaternion(),
      worldVel: new THREE.Vector3(),
      tumble: 0,
      fade: 0,
    };
  }

  #foot(obs: ObserveState, role: Role): ObserveState['feet']['nose'] {
    return role === 'nose' ? obs.feet.nose : obs.feet.tail;
  }

  #setOpacity(s: ShoeState, o: number): void {
    const opaque = o >= 0.999;
    for (const m of s.materials) {
      const mm = m as THREE.Material & { opacity: number };
      mm.transparent = !opaque;
      mm.opacity = o;
      mm.depthWrite = opaque;
    }
  }

  update(pose: RenderPose, obs: ObserveState, dt: number): void {
    this.#boardPos.set(pose.p.x, pose.p.y, pose.p.z);
    this.#boardQuat.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);
    this.#invQuat.copy(this.#boardQuat).conjugate();

    if (obs.phase === 'bail') {
      this.#updateBail(obs, dt);
      return;
    }
    if (this.#bailActive) this.#reattach();
    this.#updateAttached(obs, dt);
  }

  #updateAttached(obs: ObserveState, dt: number): void {
    const cfg = this.#cfg;
    const phase = obs.phase;
    const air = phase === 'air';
    const isCatch = phase === 'catch';

    // Board-local roll rate for the air lean (cosmetic).
    this.#av.set(obs.board.av.x, obs.board.av.y, obs.board.av.z).applyQuaternion(this.#invQuat);
    const rollRate = this.#av.z;
    const maxLean = THREE.MathUtils.degToRad(cfg.shoeAirLeanMaxDeg);
    const targetLeanAir = THREE.MathUtils.clamp(-cfg.shoeAirLeanGain * rollRate, -maxLean, maxLean);

    for (const s of this.#shoes) {
      const foot = this.#foot(obs, s.role);

      // Pad delta (board-local): live offset minus the harness rest base.
      const baseZ = s.role === 'nose' ? this.#base.noseZ : this.#base.tailZ;
      const dX = THREE.MathUtils.clamp(foot.offset.x - 0, -MAX_DELTA, MAX_DELTA);
      const dY = THREE.MathUtils.clamp(foot.offset.y - this.#base.deckTopY, -MAX_DELTA, MAX_DELTA);
      const dZ = THREE.MathUtils.clamp(foot.offset.z - baseZ, -MAX_DELTA, MAX_DELTA);

      let rate: number;
      let targetX = 0;
      let targetY = 0;
      let targetZ = 0;
      let targetScaleY = 1;
      let targetLean = 0;

      if (air) {
        // Freeze offsets; only the lean tracks the flip roll.
        rate = 0;
        targetX = s.delta.x;
        targetY = s.delta.y;
        targetZ = s.delta.z;
        targetScaleY = s.scaleY;
        targetLean = targetLeanAir;
      } else if (isCatch) {
        // Ease back to the sockets over the catch rate.
        rate = cfg.shoeCatchBlendRate;
        targetScaleY = 1;
      } else {
        // Ground / none / pop: planted foot follows its pad delta, free rests.
        rate = cfg.shoeGroundBlendRate;
        if (foot.planted) {
          targetX = dX;
          targetY = dY;
          targetZ = dZ;
          targetScaleY = cfg.shoeSquashY;
        }
      }

      // Lean always eases (toward 0 unless in air) at the ground rate.
      const leanRate = air ? cfg.shoeGroundBlendRate : cfg.shoeGroundBlendRate;
      const aLean = 1 - Math.exp(-leanRate * dt);
      s.lean += (targetLean - s.lean) * aLean;

      if (rate > 0) {
        const a = 1 - Math.exp(-rate * dt);
        s.delta.x += (targetX - s.delta.x) * a;
        s.delta.y += (targetY - s.delta.y) * a;
        s.delta.z += (targetZ - s.delta.z) * a;
        s.scaleY += (targetScaleY - s.scaleY) * a;
      }

      // Apply: authored socket + delta, lean about board-local long axis, squash.
      s.obj.position.copy(s.authoredPos).add(s.delta);
      this.#leanQuat.setFromAxisAngle(this.#zAxis, s.lean);
      s.obj.quaternion.copy(this.#leanQuat).multiply(s.authoredQuat);
      s.obj.scale.set(s.authoredScale.x, s.authoredScale.y * s.scaleY, s.authoredScale.z);
    }
  }

  #updateBail(obs: ObserveState, dt: number): void {
    const cfg = this.#cfg;
    if (!this.#bailActive) {
      // Detach: snapshot current world transform + inherit board velocity.
      for (const s of this.#shoes) {
        this.#tmp.copy(s.obj.position).applyQuaternion(this.#boardQuat).add(this.#boardPos);
        s.worldPos.copy(this.#tmp);
        s.worldQuat.copy(this.#boardQuat).multiply(s.obj.quaternion);
        // Inherit board linear velocity + a small outward/upward kick.
        s.worldVel.set(obs.board.lv.x, obs.board.lv.y + 1.2, obs.board.lv.z);
        s.tumble = 0;
        s.fade = 0;
      }
      this.#bailActive = true;
    }

    const fadeStep = cfg.bailShoeFadeMs > 0 ? (dt * 1000) / cfg.bailShoeFadeMs : 1;
    for (const s of this.#shoes) {
      s.worldVel.y += cfg.bailShoeGravity * dt;
      s.worldPos.addScaledVector(s.worldVel, dt);
      s.tumble += cfg.bailShoeSpin * dt;
      s.fade = Math.min(1, s.fade + fadeStep);

      // Convert the ballistic world transform back into board-local space (the
      // shoe is still parented under the physically-tumbling board group).
      this.#tmp.copy(s.worldPos).sub(this.#boardPos).applyQuaternion(this.#invQuat);
      s.obj.position.copy(this.#tmp);
      this.#tumbleQuat.setFromAxisAngle(this.#tumbleAxis, s.tumble);
      s.obj.quaternion.copy(this.#invQuat).multiply(s.worldQuat).multiply(this.#tumbleQuat);
      s.obj.scale.copy(s.authoredScale);
      this.#setOpacity(s, 1 - 0.85 * s.fade);
    }
  }

  /** Respawn: clean reattach at the sockets, full opacity. */
  #reattach(): void {
    this.#bailActive = false;
    for (const s of this.#shoes) {
      s.delta.set(0, 0, 0);
      s.scaleY = 1;
      s.lean = 0;
      s.tumble = 0;
      s.fade = 0;
      this.#setOpacity(s, 1);
    }
  }
}
