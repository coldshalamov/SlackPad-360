/**
 * GroundCommand — the plain-data hand-off from BoardController to SimWorld (M3).
 *
 * BoardController produces INTENTS only; it never reads the physics body. Every
 * velocity/angular-velocity-dependent scaling and every magnitude clamp happens
 * inside SimWorld.applyGroundForces (module-ownership: "BoardController computes
 * commands, SimWorld applies them inside clamps"). This keeps the board body
 * unreachable from the controller and keeps all clamp values in shared config.
 */
export interface GroundCommand {
  /** Apply nothing when false (airborne, or no control this step). */
  active: boolean;
  /**
   * Base forward drive force along board-forward, N (cruise intent). SimWorld
   * scales it by the current forward speed toward cruiseTargetSpeed, so this is
   * a force, not a velocity write.
   */
  driveForce: number;
  /** Physical per-wheel brake force while Ctrl is released. */
  brakeForce: number;
  /** One-shot forward push impulse this step, N·s. SimWorld caps it at maxGroundSpeed. */
  pushImpulse: number;
  /**
   * RELATIVE steering (reviews/03 design law): the wrapPi delta of the
   * calibrated two-finger segment angle since the previous step, scaled by
   * `locomotion.steerDirectGain` and sign-mapped to world yaw, rad. SimWorld
   * accumulates it into a servoed heading target (per-step clamp
   * `steerYawRateMax × dt`); null means steering is disengaged this step
   * (fingers not dual-planted) and releases the heading anchor. Ratcheting is
   * free: each fresh dual-plant re-anchors and subsequent deltas accumulate.
   */
  headingDelta: number | null;
  /** Cosmetic lean roll torque about board-forward, N·m. SimWorld clamps it small. */
  rollTorque: number;
}

export function idleGroundCommand(): GroundCommand {
  return { active: false, driveForce: 0, brakeForce: 0, pushImpulse: 0, headingDelta: null, rollTorque: 0 };
}
