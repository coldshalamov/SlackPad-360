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
  | CatchManeuverCommand
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
 * Catch damping: the spec's own equation, implemented as an angular-velocity
 * scale. factor = 1 − catchGain·assistScale[assistLevel], clamped to [0, 1].
 */
export interface CatchManeuverCommand {
  kind: 'catch';
  angularFactor: number;
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
