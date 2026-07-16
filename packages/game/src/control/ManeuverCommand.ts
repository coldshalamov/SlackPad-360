/**
 * ManeuverCommand — the plain-data hand-off from ManeuverAssist to SimWorld
 * (M4). Exactly the GroundCommand pattern: ManeuverAssist produces INTENTS
 * only; SimWorld.applyManeuver validates and clamps every component from
 * config and applies forces/impulses. There are NO pose or velocity writes in
 * normal play; catch damping is an inertia-aware, bounded torque impulse.
 */

import type { Vec3 } from '@slackpad/shared';

export type ManeuverCommand =
  | PopManeuverCommand
  | PitchCurveManeuverCommand
  | FlipImpulseManeuverCommand
  | FlipTorqueManeuverCommand
  | CatchManeuverCommand
  | CatchQuantizeManeuverCommand
  | LandScrubManeuverCommand
  | BailStartManeuverCommand
  | GrindLatchManeuverCommand;

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
  /** Physical board end kicked downward while the pop impulse unloads it. */
  popSide?: 'tail' | 'nose';
  /** Downward point impulse at popSide; the opposing lift preserves net jY. */
  kickImpulse?: number;
  /** Legacy trace/test field accepted for v1 replay compatibility. */
  pitchTorqueImpulse?: number;
}

/**
 * Per-step physical pitch guide for a basic ollie/nollie (Sprint 02 S4): the
 * target is one sample of the AUTHORED pitch silhouette (config
 * pop.pitchCurves, active preset from the profile) on the curve's own
 * timeline. SimWorld applies only a clamped PD torque about the live
 * board-right axis; no pose is written.
 */
export interface PitchCurveManeuverCommand {
  kind: 'pitchCurve';
  /** Signed target pitch, rad. Positive raises the nose. */
  targetPitch: number;
  /**
   * Authored curve slope at this sample, rad/s nose-up — the rate feedforward
   * that lets the tracker FOLLOW the silhouette instead of trailing it by the
   * PD time constant (same lesson as the S2 yaw servo).
   */
  targetPitchRate: number;
  /**
   * Torque-authority fraction [0,1] this step (reduced while the flick
   * recognition window is open so a would-be flip is never fought). SimWorld
   * clamps it to [0,1] and scales its torque clamp by it.
   */
  authorityScale: number;
}

/** One-shot physical angular impulse that starts a recognized flip or shuv. */
export interface FlipImpulseManeuverCommand {
  kind: 'flipImpulse';
  axis: 'long' | 'up';
  omegaTarget: number;
  maxTorqueImpulse: number;
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
 * Catch damping requests a fraction of angular motion to remove. SimWorld
 * converts it to an inertia-aware torque impulse and clamps that impulse.
 */
export interface CatchManeuverCommand {
  kind: 'catch';
  angularFactor: number;
  maxTorqueImpulse?: number;
  /**
   * True only while the authored ollie/nollie pitch silhouette is still
   * playing (S4): the catch then spares the board-right (pitch) component so
   * the performance's level/descent segments aren't halved every step. Flip/
   * shuv catches leave this false — their pitch is residual, not authored,
   * and must damp like everything else.
   */
  preservePitch?: boolean;
}

/**
 * Catch-time quantize (M5; final-physics §3.4). When the completed rotation at
 * catch lands inside the assist-level cone of a whole trick (k·360° flip / k·180°
 * shuv), remove `damp` of the ON-AXIS spin so continued over-rotation bleeds
 * off and the catch stays inside the completion cone. SimWorld opposes only
 * the axis-projected component with a bounded torque impulse. This is EXTRA
 * angular damping about one axis — never a pose write, velocity write, or
 * teleport to a perfect pose. Experienced emits none when its bundle is zero.
 */
export interface CatchQuantizeManeuverCommand {
  kind: 'catchQuantize';
  axis: 'long' | 'up';
  /** Fraction of the on-axis angular velocity to remove, clamped to [0, 1]. */
  damp: number;
  maxTorqueImpulse?: number;
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

/**
 * Per-step grind latch (M6; final-physics §4 latch). A SOFT constraint applied
 * as clamped HORIZONTAL forces — never a pose write, never a teleport:
 *   - project velocity along the rail tangent (drag off the along-rail speed so
 *     the grind eventually speed-ends);
 *   - a lateral corrective spring toward the rail centre-line (the "lateral
 *     spring toward rail centreline on entry" soft snap — assist-scaled, L0 = 0)
 *     plus perpendicular-velocity damping so the board tracks the rail;
 *   - a lateral balance nudge so an imbalanced grind visibly drifts.
 * Vertical support comes from the real rail collider (contact), NOT this command.
 * SimWorld re-clamps every component; the total lateral force is capped.
 */
export interface GrindLatchManeuverCommand {
  kind: 'grindLatch';
  /** Grind family — selects the yaw-align target (parallel vs perpendicular). */
  family: 'fifty-fifty' | 'boardslide';
  /**
   * Approach-only orientation snap (M6): true while a grind is a CANDIDATE in the
   * air but not yet latched. SimWorld then applies ONLY the yaw-alignment torque
   * (assist the player's rotation into the family orientation "on entry",
   * final-physics §4) and NO lateral spring / tangent drag / balance — so there
   * is orientation help but zero POSITIONAL magnetism before the latch commits.
   */
  approachOnly: boolean;
  /** Rail tangent, unit world horizontal (velocity projected along this). */
  axis: Vec3;
  /** Rail-perpendicular, unit world horizontal (spring + balance act along this). */
  perp: Vec3;
  /** Signed lateral offset of the board centre from the centre-line, m. */
  lateralOffset: number;
  /** Lateral spring gain for this assist level, N/m (SimWorld re-clamps ≥ 0). */
  springGain: number;
  /** Signed balance lateral force, N (SimWorld folds into the capped lateral force). */
  balanceLateral: number;
  /** One-shot upward impulse used only by an automatic rail dismount. */
  dismountLiftImpulse: number;
}
