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
  /** One-shot forward push impulse this step, N·s. SimWorld caps it at maxGroundSpeed. */
  pushImpulse: number;
  /** Desired board yaw rate about world +Y, rad/s. SimWorld clamps + servos toward it. */
  targetYawRate: number;
  /** Cosmetic lean roll torque about board-forward, N·m. SimWorld clamps it small. */
  rollTorque: number;
}

export function idleGroundCommand(): GroundCommand {
  return { active: false, driveForce: 0, pushImpulse: 0, targetYawRate: 0, rollTorque: 0 };
}
