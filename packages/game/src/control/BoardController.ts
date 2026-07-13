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
 *  - Ride:   Ctrl is the only source of forward drive; release applies brakes.
 *  - Push:   both-planted kick (bothClickMeans 'push') → forward impulse.
 *  - Steer:  common two-finger lateral displacement → sustained carve rate.
 *  - Lean:   the same common-mode input adds a small cosmetic roll.
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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class BoardController {
  private lastPushStep = -1_000_000;

  constructor(
    private readonly loco: LocomotionConfig,
    private readonly physics: PhysicsConfig,
    private readonly profile: Pick<InputProfile, "stance" | "bothClickMeans">,
    private readonly telemetry?: Telemetry,
  ) {}

  /** Regular/goofy mirror for the optional two-finger twist carve. */
  private stanceSign(): number {
    return this.profile.stance === 'regular' ? -1 : 1;
  }

  /** Deadzoned analog response for a held common-mode pad displacement. */
  private steerInput(lateral: number): number {
    const magnitude = Math.abs(lateral);
    const deadzone = this.loco.steerInputDeadzone;
    if (magnitude <= deadzone) return 0;
    const span = Math.max(1e-6, this.loco.steerInputFullScale - deadzone);
    const normalized = clamp((magnitude - deadzone) / span, 0, 1);
    return Math.sign(lateral) * normalized;
  }

  applyGroundControl(
    feet: FeetState,
    kicks: KickEvent[],
    grounded: boolean,
    step: number,
  ): GroundCommand {
    if (!grounded) {
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
    cmd.brakeForce = driveAllowed ? 0 : this.loco.coastBrakeForce;

    // Ctrl is the only propulsion input. Pad travel is reserved for steering
    // and tricks, so swiping can never create confusing phantom speed.
    if (feet.bothPlanted && seg.valid) {
      cmd.driveForce = driveAllowed ? this.loco.cruiseDriveForce : 0;
    }

    // Steer + lean (need a valid board-contact segment).
    if (feet.bothPlanted && seg.valid) {
      const lateral = seg.midpointOffsetFromRest.x;
      const steer = this.steerInput(lateral);
      // Common-mode movement is deliberately stance-independent, like Skate's
      // left stick: sliding both fingers right always carves right. Individual
      // relative foot motion remains reserved for Flick-It trick recognition.
      const twistCarve =
        this.stanceSign() *
        (this.loco.steerYawGain * seg.angVel +
          this.loco.steerHeadingBiasGain * seg.angleFromRest);
      cmd.targetYawRate = clamp(
        steer * this.loco.steerRateAtFull + twistCarve,
        -this.physics.steerYawRateMax,
        this.physics.steerYawRateMax,
      );
      cmd.rollTorque = this.loco.leanRollGain * steer;
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
