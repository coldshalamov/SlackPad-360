/**
 * ManeuverAssist — owns AssistState (final-physics-animation-camera-spec §3.1,
 * field-exact) and translates GestureFSM decisions into clamped plain-data
 * ManeuverCommands for SimWorld.applyManeuver (M4).
 *
 * Division of labor (final-input-and-trick-spec §2.1): the FSM owns discrete
 * OCCURRENCE (labels + windows); this class owns INTENSITY → impulse scaling
 * within clamps; Rapier owns continuous pose/collisions. Recognition never
 * teleports the board to a trick pose — an under-popped or crooked pop just
 * flies crooked (that IS the game).
 *
 * Pop (spec §3.2): J = (0, jY, 0), jY = jMin + q·(jMax − jMin) from prep
 * quality, plus a pitch-bias torque impulse about board-right
 * (pitchBias·pitchTorqueScale·jY — nose-up for ollie, mirrored nose-down for
 * nollie). Applied ONCE at the pop step.
 *
 * Catch (spec §3.2): omega *= (1 − catchGain·assistScale[assistLevel]).
 *
 * Interrupts (§3.3): a bail event clears omegaTarget/impulseQueued and emits
 * the bailStart command; physics continues (SimWorld only damps + later
 * respawns via its internal game rule).
 */

import type { SimConfig, Vec3 } from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';
import type { FsmResult } from './GestureFSM';
import type { ManeuverCommand } from './ManeuverCommand';

/** Spec §3.1 AssistState — exact fields. */
export interface AssistState {
  phase: 'none' | 'pop' | 'air' | 'catch' | 'grind' | 'bail';
  label: string | null;
  assistLevel: 0 | 1 | 2;
  openStep: number;
  expireStep: number;
  omegaTarget: Vec3;
  impulseQueued: Vec3;
  catchGain: number;
  grindAxis: Vec3 | null;
  grindAnchor: Vec3 | null;
  interruptible: true;
}

