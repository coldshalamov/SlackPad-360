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
 *  - Cruise: both feet planted → forward drive toward cruiseTargetSpeed.
 *  - Push:   both-planted kick (bothClickMeans 'push') → forward impulse.
 *  - Steer:  segment angular velocity → yaw rate (primary), + heading bias.
 *  - Lean:   midpoint lateral offset → mild carve yaw + cosmetic roll.
 * Air control (M4/M5) is out of scope: no ground forces unless grounded.
 */

import type { LocomotionConfig, PhysicsConfig, InputProfile } from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';
import type { FeetState, KickEvent } from '../input/FootTracker';
import type { GroundCommand } from './GroundCommand';
import { idleGroundCommand } from './GroundCommand';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class BoardController {
  private lastPushStep = -1_000_000;

  constructor(
    private readonly loco: LocomotionConfig,
    private readonly physics: PhysicsConfig,
    private readonly profile: Pick<InputProfile, 'stance' | 'bothClickMeans'>,
    private readonly telemetry?: Telemetry,
  ) {}

  /**
   * Steering world-sign per stance. This is the single load-bearing steering
   * sign: with regular stance, a CCW segment rotation in calibrated pad space
   * (segment angVel > 0) must yaw the board LEFT (world av.y < 0). Goofy inverts
   * it. The ground-locomotion sign test pins both directions and the mutation
   * guard flips this to prove it is load-bearing.
   */
  private stanceSign(): number {
    return this.profile.stance === 'regular' ? -1 : 1;
  }

  applyGroundControl(feet: FeetState, kicks: KickEvent[], grounded: boolean, step: number): GroundCommand {
    if (!grounded) return idleGroundCommand();

    const cmd: GroundCommand = {
      active: true,
      driveForce: 0,
      pushImpulse: 0,
      targetYawRate: 0,
      rollTorque: 0,
    };

    const seg = feet.segment;

    // Cruise: hold both feet on the board to accelerate.
    if (feet.bothPlanted) {
      cmd.driveForce = this.loco.cruiseDriveForce;
    }

    // Steer + lean (need a valid board-contact segment).
    if (feet.bothPlanted && seg.valid) {
      const s = this.stanceSign();
      let yaw =
        s * (this.loco.steerYawGain * seg.angVel + this.loco.steerHeadingBiasGain * seg.angleFromRest);
      // Lean: lateral midpoint offset adds a mild carve and a cosmetic roll.
      const lateral = seg.midpointOffsetFromRest.x;
      yaw += s * this.loco.leanCarveGain * lateral;
      cmd.targetYawRate = clamp(yaw, -this.physics.steerYawRateMax, this.physics.steerYawRateMax);
      cmd.rollTorque = this.loco.leanRollGain * lateral;
    }

    // Push pulse: both-planted kick, respecting bothClickMeans + cooldown.
    if (this.profile.bothClickMeans === 'push') {
      for (const k of kicks) {
        if (k.mask !== 'both') continue;
        if (step - this.lastPushStep < this.loco.pushCooldownSteps) continue;
        cmd.pushImpulse = this.physics.pushImpulse;
        this.lastPushStep = step;
        // Distinct 'push' event — FootTracker already logs the 'kick' (with
        // mask) for attribution; this records the pulse actually applied.
        this.telemetry?.log({ type: 'push', step, mask: k.mask });
        break;
      }
    }

    // Sampled ground-control telemetry (throttled so the ring is not flooded).
    if (this.telemetry && step % this.loco.groundControlLogEvery === 0) {
      this.telemetry.log({
        type: 'groundControl',
        step,
        drive: cmd.driveForce,
        yaw: cmd.targetYawRate,
        bothPlanted: feet.bothPlanted,
      });
    }

    return cmd;
  }
}
