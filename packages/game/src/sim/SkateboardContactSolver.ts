import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type { RigidBody, World } from '@dimforge/rapier3d-deterministic-compat';
import type { PhysicsConfig, Quat, Vec3 } from '@slackpad/shared';

export type SkateWheelId = 'nose-left' | 'nose-right' | 'tail-left' | 'tail-right';

export interface SkateWheelObservation {
  id: SkateWheelId;
  inContact: boolean;
  contactPoint: Vec3 | null;
  contactNormal: Vec3 | null;
  suspensionLength: number;
  rotation: number;
  normalLoad: number;
  suspensionCompression: number;
  longitudinalSlip: number;
  lateralSlip: number;
}

interface WheelState extends SkateWheelObservation {
  connection: Vec3;
  steering: number;
  load: number;
}

const WHEEL_IDS: readonly SkateWheelId[] = [
  'nose-left',
  'nose-right',
  'tail-left',
  'tail-right',
];

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z);
  return length > 1e-8
    ? { x: v.x / length, y: v.y / length, z: v.z / length }
    : { x: 0, y: 0, z: 0 };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function quatRotate(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/**
 * Four independent skateboard wheel/truck contacts. Rapier remains the rigid-
 * body integrator and collision query authority, but no car drivetrain,
 * differential, axle, or vehicle-controller behavior participates.
 */
export class SkateboardContactSolver {
  readonly #wheels: WheelState[];
  #engineForce = 0;
  #brakeForce = 0;
  #frontLoad = 0;
  #rearLoad = 0;
  #maxSupportImpulse = 0;

  constructor(private readonly config: PhysicsConfig) {
    const p = config;
    const rest = p.wheelSuspensionRestLength + p.deckThickness / 2;
    const connections: Vec3[] = [
      { x: -p.wheelHalfTrack, y: 0, z: p.truckInsetZ },
      { x: p.wheelHalfTrack, y: 0, z: p.truckInsetZ },
      { x: -p.wheelHalfTrack, y: 0, z: -p.truckInsetZ },
      { x: p.wheelHalfTrack, y: 0, z: -p.truckInsetZ },
    ];
    this.#wheels = connections.map((connection, index) => ({
      id: WHEEL_IDS[index]!,
      connection,
      steering: 0,
      load: 0,
      inContact: false,
      contactPoint: null,
      contactNormal: null,
      suspensionLength: rest + p.wheelMaxSuspensionTravel,
      rotation: 0,
      normalLoad: 0,
      suspensionCompression: 0,
      longitudinalSlip: 0,
      lateralSlip: 0,
    }));
  }

  setEngineForce(force: number): void {
    this.#engineForce = Number.isFinite(force) ? Math.max(0, force) : 0;
  }

  setBrake(force: number): void {
    this.#brakeForce = Number.isFinite(force) ? Math.max(0, force) : 0;
  }

  setSteering(front: number, rear: number): void {
    for (let i = 0; i < this.#wheels.length; i++) {
      this.#wheels[i]!.steering = i < 2 ? front : rear;
    }
  }

  update(world: World, body: RigidBody, dt: number): void {
    const p = this.config;
    const systemMass = p.boardMass + p.riderMass;
    const q = body.rotation();
    const origin = body.translation();
    const down = normalize(quatRotate(q, { x: 0, y: -1, z: 0 }));
    const rest = p.wheelSuspensionRestLength + p.deckThickness / 2;
    const castDistance = rest + p.wheelMaxSuspensionTravel;
    const wheelShape = new RAPIER.Ball(p.wheelRadius);
    this.#frontLoad = 0;
    this.#rearLoad = 0;
    this.#maxSupportImpulse = 0;

    for (let index = 0; index < this.#wheels.length; index++) {
      const wheel = this.#wheels[index]!;
      wheel.load = 0;
      wheel.inContact = false;
      wheel.contactPoint = null;
      wheel.contactNormal = null;
      wheel.suspensionLength = rest + p.wheelMaxSuspensionTravel;
      wheel.normalLoad = 0;
      wheel.suspensionCompression = 0;
      wheel.longitudinalSlip = 0;
      wheel.lateralSlip = 0;

      const offset = quatRotate(q, wheel.connection);
      const hardPoint = {
        x: origin.x + offset.x,
        y: origin.y + offset.y,
        z: origin.z + offset.z,
      };
      const hit = world.castShape(
        hardPoint,
        { x: 0, y: 0, z: 0, w: 1 },
        down,
        wheelShape,
        0,
        castDistance,
        true,
        undefined,
        undefined,
        undefined,
        body,
      );
      if (!hit) continue;

      // World.castShape returns world-space witness/normal data even though the
      // base ShapeCastHit declaration describes local-space values. Rotating
      // normal2 by the collider transform again doubles a bank's angle. Use the
      // world-space wheel-facing normal1 directly.
      let normal = normalize(hit.normal1);
      // GJK shape casts can return a tiny tangential component for a sphere
      // against a huge, truly level planar box. Snap that numerical noise only
      // when the hit collider itself is level. A shallow bank/transition may
      // also have normal.y > 0.995, but its rotated collider-up must survive so
      // gravity, pumping, and truck traction see the real surface.
      const colliderRotation = hit.collider.rotation();
      const colliderUp = quatRotate(colliderRotation, { x: 0, y: 1, z: 0 });
      if (colliderUp.y > 0.999999 && normal.y > 0.995) {
        normal = { x: 0, y: 1, z: 0 };
      }
      const supportAlignment = -dot(down, normal);
      if (supportAlignment < 0.2) continue;
      const suspensionLength = clamp(
        hit.time_of_impact,
        Math.max(0, rest - p.wheelMaxSuspensionTravel),
        rest + p.wheelMaxSuspensionTravel,
      );
      const wheelCenter = {
        x: hardPoint.x + down.x * hit.time_of_impact,
        y: hardPoint.y + down.y * hit.time_of_impact,
        z: hardPoint.z + down.z * hit.time_of_impact,
      };
      // Rapier's World query returns witness1 in world space (despite the base
      // ShapeCastHit declaration describing shape-local witnesses). Keep that
      // exact point instead of reconstructing it from a noisy radial normal.
      const point = {
        x: hit.witness1.x,
        y: hit.witness1.y,
        z: hit.witness1.z,
      };
      const pointVelocity = body.velocityAtPoint(wheelCenter);
      const normalSpeed = pointVelocity.x * normal.x + pointVelocity.y * normal.y + pointVelocity.z * normal.z;
      const compression = Math.max(0, rest - suspensionLength);
      const damping = normalSpeed < 0
        ? p.wheelSuspensionCompression
        : p.wheelSuspensionRelaxation;
      const springForce = p.wheelSuspensionStiffness * systemMass * compression;
      const supportForce = clamp(
        springForce * supportAlignment - damping * systemMass * normalSpeed,
        0,
        p.wheelMaxSuspensionForce,
      );
      const supportImpulse = supportForce * dt;

      wheel.inContact = true;
      wheel.contactPoint = { x: point.x, y: point.y, z: point.z };
      wheel.contactNormal = normal;
      wheel.suspensionLength = suspensionLength;
      wheel.load = supportForce;
      wheel.normalLoad = supportForce;
      wheel.suspensionCompression = compression;
      if (index < 2) this.#frontLoad += supportForce;
      else this.#rearLoad += supportForce;
      this.#maxSupportImpulse = Math.max(
        this.#maxSupportImpulse,
        supportImpulse > 0 ? supportImpulse : Number.EPSILON,
      );

      if (supportImpulse > 0) {
        body.applyImpulseAtPoint(
          {
            x: normal.x * supportImpulse,
            y: normal.y * supportImpulse,
            z: normal.z * supportImpulse,
          },
          wheelCenter,
          true,
        );
      }

      // Each truck steers its wheel rolling axis in the deck plane. Project the
      // result onto the actual contacted surface so banks and transitions feed
      // traction through their normals instead of a world-horizontal shortcut.
      const localForward = {
        x: Math.sin(wheel.steering),
        y: 0,
        z: Math.cos(wheel.steering),
      };
      const rawForward = quatRotate(q, localForward);
      const intoNormal = dot(rawForward, normal);
      const forward = normalize({
        x: rawForward.x - normal.x * intoNormal,
        y: rawForward.y - normal.y * intoNormal,
        z: rawForward.z - normal.z * intoNormal,
      });
      const right = normalize(cross(normal, forward));
      const longitudinalSpeed = dot(pointVelocity, forward);
      const lateralSpeed = dot(pointVelocity, right);
      // Wheels are currently massless rolling constraints: their visual spin
      // is derived directly from travel, so they have no independent angular
      // velocity from which physical longitudinal slip can be measured. Zero
      // is the honest diagnostic for pure rolling; lateral slip remains the
      // real contact-patch velocity that the solver actively corrects.
      wheel.longitudinalSlip = 0;
      wheel.lateralSlip = lateralSpeed;
      const frictionCap = supportImpulse * Math.max(0, p.wheelFrictionSlip);
      // #engineForce is the total rider push/drive force. Split it across the
      // four wheel patches exactly once instead of applying four copies.
      const driveImpulse = this.#engineForce * dt * 0.25;
      const brakeImpulse = longitudinalSpeed === 0
        ? 0
        : -Math.sign(longitudinalSpeed) * Math.min(
            Math.abs(longitudinalSpeed) * systemMass / 4,
            this.#brakeForce * dt * 0.25,
          );
      const longitudinalImpulse = clamp(
        driveImpulse + brakeImpulse,
        -frictionCap,
        frictionCap,
      );
      const lateralGain = clamp(p.wheelSideFrictionStiffness * dt, 0, 1);
      const lateralImpulse = clamp(
        -lateralSpeed * systemMass * 0.25 * lateralGain,
        -frictionCap,
        frictionCap,
      );
      if (forward.x !== 0 || forward.y !== 0 || forward.z !== 0) {
        body.applyImpulseAtPoint(
          {
            x: forward.x * longitudinalImpulse + right.x * lateralImpulse,
            y: forward.y * longitudinalImpulse + right.y * lateralImpulse,
            z: forward.z * longitudinalImpulse + right.z * lateralImpulse,
          },
          wheelCenter,
          true,
        );
      }
      wheel.rotation += longitudinalSpeed / Math.max(1e-4, p.wheelRadius) * dt;
    }
  }

  get frontLoad(): number { return this.#frontLoad; }
  get rearLoad(): number { return this.#rearLoad; }
  get maxSupportImpulse(): number { return this.#maxSupportImpulse; }
  get contactCount(): number {
    let count = 0;
    for (const wheel of this.#wheels) if (wheel.inContact) count += 1;
    return count;
  }

  /** Load-weighted world-space support normal from the latest wheel solve. */
  get supportNormal(): Vec3 | null {
    let x = 0;
    let y = 0;
    let z = 0;
    let load = 0;
    for (const wheel of this.#wheels) {
      if (!wheel.inContact || !wheel.contactNormal || wheel.load <= 0) continue;
      x += wheel.contactNormal.x * wheel.load;
      y += wheel.contactNormal.y * wheel.load;
      z += wheel.contactNormal.z * wheel.load;
      load += wheel.load;
    }
    return load > 1e-6 ? normalize({ x, y, z }) : null;
  }

  observations(): SkateWheelObservation[] {
    return this.#wheels.map((wheel) => ({
      id: wheel.id,
      inContact: wheel.inContact,
      contactPoint: wheel.contactPoint ? { ...wheel.contactPoint } : null,
      contactNormal: wheel.contactNormal ? { ...wheel.contactNormal } : null,
      suspensionLength: wheel.suspensionLength,
      rotation: wheel.rotation,
      normalLoad: wheel.normalLoad,
      suspensionCompression: wheel.suspensionCompression,
      longitudinalSlip: wheel.longitudinalSlip,
      lateralSlip: wheel.lateralSlip,
    }));
  }
}
