/**
 * ManeuverCommand — the plain-data hand-off from ManeuverAssist to SimWorld
 * (M4). Exactly the GroundCommand pattern: ManeuverAssist produces INTENTS
 * only; SimWorld.applyManeuver validates and clamps every component from
 * config and applies forces/impulses. There are NO pose writes here and no
 * velocity writes except the catch angular-damping multiplier, which the spec
 * itself defines as an omega scaling (final-physics §3.2:
 * `omega *= (1 - catchGain * assistScale)`).
 */

export type ManeuverCommand =
  | PopManeuverCommand
  | FlipTorqueManeuverCommand
  | CatchManeuverCommand
  | CatchQuantizeManeuverCommand
  | LandScrubManeuverCommand
  | BailStartManeuverCommand;

/**
 * One-shot pop: vertical impulse J = (0, jY, 0) plus a pitch torque impulse
 * about the world-space board-right axis (spec §3.2 pop). `pitchTorqueImpulse`
 * is SIGNED: negative pitches the nose UP (ollie), positive pitches it DOWN
 * (nollie prep, mirrored). Applied exactly once at the pop step.
 */
export interface PopManeuverCommand {
  kind: 'pop';
  /** Vertical pop impulse, N·s. SimWorld clamps to [0, pop.jMax]. */
  jY: number;
  /** Signed pitch torque impulse about board-right, N·m·s (clamped). */
  pitchTorqueImpulse: number;
}

/**
 * Per-step flip/shuv envelope (M5; final-physics §3.2). SimWorld resolves the
 * board-local axis to world (quatRotate), reads the live angular velocity,
 * projects it onto the axis, and applies the PD torque
 *   tau = clamp(kp·(omegaTarget − omegaAxis) − kd·omegaAxis, ±tauMax)
 * as a torque impulse tau·dt about the world axis. kp/kd come from config.flip;
 * omegaTarget is clamped to ±flip.omegaFlipMax; tauMax is the ALREADY assist-
 * level-selected clamp (ManeuverAssist picks flip.tauMax[assistLevel]). No pose
 * or velocity writes — a pure torque, exactly the applyGroundForces pattern.
 */
export interface FlipTorqueManeuverCommand {
  kind: 'flipTorque';
  /** Board-local axis to spin about: 'long' = +Z (roll), 'up' = +Y (yaw). */
  axis: 'long' | 'up';
  /** Signed target angular rate about the axis, rad/s (SimWorld re-clamps). */
  omegaTarget: number;
  /** Torque clamp for this assist level, N·m (SimWorld re-clamps to a sane cap). */
  tauMax: number;
}

/**
 * Catch damping: the spec's own equation, implemented as an angular-velocity
 * scale. factor = 1 − catchGain·assistScale[assistLevel], clamped to [0, 1].
 */
export interface CatchManeuverCommand {
  kind: 'catch';
  angularFactor: number;
}

/**
 * Catch-time quantize (M5; final-physics §3.4). When the completed rotation at
 * catch lands inside the assist-level cone of a whole trick (k·360° flip / k·180°
 * shuv), remove `damp` of the ON-AXIS spin so the residual bleeds off and the
 * trick settles ON the level. SimWorld removes only the axis-projected component:
 *   av' = av − damp·(av·axisWorld)·axisWorld
 * This is EXTRA angular damping about one axis — never a pose write, never a
 * teleport to a perfect pose. L0 never emits this (cone 0 / damp 0).
 */
export interface CatchQuantizeManeuverCommand {
  kind: 'catchQuantize';
  axis: 'long' | 'up';
  /** Fraction of the on-axis angular velocity to remove, clamped to [0, 1]. */
  damp: number;
}

/**
 * Dirty-landing speed scrub: SimWorld applies an opposing horizontal impulse
 * −mass·scrub·(lv.x, 0, lv.z) — impulse-based, not a velocity write.
 */
export interface LandScrubManeuverCommand {
  kind: 'landScrub';
  /** Fraction of horizontal velocity scrubbed, clamped to [0, 0.9]. */
  scrubFraction: number;
}

/**
 * Enter the bail game rule: SimWorld raises rigid-body damping to
 * `bail.dampingFactor` and starts its INTERNAL deterministic respawn countdown
 * (`bail.recoverSteps`). The respawn itself is never commandable — it is a
 * SimWorld game rule that fires when the countdown ends.
 */
export interface BailStartManeuverCommand {
  kind: 'bailStart';
}