function zero(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

export class ManeuverAssist {
  private readonly state: AssistState;

  constructor(
    private readonly config: SimConfig,
    assistLevel: 0 | 1 | 2,
    private readonly telemetry?: Telemetry,
  ) {
    this.state = {
      phase: 'none',
      label: null,
      assistLevel,
      openStep: 0,
      expireStep: 0,
      omegaTarget: zero(), // flips are M5; stays zero in M4
      impulseQueued: zero(),
      catchGain: 0,
      grindAxis: null, // grind is M6
      grindAnchor: null,
      interruptible: true,
    };
  }

  /** Read-only snapshot for HUD/tests (plain data copy). */
  snapshot(): AssistState {
    return {
      ...this.state,
      omegaTarget: { ...this.state.omegaTarget },
      impulseQueued: { ...this.state.impulseQueued },
      grindAxis: this.state.grindAxis ? { ...this.state.grindAxis } : null,
      grindAnchor: this.state.grindAnchor ? { ...this.state.grindAnchor } : null,
    };
  }

  /** Translate one FSM step result into SimWorld commands + AssistState. */
  update(result: FsmResult, step: number): ManeuverCommand[] {
    const cmds: ManeuverCommand[] = [];
    const s = this.state;
    const pop = this.config.pop;
    const cat = this.config.catch;
    const flip = this.config.flip;
    const rec = this.config.recognition;

    // impulseQueued is a one-step latch: whatever was queued last step has
    // been applied by SimWorld already.
    s.impulseQueued = zero();

    for (const ev of result.events) {
      switch (ev.kind) {
        case 'pop': {
          const q = Math.max(0, Math.min(1, ev.q));
          const jY = pop.jMin + q * (pop.jMax - pop.jMin);
          // Negative pitch about board-right = nose UP (see SimWorld sign
          // convention comment): ollie pops nose-up, nollie mirrors nose-down.
          const sign = ev.label === 'ollie' ? -1 : 1;
          const pitchTorqueImpulse = sign * pop.pitchBias * pop.pitchTorqueScale * jY;
          cmds.push({ kind: 'pop', jY, pitchTorqueImpulse });
          s.impulseQueued = { x: 0, y: jY, z: 0 };
          break;
        }
        case 'catch': {
          const gain = cat.catchGain * cat.assistScale[s.assistLevel];
          s.catchGain = gain;
          cmds.push({ kind: 'catch', angularFactor: 1 - gain });
          // Quantize (spec §3.4): EXTRA on-axis damping when the completed
          // rotation at catch sits inside this level's cone of a whole trick
          // (k·360° flip / k·shuvTargetDeg shuv). Emitted AFTER the base catch
          // so SimWorld composes them. L0 cone/damp are 0 → L0 never snaps.
          const quant = this.#quantizeCommand(ev.gesture, ev.flipRotations, ev.shuvDegrees, flip, rec, step);
          if (quant) cmds.push(quant);
          break;
        }
        case 'land': {
          if (ev.cleanliness === 'dirty') {
            cmds.push({ kind: 'landScrub', scrubFraction: this.config.land.dirtySpeedScrub });
          }
          s.catchGain = 0;
          break;
        }
        case 'bail': {
          // Interrupt (§3.3): clear targets/queues; physics continues.
          s.omegaTarget = zero();
          s.impulseQueued = zero();
          s.catchGain = 0;
          cmds.push({ kind: 'bailStart' });
          break;
        }
        case 'popFizzled': {
          s.impulseQueued = zero();
          break;
        }
      }
    }

    // Per-step flip/shuv envelope (spec §3.2). Runs in AIR ONLY (so it expires
    // before catch — only catch + quantize act on the residual) and within the
    // recognition window. SimWorld does the PD math + torque clamp.
    const air = result.label?.air ?? null;
    if (result.phase === 'air' && air && result.label && step <= result.label.expireStep) {
      // The shuv yaw axis has ~17× the roll inertia, so it uses its own clamp.
      const tauMax = air.axis === 'up' ? flip.shuvTauMax[s.assistLevel] : flip.tauMax[s.assistLevel];
      cmds.push({ kind: 'flipTorque', axis: air.axis, omegaTarget: air.omegaTarget, tauMax });
      s.omegaTarget =
        air.axis === 'long' ? { x: 0, y: 0, z: air.omegaTarget } : { x: 0, y: air.omegaTarget, z: 0 };
    } else {
      s.omegaTarget = zero();
    }

    // Mirror the FSM into the spec-shaped state. FSM 'ground' maps to the
    // spec's 'none' (AssistState has no ground phase — nothing is assisted).
    s.phase = result.phase === 'ground' ? 'none' : result.phase;
    s.label = result.label?.air?.label ?? result.label?.label ?? null;
    if (result.label) {
      s.openStep = result.label.openStep;
      s.expireStep = result.label.expireStep;
    }

    return cmds;
  }

  /**
   * Build the catch-time quantize command, or null when out of cone / L0. The
   * residual is the angular distance from the completed rotation to the nearest
   * whole trick (k·360° for a flip, k·shuvTargetDeg for a shuv).
   */
  #quantizeCommand(
    gesture: 'flip' | 'shuv' | null,
    flipRotations: number,
    shuvDegrees: number,
    flip: SimConfig['flip'],
    rec: SimConfig['recognition'],
    step: number,
  ): ManeuverCommand | null {
    if (!gesture) return null;
    const L = this.state.assistLevel;
    const coneDeg = flip.quantizeConeDeg[L];
    const damp = flip.quantizeExtraDamp[L];
    if (coneDeg <= 0 || damp <= 0) return null; // L0 never snaps (by construction)
    const axis = gesture === 'flip' ? 'long' : 'up';
    const residualDeg =
      gesture === 'flip'
        ? Math.abs(flipRotations - Math.round(flipRotations)) * 360
        : Math.abs(shuvDegrees - Math.round(shuvDegrees / rec.shuvTargetDeg) * rec.shuvTargetDeg);
    if (residualDeg > coneDeg) return null;
    this.telemetry?.log({ type: 'quantize', step, axis, damp, residualDeg });
    return { kind: 'catchQuantize', axis, damp };
  }
}
