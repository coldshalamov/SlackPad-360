/**
 * Pure grind-latch force maths (M6), factored out of SimWorld.applyManeuver so
 * the soft-snap physics is unit-testable in isolation — in particular that the
 * yaw-alignment provably drives a yawed boardslide toward its target orientation
 * and holds it (the orientation analog of the lateral spring), and that the
 * approach-only orientation snap applies NO positional force.
 *
 * All forces are clamped and horizontal (+ a yaw torque about world up); there
 * are NO pose writes. Deterministic: pure maths on plain data.
 */

import type { GrindConfig, Quat, Vec3 } from '@slackpad/shared';

export interface GrindLatchState {
  q: Quat;
  lv: Vec3;
  av: Vec3;
}

export interface GrindLatchParams {
  family: 'fifty-fifty' | 'boardslide';
  approachOnly: boolean;
  /** Rail tangent + perpendicular, world horizontal (unit-ish; renormalised here). */
  axis: Vec3;
  perp: Vec3;
  lateralOffset: number;
  springGain: number;
  balanceLateral: number;
}

export interface GrindLatchImpulse {
  /** Horizontal linear impulse to apply, N·s. */
  lin: Vec3;
  /** Yaw torque impulse about world +Y, N·m·s. */
  yaw: number;
}

function clampNum(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < lo ? lo : v > hi ? hi : v;
}

/** World image of board-local +Z (nose), used for the yaw-align heading. */
function forwardZ(q: Quat): Vec3 {
  return {
    x: 2 * (q.x * q.z + q.w * q.y),
    y: 2 * (q.y * q.z - q.w * q.x),
    z: 1 - 2 * (q.x * q.x + q.y * q.y),
  };
}

/**
 * Compute the grind-latch impulses for one step. Mirrors (and is the single
 * source of) SimWorld's applyManeuver 'grindLatch' physics.
 */
export function grindLatchImpulse(
  s: GrindLatchState,
  p: GrindLatchParams,
  g: GrindConfig,
  mass: number,
  hz: number,
): GrindLatchImpulse {
  const dt = 1 / hz;
  const aLen = Math.hypot(p.axis.x, p.axis.z) || 1;
  const ax = p.axis.x / aLen;
  const az = p.axis.z / aLen;
  const pLen = Math.hypot(p.perp.x, p.perp.z) || 1;
  const nx = p.perp.x / pLen;
  const nz = p.perp.z / pLen;

  const lin: Vec3 = { x: 0, y: 0, z: 0 };
  // Clamp to the strongest configured assist instead of a stale pre-loaded-
  // mass ceiling. L1 and L2 are intentionally distinct tuning levels.
  const maxConfiguredSpring = Math.max(0, ...g.latchLateralSpring);
  const springGain = clampNum(p.springGain, 0, maxConfiguredSpring);

  // Positional forces apply ONLY on a committed latch — never on the approach
  // snap (no positional magnetism before commit).
  if (!p.approachOnly) {
    const vTan = s.lv.x * ax + s.lv.z * az;
    const vPerp = s.lv.x * nx + s.lv.z * nz;
    const balanceLateral = clampNum(p.balanceLateral, -g.latchLateralForceMax, g.latchLateralForceMax);
    let fPerp = -springGain * p.lateralOffset - g.latchLateralDamp * vPerp + balanceLateral;
    fPerp = clampNum(fPerp, -g.latchLateralForceMax, g.latchLateralForceMax);
    const fTan = -clampNum(g.tangentDrag, 0, 20) * mass * vTan;
    lin.x = (fPerp * nx + fTan * ax) * dt;
    lin.z = (fPerp * nz + fTan * az) * dt;
  }

  // Yaw alignment (assist-scaled via springGain > 0, like the lateral spring):
  // drive heading toward the family target (parallel for 50-50, perpendicular
  // for boardslide) + yaw-rate damping, clamped. Near-zero for an aligned board.
  let yaw = 0;
  const fwd = forwardZ(s.q);
  const fhLen = Math.hypot(fwd.x, fwd.z);
  if (springGain > 0 && fhLen > 1e-3) {
    const tX = p.family === 'boardslide' ? nx : ax;
    const tZ = p.family === 'boardslide' ? nz : az;
    const facing = fwd.x * tX + fwd.z * tZ >= 0 ? 1 : -1;
    const goalX = facing * tX;
    const goalZ = facing * tZ;
    const cross = (fwd.z * goalX - fwd.x * goalZ) / fhLen; // sin(err), +Y sense
    const dotFG = (fwd.x * goalX + fwd.z * goalZ) / fhLen; // cos(err)
    const yawErr = Math.atan2(cross, dotFG);
    let yawTorque = g.latchYawAlignGain * yawErr - g.latchYawDamp * s.av.y;
    yawTorque = clampNum(yawTorque, -g.latchYawTorqueMax, g.latchYawTorqueMax);
    yaw = yawTorque * dt;
  }

  return { lin, yaw };
}
