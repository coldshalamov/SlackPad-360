/**
 * ShoeAnimator (M7) — drives the disembodied hero shoes per the spec §5
 * placement table. PRESENTATION ONLY: reads ObserveState.feet + phase +
 * board.av and the interpolated board pose; never writes sim.
 *
 * The shoes are co-authored in board-local space and parented under the board
 * group, so their AUTHORED local transform IS the resting nose/tail socket. Each
 * foot's live board-local offset (ObserveState.feet[role].offset) is expressed
 * relative to the harness rest base `(0, deckTop, ±truckInsetZ)`. Hardware
 * contact positions are control intent, not a second skeletal rig: planted
 * shoes stay on their authored deck sockets instead of chasing raw HID jitter.
 *
 *   | Phase        | Placement                                              |
 *   | Ground both  | authored sockets, slight vertical squash               |
 *   | Contact noise| remain on sockets (no cosmetic foot seizure)             |
 *   | Pop / air    | rear-foot snap + front-foot slide, then level/catch      |
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

const FREE_FOOT_LIFT = 0.075;
const POP_FOOT_LIFT = 0.06;
const GUIDE_FOOT_LIFT = 0.035;
const GUIDE_SLIDE = 0.06;

type Role = 'nose' | 'tail';

interface ShoeState {
  role: Role;
  obj: THREE.Object3D;
  materials: THREE.Material[];
  authoredPos: THREE.Vector3;
  authoredQuat: THREE.Quaternion;
  authoredScale: THREE.Vector3;
  /** Conservative object-local bounds used to keep every sole above deck. */
  boundsCorners: THREE.Vector3[];
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

/**
 * Measure a static shoe subtree in the shoe root's own coordinates. Keeping
 * the eight corners of its conservative AABB is enough to enforce the live
 * deck plane after cosmetic rotation without depending on an asset-specific
 * pivot convention.
 */
function localBoundsCorners(obj: THREE.Object3D): THREE.Vector3[] {
  obj.updateWorldMatrix(true, true);
  const rootInv = obj.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  const p = new THREE.Vector3();
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    if (!b) return;
    for (const x of [b.min.x, b.max.x]) {
      for (const y of [b.min.y, b.max.y]) {
        for (const z of [b.min.z, b.max.z]) {
          p.set(x, y, z).applyMatrix4(mesh.matrixWorld).applyMatrix4(rootInv);
          bounds.expandByPoint(p);
        }
      }
    }
  });
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(), new THREE.Vector3());
  const corners: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  return corners;
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

  /**
   * The shoe GLB is authored as a side-by-side asset-review pair. Once the
   * renderer has assigned each shoe its stance role, its local position must be
   * the matching board socket instead — a skateboard stance is fore/aft along
   * the board's long axis, not left/right across the deck.
   *
   * Both shoes are also turned across the deck, the way feet (and two fingers
   * pointing toward the screen) actually sit on a skateboard. Regular points
   * toes toward +X; goofy mirrors toward -X.
   */
  static placeAtSockets(
    shoeNose: THREE.Object3D,
    shoeTail: THREE.Object3D,
    socketNose: THREE.Vector3,
    socketTail: THREE.Vector3,
    stance: Stance = 'regular',
  ): void {
    shoeNose.position.copy(socketNose);
    shoeTail.position.copy(socketTail);
    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      stance === 'regular' ? Math.PI / 2 : -Math.PI / 2,
    );
    // Runtime stance owns the orientation. Carrying arbitrary authored
    // review-scene rotation into play can pitch a sole through the deck.
    shoeNose.quaternion.copy(yaw);
    shoeTail.quaternion.copy(yaw);
  }

  #mkState(role: Role, obj: THREE.Object3D): ShoeState {
    return {
      role,
      obj,
      materials: collectMaterials(obj),
      authoredPos: obj.position.clone(),
      authoredQuat: obj.quaternion.clone(),
      authoredScale: obj.scale.clone(),
      boundsCorners: localBoundsCorners(obj),
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
    // Shoes are a control diagram, not a second physics system. While attached
    // they stay exactly at their authored deck sockets; the real rigid board
    // supplies every pop, flip and landing motion. Only bail detaches them.
    void obs;
    void dt;
    for (const s of this.#shoes) {
      s.delta.set(0, 0, 0);
      s.scaleY = 1;
      s.lean = 0;
      s.obj.position.copy(s.authoredPos);
      s.obj.quaternion.copy(s.authoredQuat);
      s.obj.scale.copy(s.authoredScale);
      this.#setOpacity(s, 1);
    }
  }

  /** Enforce the deck as a hard visual contact plane after all animation. */
  #raiseSoleToDeck(s: ShoeState): void {
    let minY = Number.POSITIVE_INFINITY;
    for (const corner of s.boundsCorners) {
      this.#tmp.copy(corner).multiply(s.obj.scale).applyQuaternion(s.obj.quaternion).add(s.obj.position);
      minY = Math.min(minY, this.#tmp.y);
    }
    const deckPlane = Math.max(s.authoredPos.y, this.#base.deckTopY);
    const penetration = deckPlane - minY;
    if (penetration > 0) s.obj.position.y += penetration;
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
