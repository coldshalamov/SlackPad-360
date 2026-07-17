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
 * Catch (spec §3.2): request bounded torque damping scaled by the active preset.
 *
 * Interrupts (§3.3): a bail event clears omegaTarget/impulseQueued and emits
 * the bailStart command; physics continues (SimWorld only damps + later
 * respawns via its internal game rule).
 */

import { DEFAULT_POP_PITCH_PRESET, popFlightSteps, samplePitchCurve } from '@slackpad/shared';
import type { PopPitchPreset, SimConfig, Vec3 } from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';
import type { FsmResult } from './GestureFSM';
import type { ManeuverCommand } from './ManeuverCommand';
import type { FeetState } from '../input/FootTracker';

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
  private lastImpulseAttemptId: string | null = null;
  /** Quality of the most recent pop (silhouette amplitude scale). */
  private popQ: number | undefined;
  /** Silhouette timeline of the most recent pop, steps (scales with jY). */
  private curveSteps: number | undefined;

  constructor(
    private readonly config: SimConfig,
    assistLevel: 0 | 1 | 2,
    private readonly telemetry?: Telemetry,
    /** Active authored pitch-silhouette preset (profile-owned, S4). */
    private readonly pitchPreset: PopPitchPreset = DEFAULT_POP_PITCH_PRESET,
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
  update(result: FsmResult, step: number, feet?: FeetState): ManeuverCommand[] {
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
          const pitchTorqueImpulse = pop.pitchBias * pop.pitchTorqueScale * jY;
          const lever = Math.max(0.1, this.config.physics.boardLength * 0.42);
          cmds.push({
            kind: 'pop',
            jY,
            popSide: ev.label === 'ollie' ? 'tail' : 'nose',
            kickImpulse: pitchTorqueImpulse / lever,
          });
          s.impulseQueued = { x: 0, y: jY, z: 0 };
          // The silhouette amplitude scales with this pop's quality (constant
          // for motionTap — intensity is a gated experiment, reviews/03 §2.2)
          // and its TIMELINE scales with the flight this jY ballistically
          // buys, so a small pop levels off by its own earlier apex.
          this.popQ = q;
          this.curveSteps = popFlightSteps(
            jY,
            this.config.physics.boardMass + this.config.physics.riderMass,
            this.config.physics.hz,
          );
          break;
        }
        case 'catch': {
          const gain = cat.catchGain * cat.assistScale[s.assistLevel];
          s.catchGain = gain;
          cmds.push({
            kind: 'catch',
            angularFactor: 1 - gain,
            maxTorqueImpulse: cat.angularImpulseMax[s.assistLevel],
            // Spare the authored pitch performance for the base pop only; a
            // reclassified flip/shuv catch damps all axes exactly as in M5.
            preservePitch:
              result.label?.label === 'ollie' || result.label?.label === 'nollie',
          });
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
      const attemptId = result.intent?.attemptId ?? `${result.label.openStep}:${result.label.label}`;
      if (this.lastImpulseAttemptId !== attemptId) {
        this.lastImpulseAttemptId = attemptId;
        cmds.push({
          kind: 'flipImpulse',
          axis: air.axis,
          omegaTarget: air.omegaTarget,
          maxTorqueImpulse:
            air.axis === 'up'
              ? flip.shuvImpulseMax[s.assistLevel]
              : flip.impulseMax[s.assistLevel],
        });
      }
      // The shuv yaw axis has ~17× the roll inertia, so it uses its own clamp.
      const baseTauMax = air.axis === 'up' ? flip.shuvTauMax[s.assistLevel] : flip.tauMax[s.assistLevel];
      const guideAge = Math.max(0, step - air.openStep);
      const guideScale = Math.max(0, 1 - guideAge / Math.max(1, flip.guideDecaySteps));
      if (guideScale > 0) {
        cmds.push({
          kind: 'flipTorque',
          axis: air.axis,
          omegaTarget: air.omegaTarget,
          tauMax: baseTauMax * guideScale,
        });
      }
      s.omegaTarget =
        air.axis === 'long' ? { x: 0, y: 0, z: air.omegaTarget } : { x: 0, y: air.omegaTarget, z: 0 };
    } else {
      s.omegaTarget = zero();
    }

    // The BASE ollie/nollie is a PERFORMANCE (reviews/03 Stage 2): play the
    // authored pitch silhouette — strike, sharp rise, level by apex, slight
    // nose-down into descent — anchored at the POP step and tracked by the
    // SimWorld PD, spanning pop → air → catch (level/descent play through
    // the catch). Once a flick reclassifies the trick, the silhouette HANDS
    // OFF: servoing pitch against a deck spinning 10+ rad/s about the flip
    // axis couples gyroscopically into yaw/pitch chaos (measured: 55° pitch,
    // 31° heading error), so flips/shuvs keep their tuned M5 endgame —
    // ballistic pitch, catch damping, quantize. Nollie mirrors the sign;
    // amplitude scales with pop quality (constant for motionTap).
    const intent = result.intent;
    const baseLabel = result.label?.label;
    const guidePlanted =
      intent?.base === 'nollie' ? feet?.tail.planted : feet?.nose.planted;
    if (
      intent &&
      (baseLabel === 'ollie' || baseLabel === 'nollie') &&
      guidePlanted &&
      (result.phase === 'pop' || result.phase === 'air' || result.phase === 'catch')
    ) {
      const age = Math.max(0, step - intent.source.popStep);
      const duration = Math.max(1, this.curveSteps ?? pop.curveDurationSteps);
      const tNorm = Math.min(1, age / duration);
      const tNext = Math.min(1, (age + 1) / duration);
      const curve = pop.pitchCurves[this.pitchPreset] ?? pop.pitchCurves.crisp;
      const amplitude = (this.popQ ?? pop.baseQuality) / Math.max(1e-6, pop.baseQuality);
      const sign = intent.base === 'ollie' ? 1 : -1;
      const scale = (sign * amplitude * Math.PI) / 180;
      const targetPitch = scale * samplePitchCurve(curve, tNorm);
      const targetPitchRate =
        scale *
        (samplePitchCurve(curve, tNext) - samplePitchCurve(curve, tNorm)) *
        this.config.physics.hz;
      // Authority floor while a flick could still plausibly reclassify this
      // pop, ramping to full right after the practical flick era so the base
      // performance is tracked but tuned flip entries are never perturbed.
      const floor = Math.max(0, Math.min(1, pop.curveWindowAuthority));
      const rampStart = Math.max(0, pop.curveAuthorityRampStartStep);
      const rampEnd = Math.max(rampStart + 1, pop.curveAuthorityRampEndStep);
      const rampT = Math.max(0, Math.min(1, (age - rampStart) / (rampEnd - rampStart)));
      const windowOpen = step <= result.label!.expireStep;
      const authorityScale = windowOpen ? floor + (1 - floor) * rampT : 1;
      cmds.push({ kind: 'pitchCurve', targetPitch, targetPitchRate, authorityScale });
    }

    // A shuv's authored orientation includes FLAT roll: hold it with a small
    // attitude PD through the WHOLE maneuver (pop → air → catch — the yaw ×
    // pitch Euler coupling otherwise leaks 12–20° of genuine tilt onto the
    // light roll axis by the catch). Two carve-outs: L0's clamp fraction is 0
    // by contract, and the leveler releases as soon as a grind CANDIDATE
    // appears — a shuv that is really a boardslide entry belongs to the grind
    // capture, whose settle the leveler otherwise hardens into a collision.
    if (
      intent?.family === 'shuv' &&
      !result.grind?.candidate &&
      (result.phase === 'pop' || result.phase === 'air' || result.phase === 'catch')
    ) {
      const rollTauMax =
        flip.tauMax[s.assistLevel] * flip.shuvRollDampFrac[s.assistLevel];
      if (rollTauMax > 0) cmds.push({ kind: 'rollLevel', tauMax: rollTauMax });
    }

    // Per-step grind latch (M6; spec §4). Flush the GrindSystem's clamped
    // soft-snap command while grinding (and the one-shot lateral kick a balance
    // slip carries), and mirror the rail frame into AssistState.grindAxis/
    // grindAnchor. SimWorld does the force math + clamps — no pose write here.
    const grind = result.grind;
    if (grind && grind.axis && grind.perp) {
      cmds.push({
        kind: 'grindLatch',
        family: grind.family ?? 'fifty-fifty',
        approachOnly: grind.approachOnly,
        axis: { ...grind.axis },
        perp: { ...grind.perp },
        lateralOffset: grind.lateralOffset,
        springGain: grind.springGain,
        balanceLateral: grind.balanceLateral,
        dismountLiftImpulse: grind.dismountLiftImpulse,
      });
    }
    if (grind && grind.active && grind.axis && grind.anchor) {
      s.grindAxis = { ...grind.axis };
      s.grindAnchor = { ...grind.anchor };
    } else {
      s.grindAxis = null;
      s.grindAnchor = null;
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
    return {
      kind: 'catchQuantize',
      axis,
      damp,
      maxTorqueImpulse: this.config.catch.angularImpulseMax[L],
    };
  }
}
