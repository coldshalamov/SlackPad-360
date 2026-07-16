/**
 * Steering fixture helpers for the RELATIVE steering vocabulary (Sprint 02 S2).
 *
 * Route-following physics fixtures used to hand SimWorld an absolute
 * `steerAngle`; the command is now a per-step relative `headingDelta`
 * accumulated into a servoed target. `headingDeltaToward` walks that target
 * toward a desired world heading each step (clamped inside SimWorld to
 * steerYawRateMax·dt), which reproduces the old fixture behavior — a bot
 * holding a route line — through the new player-shaped channel.
 */

import type { GroundCommand } from '../../src/control/GroundCommand';
import type { SimWorld } from '../../src/sim/SimWorld';

function wrapPi(angle: number): number {
  let out = angle;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out <= -Math.PI) out += Math.PI * 2;
  return out;
}

/** GroundCommand with idle defaults; override what the fixture drives. */
export function groundCmd(overrides: Partial<GroundCommand> = {}): GroundCommand {
  return {
    active: true,
    driveForce: 0,
    brakeForce: 0,
    pushImpulse: 0,
    headingDelta: null,
    rollTorque: 0,
    ...overrides,
  };
}

/**
 * Per-step headingDelta that walks the servo target toward `desiredHeadingRad`.
 * SimWorld clamps each step to steerYawRateMax·dt, so convergence is
 * rate-limited exactly like a fast human rotation.
 */
export function headingDeltaToward(world: SimWorld, desiredHeadingRad: number): number {
  const q = world.boardPose().q;
  const yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
  const current = world.steerHeadingTarget() ?? yaw;
  return wrapPi(desiredHeadingRad - current);
}
