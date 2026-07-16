/**
 * BoardController — ground locomotion only (M3).
 *
 * Consumes FeetState + KickEvents and produces a plain-data GroundCommand each
 * step. It is deliberately BODY-STATE-FREE: it never reads the board's linear or
 * angular velocity (that would couple it to the sim). It emits intents; SimWorld
 * does every velocity-dependent scaling and every clamp (module-ownership:
 * "Impulses/torques clamps" applied by SimWorld, "Skipping Rapier" forbidden).
 *
 * Ground vocabulary implemented here (final-input-and-trick-spec §5):
 *  - Ride:   Ctrl authors eased push strokes; release coasts physically.
 *  - Push:   both-planted kick (bothClickMeans 'push') → forward impulse.
 *  - Steer:  the absolute two-finger segment angle is the board heading.
 * Air control (M4/M5) is out of scope: no ground forces unless grounded.
 */

import type {
  LocomotionConfig,
  PhysicsConfig,
  InputProfile,
} from "@slackpad/shared";
import type { Telemetry } from "../telemetry/Telemetry";
import type { FeetState, KickEvent } from "../input/FootTracker";
import type { GroundCommand } from "./GroundCommand";
import { idleGroundCommand } from "./GroundCommand";

function wrapPi(angle: number): number {
  let out = angle;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out <= -Math.PI) out += Math.PI * 2;
  return out;
}

export class BoardController {
  private lastPushStep = -1_000_000;
  private accelerationWasHeld = false;
  private accelerationStrokeEpoch = 0;

  constructor(
    private readonly loco: LocomotionConfig,
    private readonly physics: PhysicsConfig,
    private readonly profile: Pick<InputProfile, "stance" | "bothClickMeans">,
    private readonly telemetry?: Telemetry,
  ) {}

  applyGroundControl(
    feet: FeetState,
    kicks: KickEvent[],
    grounded: boolean,
    step: number,
  ): GroundCommand {
    if (!grounded) {
      this.accelerationWasHeld = false;
      return idleGroundCommand();
    }

    const cmd: GroundCommand = {
      active: true,
      driveForce: 0,
      brakeForce: 0,
      pushImpulse: 0,
      targetYawRate: 0,
      steerAngle: null,
      rollTorque: 0,
    };

    const seg = feet.segment;
    const driveAllowed =
      feet.bothPlanted && seg.valid && feet.accelerating === true;
    // Releasing Ctrl coasts. Normal rolling/bearing resistance lives in the
    // physics model; it is not an implicit four-wheel brake command.
    cmd.brakeForce = 0;

    // Ctrl is the only propulsion input. Pad travel is reserved for steering
    // and tricks, so swiping can never create confusing phantom speed.
    if (feet.bothPlanted && seg.valid && driveAllowed) {
      if (!this.accelerationWasHeld) this.accelerationStrokeEpoch = step;
      const cadence = Math.max(1, Math.floor(this.loco.accelerationCadenceSteps));
      const strokeSteps = Math.min(
        cadence,
        Math.max(1, Math.floor(this.loco.accelerationStrokeSteps)),
      );
      const phase = ((step - this.accelerationStrokeEpoch) % cadence + cadence) % cadence;
      if (phase < strokeSteps) {
        // Half-sine force envelope: no electric-motor step change, but an
        // authored push that rises, peaks, and releases into a coast gap.
        const t = (phase + 1) / (strokeSteps + 1);
        cmd.driveForce = this.loco.accelerationStrokePeakForce * Math.sin(Math.PI * t);
      }
    }
    this.accelerationWasHeld = driveAllowed;

    // The directed tail→nose finger line is the requested board heading. Pad
    // Y grows toward the player, the opposite sign of world yaw in the side-on
    // view, so negate the calibrated pad angle exactly once at this boundary.
    // Common translation and angular velocity have no separate authority.
    if (feet.bothPlanted && seg.valid) {
      cmd.targetYawRate = 0;
      cmd.steerAngle = wrapPi(
        -seg.angle + (this.profile.stance === "goofy" ? Math.PI : 0),
      );
      cmd.rollTorque = 0;
    }

    // Push pulse: both-planted kick, respecting bothClickMeans + cooldown.
    if (this.profile.bothClickMeans === "push") {
      for (const k of kicks) {
        if (k.mask !== "both") continue;
        if (step - this.lastPushStep < this.loco.pushCooldownSteps) continue;
        cmd.pushImpulse = this.physics.pushImpulse;
        this.lastPushStep = step;
        // Distinct 'push' event — FootTracker already logs the 'kick' (with
        // mask) for attribution; this records the pulse actually applied.
        this.telemetry?.log({ type: "push", step, mask: k.mask });
        break;
      }
    }

    // Sampled ground-control telemetry (throttled so the ring is not flooded).
    if (this.telemetry && step % this.loco.groundControlLogEvery === 0) {
      this.telemetry.log({
        type: "groundControl",
        step,
        drive: cmd.driveForce,
        yaw: cmd.targetYawRate,
        bothPlanted: feet.bothPlanted,
      });
    }

    return cmd;
  }
}
