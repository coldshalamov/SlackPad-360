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
    const q = body.rotation();
    const origin = body.translation();
    const down = normalize(quatRotate(q, { x: 0, y: -1, z: 0 }));
    const rest = p.wheelSuspensionRestLength + p.deckThickness / 2;
    const rayLength = rest + p.wheelMaxSuspensionTravel + p.wheelRadius;
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

      const offset = quatRotate(q, wheel.connection);
      const hardPoint = {
        x: origin.x + offset.x,
        y: origin.y + offset.y,
        z: origin.z + offset.z,
      };
      const ray = new RAPIER.Ray(hardPoint, down);
      const hit = world.castRayAndGetNormal(
        ray,
        rayLength,
        true,
        undefined,
        undefined,
        undefined,
        body,
      );
      if (!hit) continue;

      const normal = normalize({ x: hit.normal.x, y: hit.normal.y, z: hit.normal.z });
      const supportAlignment = -dot(down, normal);
      if (supportAlignment < 0.2) continue;
      const point = ray.pointAt(hit.timeOfImpact);
      const suspensionLength = clamp(
        hit.timeOfImpact - p.wheelRadius,
        Math.max(0, rest - p.wheelMaxSuspensionTravel),
        rest + p.wheelMaxSuspensionTravel,
      );
      const wheelCenter = {
        x: point.x + normal.x * p.wheelRadius,
        y: point.y + normal.y * p.wheelRadius,
        z: point.z + normal.z * p.wheelRadius,
      };
      const pointVelocity = body.velocityAtPoint(wheelCenter);
      const normalSpeed = pointVelocity.x * normal.x + pointVelocity.y * normal.y + pointVelocity.z * normal.z;
      const compression = Math.max(0, rest - suspensionLength);
      const damping = normalSpeed < 0
        ? p.wheelSuspensionCompression
        : p.wheelSuspensionRelaxation;
      const springForce = p.wheelSuspensionStiffness * p.boardMass * compression;
      const supportForce = clamp(
        springForce * supportAlignment - damping * p.boardMass * normalSpeed,
        0,
        p.wheelMaxSuspensionForce,
      );
      const supportImpulse = supportForce * dt;

      wheel.inContact = true;
      wheel.contactPoint = { x: point.x, y: point.y, z: point.z };
      wheel.contactNormal = normal;
      wheel.suspensionLength = suspensionLength;
      wheel.load = supportForce;
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
      const frictionCap = supportImpulse * Math.max(0, p.wheelFrictionSlip);
      const driveImpulse = this.#engineForce * dt;
      const brakeImpulse = longitudinalSpeed === 0
        ? 0
        : -Math.sign(longitudinalSpeed) * Math.min(
            Math.abs(longitudinalSpeed) * p.boardMass / 4,
            this.#brakeForce * dt,
          );
      const longitudinalImpulse = clamp(
        driveImpulse + brakeImpulse,
        -frictionCap,
        frictionCap,
      );
      const lateralGain = clamp(p.wheelSideFrictionStiffness * dt, 0, 1);
      const lateralImpulse = clamp(
        -lateralSpeed * p.boardMass * 0.25 * lateralGain,
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

  get contactCount(): number {
    return this.#wheels.reduce((count, wheel) => count + (wheel.inContact ? 1 : 0), 0);
  }

  get frontLoad(): number { return this.#frontLoad; }
  get rearLoad(): number { return this.#rearLoad; }
  get maxSupportImpulse(): number { return this.#maxSupportImpulse; }

  observations(): SkateWheelObservation[] {
    return this.#wheels.map((wheel) => ({
      id: wheel.id,
      inContact: wheel.inContact,
      contactPoint: wheel.contactPoint ? { ...wheel.contactPoint } : null,
      contactNormal: wheel.contactNormal ? { ...wheel.contactNormal } : null,
      suspensionLength: wheel.suspensionLength,
      rotation: wheel.rotation,
    }));
  }
}
