import type { TransitionConfig, Vec3 } from '@slackpad/shared';

export type TransitionAssistKind = 'none' | 'pump' | 'lip-launch' | 'landing';

/** One internal-physics-substep sample. All data is plain and deterministic. */
export interface TransitionAssistSample {
  /** At least two physical wheel contacts support a rideable deck. */
  supported: boolean;
  /** Load-weighted world-space wheel support normal, when supported. */
  supportNormal: Vec3 | null;
  boardUp: Vec3;
  velocity: Vec3;
  angularVelocity: Vec3;
  dt: number;
  totalMass: number;
}

/**
 * Bounded physical request for SimWorld. `angularDelta` is converted through
 * the body's effective inertia and clamped by `angularImpulseMax`; no pose or
 * velocity is ever assigned.
 */
export interface TransitionAssistAction {
  kind: TransitionAssistKind;
  linearImpulse: Vec3;
  angularDelta: Vec3;
  angularImpulseMax: number;
  slopeDeg: number;
}

interface ArmedLip {
  uphillSpeed: number;
  travelHorizontal: Vec3;
  slopeDeg: number;
}

const ZERO: Readonly<Vec3> = Object.freeze({ x: 0, y: 0, z: 0 });

function none(slopeDeg = 0): TransitionAssistAction {
  return {
    kind: 'none',
    linearImpulse: { ...ZERO },
    angularDelta: { ...ZERO },
    angularImpulseMax: 0,
    slopeDeg,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalized(value: Vec3): Vec3 | null {
  const length = Math.hypot(value.x, value.y, value.z);
  if (!Number.isFinite(length) || length <= 1e-8) return null;
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

/** Rideability predicate shared by SimWorld and deterministic vert tests. */
export function isRideableWheelSupport(
  boardUpValue: Vec3,
  supportNormalValue: Vec3 | null,
  wheelContacts: number,
  minAlignment: number,
): boolean {
  if (wheelContacts < 2) return false;
  const boardUp = normalized(boardUpValue);
  if (!boardUp) return false;
  const supportNormal = supportNormalValue ? normalized(supportNormalValue) : null;
  const supportAlignment = supportNormal ? dot(boardUp, supportNormal) : -1;
  return Math.max(boardUp.y, supportAlignment) >= clamp(minAlignment, -1, 1);
}

function boundedMagnitude(value: Vec3, maxMagnitude: number): Vec3 {
  const magnitude = Math.hypot(value.x, value.y, value.z);
  const cap = Math.max(0, Number.isFinite(maxMagnitude) ? maxMagnitude : 0);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-9 || cap <= 0) return { ...ZERO };
  if (magnitude <= cap) return value;
  const scale = cap / magnitude;
  return { x: value.x * scale, y: value.y * scale, z: value.z * scale };
}

/**
 * Stateful simcade transition controller.
 *
 * It only arms after sustained, uphill, sloped wheel support. A subsequent
 * support loss gets one speed-proportional lip impulse; ordinary flat-ground
 * hops and downhill drop-offs receive nothing. A returning board receives a
 * bounded angular correction only when already close to the transition plane.
 */
export class TransitionAssist {
  #wasSupported = false;
  #supportedSubsteps = 0;
  #airborneSubsteps = 0;
  #armedLip: ArmedLip | null = null;
  #pendingLip: ArmedLip | null = null;
  #departureSubsteps = 0;

  constructor(private readonly config: TransitionConfig) {}

  reset(): void {
    this.#wasSupported = false;
    this.#supportedSubsteps = 0;
    this.#airborneSubsteps = 0;
    this.#armedLip = null;
    this.#pendingLip = null;
    this.#departureSubsteps = 0;
  }

  update(sample: TransitionAssistSample): TransitionAssistAction {
    const normal = sample.supportNormal ? normalized(sample.supportNormal) : null;
    const supported = sample.supported && normal !== null && normal.y > 0;

    if (!supported || !normal) {
      if (this.#wasSupported) {
        this.#pendingLip = this.#armedLip;
        this.#departureSubsteps = this.#pendingLip ? 1 : 0;
      } else if (this.#pendingLip) {
        this.#departureSubsteps += 1;
      }
      this.#wasSupported = false;
      this.#supportedSubsteps = 0;
      this.#airborneSubsteps += 1;
      this.#armedLip = null;
      const confirmation = Math.max(
        1,
        Math.floor(this.config.lipDepartureConfirmSubsteps),
      );
      if (this.#pendingLip && this.#departureSubsteps >= confirmation) {
        const lip = this.#pendingLip;
        this.#pendingLip = null;
        this.#departureSubsteps = 0;
        return this.#lipLaunch(lip, sample);
      }
      return none(this.#pendingLip?.slopeDeg ?? 0);
    }

    const wasAirborne = !this.#wasSupported;
    const airborneSubsteps = this.#airborneSubsteps;
    this.#wasSupported = true;
    this.#airborneSubsteps = 0;
    this.#pendingLip = null;
    this.#departureSubsteps = 0;

    const slopeDeg = Math.acos(clamp(normal.y, -1, 1)) * 180 / Math.PI;
    const isTransition = slopeDeg >= Math.max(0, this.config.minSlopeDeg);
    if (!isTransition) {
      this.#supportedSubsteps = 0;
      this.#armedLip = null;
      return none(slopeDeg);
    }

    if (wasAirborne) {
      if (
        airborneSubsteps >= Math.max(1, Math.floor(this.config.landingMinAirborneSubsteps)) &&
        sample.velocity.y < -0.05
      ) {
        const landing = this.#landing(normal, slopeDeg, sample);
        if (landing.kind === 'landing') {
          // Landing contact must stabilize before it can arm another launch.
          this.#armedLip = null;
          return landing;
        }
      }
      // The first contact sample is an impact, not a pump stroke. A rejected
      // landing receives no hidden energy and must establish support normally.
      this.#supportedSubsteps = 0;
      this.#armedLip = null;
      return none(slopeDeg);
    }

    const horizontalSlope = Math.hypot(normal.x, normal.z);
    if (horizontalSlope <= 1e-8) {
      this.#supportedSubsteps = 0;
      this.#armedLip = null;
      return none(slopeDeg);
    }
    const uphill = {
      x: -normal.x / horizontalSlope,
      y: 0,
      z: -normal.z / horizontalSlope,
    };
    const uphillSpeed = dot(sample.velocity, uphill);
    const minSpeed = Math.max(0, this.config.minApproachSpeed);
    if (!Number.isFinite(uphillSpeed) || uphillSpeed < minSpeed) {
      this.#supportedSubsteps = 0;
      this.#armedLip = null;
      return none(slopeDeg);
    }

    const horizontalVelocity = {
      x: sample.velocity.x,
      y: 0,
      z: sample.velocity.z,
    };
    const travelHorizontal = normalized(horizontalVelocity) ?? uphill;
    this.#supportedSubsteps += 1;
    if (
      this.#supportedSubsteps >= Math.max(1, Math.floor(this.config.minSupportedSubsteps))
    ) {
      this.#armedLip = { uphillSpeed, travelHorizontal, slopeDeg };
    }

    return this.#pump(normal, slopeDeg, uphillSpeed, sample);
  }

  #pump(
    normal: Vec3,
    slopeDeg: number,
    uphillSpeed: number,
    sample: TransitionAssistSample,
  ): TransitionAssistAction {
    const minSpeed = Math.max(0, this.config.minApproachSpeed);
    const speedLimit = Math.max(minSpeed, this.config.pumpSpeedLimit);
    const approachStrength = clamp(uphillSpeed - minSpeed, 0, 1);
    const slopeStrength = clamp(
      (slopeDeg - Math.max(0, this.config.minSlopeDeg)) / 12,
      0,
      1,
    );
    // Hold useful pump authority through normal riding speed, then ease it to
    // zero over the final 1 m/s instead of imposing an electric speed servo.
    const headroomStrength = clamp(speedLimit - uphillSpeed, 0, 1);
    const force = Math.max(0, this.config.pumpForceMax) *
      approachStrength * slopeStrength * headroomStrength;
    const impulseMagnitude = force * Math.max(0, sample.dt);
    if (!Number.isFinite(impulseMagnitude) || impulseMagnitude <= 0) return none(slopeDeg);

    const intoNormal = dot(sample.velocity, normal);
    const tangent = normalized({
      x: sample.velocity.x - normal.x * intoNormal,
      y: sample.velocity.y - normal.y * intoNormal,
      z: sample.velocity.z - normal.z * intoNormal,
    });
    if (!tangent) return none(slopeDeg);
    return {
      kind: 'pump',
      linearImpulse: {
        x: tangent.x * impulseMagnitude,
        y: tangent.y * impulseMagnitude,
        z: tangent.z * impulseMagnitude,
      },
      angularDelta: { ...ZERO },
      angularImpulseMax: 0,
      slopeDeg,
    };
  }

  #lipLaunch(armed: ArmedLip, sample: TransitionAssistSample): TransitionAssistAction {
    const minSpeed = Math.max(0, this.config.minApproachSpeed);
    const extraVerticalSpeed = clamp(
      (armed.uphillSpeed - minSpeed) * Math.max(0, this.config.lipLaunchSpeedGain),
      0,
      Math.max(0, this.config.lipLaunchDeltaSpeedMax),
    );
    const mass = Math.max(0, Number.isFinite(sample.totalMass) ? sample.totalMass : 0);
    if (extraVerticalSpeed <= 0 || mass <= 0) return none(armed.slopeDeg);

    const forwardShare = clamp(this.config.lipLaunchForwardShare, 0, 1);
    const rawImpulse = {
      x: armed.travelHorizontal.x * extraVerticalSpeed * forwardShare * mass,
      y: extraVerticalSpeed * mass,
      z: armed.travelHorizontal.z * extraVerticalSpeed * forwardShare * mass,
    };
    return {
      kind: 'lip-launch',
      linearImpulse: boundedMagnitude(rawImpulse, this.config.lipLaunchImpulseMax),
      angularDelta: { ...ZERO },
      angularImpulseMax: 0,
      slopeDeg: armed.slopeDeg,
    };
  }

  #landing(
    normal: Vec3,
    slopeDeg: number,
    sample: TransitionAssistSample,
  ): TransitionAssistAction {
    const boardUp = normalized(sample.boardUp);
    if (!boardUp) return none(slopeDeg);
    const alignment = clamp(dot(boardUp, normal), -1, 1);
    const errorDeg = Math.acos(alignment) * 180 / Math.PI;
    if (errorDeg > Math.max(0, this.config.landingAssistConeDeg)) return none(slopeDeg);

    // cross(boardUp, normal) rotates only tilt toward the surface. Removing the
    // normal-axis component from angular velocity preserves authored trick yaw.
    const errorAxis = cross(boardUp, normal);
    const normalSpin = dot(sample.angularVelocity, normal);
    const tiltRate = {
      x: sample.angularVelocity.x - normal.x * normalSpin,
      y: sample.angularVelocity.y - normal.y * normalSpin,
      z: sample.angularVelocity.z - normal.z * normalSpin,
    };
    const alignRate = Math.max(0, this.config.landingAlignRate);
    const damping = clamp(this.config.landingAngularDamping, 0, 1);
    const angularDelta = {
      x: errorAxis.x * alignRate - tiltRate.x * damping,
      y: errorAxis.y * alignRate - tiltRate.y * damping,
      z: errorAxis.z * alignRate - tiltRate.z * damping,
    };
    if (Math.hypot(angularDelta.x, angularDelta.y, angularDelta.z) <= 1e-9) {
      return none(slopeDeg);
    }
    return {
      kind: 'landing',
      linearImpulse: { ...ZERO },
      angularDelta,
      angularImpulseMax: Math.max(0, this.config.landingAngularImpulseMax),
      slopeDeg,
    };
  }
}
