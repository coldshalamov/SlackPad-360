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
  /** Desired board yaw rate about world +Y, rad/s. SimWorld clamps + servos toward it. */
  targetYawRate: number;
  /**
   * Signed calibrated two-finger segment angle, rad. While this is present,
   * SimWorld anchors the board heading to the segment at first plant and then
   * tracks subsequent segment rotation one-for-one. null releases the anchor.
   */
  steerAngle: number | null;
  /** Cosmetic lean roll torque about board-forward, N·m. SimWorld clamps it small. */
  rollTorque: number;
}

export function idleGroundCommand(): GroundCommand {
  return { active: false, driveForce: 0, brakeForce: 0, pushImpulse: 0, targetYawRate: 0, steerAngle: null, rollTorque: 0 };
}
