/**
 * AirGestureClassifier — M5 free-foot flick/sweep recognition (final-input-and-
 * trick-spec §2 primitives, §3.1 conflicts, §5 grammar).
 *
 * Runs ONLY during the air-trick window after a pop (the FSM gates it). It reads
 * the free foot's CALIBRATED pad velocity and classifies:
 *   - flick → flip (kickflip/heelflip): a short, high-speed path dominantly
 *     LATERAL to the board long axis (|vLat| dominates |vLong| by
 *     axisDominanceRatio, peak ≥ flickSpeedMin, net lateral travel ≥
 *     flickPathMinLen). Intensity s = normalize(peak lateral speed) →
 *     omegaTarget = s·sign·omegaFlipMax about the board long axis (+Z).
 *   - sweep → shuv (fs/bs): a longer arc whose velocity DIRECTION turns by an
 *     integrated angle ≥ sweepMinAngleRad → omegaTarget = sign·shuvOmegaMax
 *     about board up (+Y).
 * The shuv-vs-flip conflict (spec §3.1 "dominant free-foot axis: lateral=flip,
 * yaw/arc=shuv") is resolved by the larger threshold-normalized evidence.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HEELSIDE / TOESIDE CONVENTION (derived from the FootTracker calibrated frame
 * + stance; stance enters EXACTLY ONCE, here, via latAxis).
 *
 * Calibrated pad space is [0,1]², x → pad-right, y → pad-DOWN (screen order).
 * After padYawOffset calibration the tail→nose segment lies along pad-x, and the
 * FootTracker pad-left rule puts the NOSE at pad-left for a regular rider (goofy
 * mirrors). So the board long axis (nose direction) on the pad is:
 *
 *        regular:  nose = +x        goofy:  nose = −x
 *
 * The rider's heel edge is one long side of the deck, the toe edge the other.
 * We fix the convention: for a REGULAR rider the heel edge is pad-DOWN (+y).
 *
 *      pad-top (y=0)
 *        ┌─────────────┐         longAxis (nose):  regular +x , goofy −x
 *   tail │  ·A    ·B   │ nose    latAxis (heel +):  regular +y , goofy −y
 *  (−x)  │   (regular) │ (+x)
 *        └─────────────┘         flick with vLat>0  = HEELSIDE = kickflip (+roll)
 *      pad-bottom (y=1)          flick with vLat<0  = TOESIDE  = heelflip (−roll)
 *
 *   vLong = v·longAxis = regular? +v.x : −v.x   (along board, nose positive)
 *   vLat  = v·latAxis  = regular? +v.y : −v.y   (across board, heelside positive)
 *
 * Because latAxis is mirrored by stance, the SAME physical pad flick yields
 * opposite vLat signs — hence opposite labels — for regular vs goofy, exactly as
 * required. The roll SIGN → label mapping (kickflip = +roll) is stance-INDEPENDENT;
 * all stance dependence lives in latAxis. The outcome namer (GestureFSM) reads
 * the measured roll sign with the same mapping, so recognition and outcome agree.
 *
 * Shuv sign folds stance the same way: shuvSign = regular? sign(yawArc) :
 * −sign(yawArc); outcome names bs-shuv = +yaw, fs-shuv = −yaw (stance-independent).
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Hysteresis (spec §3): a label opens at confidence ≥ c_enter and a challenger
 * of a different label replaces it only if higher by replaceMargin. Confidence
 * is built from the PEAK evidence (monotonic non-decreasing), so a boundary-
 * crossing stream flips the label at most once and never flaps back.
 *
 * Determinism: pad-velocity arithmetic + atan2 only; ms→steps via hz upstream;
 * no wall clock, no Math.random.
 */

import {
  DEFAULT_FLICK_SENSITIVITY,
  FLICK_SENSITIVITY_MAX,
  FLICK_SENSITIVITY_MIN,
  type SimConfig,
  type Stance,
} from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';
import type { Vec2 } from '../input/FootTracker';

export type AirGestureKind = 'flip' | 'shuv';
/** Board-local axis the envelope drives: 'long' = +Z (roll), 'up' = +Y (yaw). */
export type AirAxis = 'long' | 'up';
export type AirGestureLabel = 'kickflip' | 'heelflip' | 'fs-shuv' | 'bs-shuv';

export interface AirGesture {
  kind: AirGestureKind;
  label: AirGestureLabel;
  axis: AirAxis;
  /** Signed target angular rate about the board-local axis, rad/s. */
  omegaTarget: number;
  /** Flick intensity s ∈ [0,1] (flip) or normalized sweep magnitude (shuv). */
  intensity: number;
  /** Direction/path purity independent of speed, normalized to [0, 1]. */
  accuracy: number;
  confidence: number;
  /** +1 / −1 (sign of omegaTarget). */
  sign: number;
  openStep: number;
}

export interface AirFootInput {
  planted: boolean;
  /** Calibrated pad velocity (units/s). */
  vel: Vec2;
}

export interface AirGestureInputs {
  step: number;
  /** Fixed sim timestep, s. */
  dt: number;
  nose: AirFootInput;
  tail: AirFootInput;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Wrap an angle to (−π, π]. */
function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x <= -Math.PI) x += 2 * Math.PI;
  return x;
}

/**
 * A near-180° velocity discontinuity is a finger reversing along the same
 * line, not evidence that its path curved around the board. Genuine scripted
 * and human shuv sweeps build their turn across multiple smaller segments.
 */
const MAX_SWEEP_SEGMENT_TURN_RAD = Math.PI * 0.75;
const MIN_SWEEP_TURN_SEGMENTS = 2;

/** Label from the trick axis + signed rotation (the one shared naming rule). */
export function labelFor(kind: AirGestureKind, sign: number): AirGestureLabel {
  if (kind === 'flip') return sign >= 0 ? 'kickflip' : 'heelflip';
  return sign >= 0 ? 'bs-shuv' : 'fs-shuv';
}

export class AirGestureClassifier {
  #open: AirGesture | null = null;
  #replacements = 0;

  // Per-air-window accumulators (reset on each new pop/air entry).
  #latDisp = 0;
  #peakLat = 0;
  #peakLong = 0;
  #yawArc = 0;
  #sweepTurnSegments = 0;
  #prevDir: number | null = null;
  #activeFoot: 'nose' | 'tail' | null = null;
  #movingSamples = 0;

  private readonly regular: boolean;
  private readonly sensitivity: number;

  constructor(
    private readonly config: SimConfig,
    stance: Stance,
    private readonly telemetry?: Telemetry,
    flickSensitivity = DEFAULT_FLICK_SENSITIVITY,
  ) {
    this.regular = stance === 'regular';
    const finiteSensitivity = Number.isFinite(flickSensitivity)
      ? flickSensitivity
      : DEFAULT_FLICK_SENSITIVITY;
    this.sensitivity = Math.max(
      FLICK_SENSITIVITY_MIN,
      Math.min(FLICK_SENSITIVITY_MAX, finiteSensitivity),
    );
  }

  /** Fresh maneuver: clear the open label and all evidence. */
  reset(): void {
    this.#open = null;
    this.#replacements = 0;
    this.#latDisp = 0;
    this.#peakLat = 0;
    this.#peakLong = 0;
    this.#yawArc = 0;
    this.#sweepTurnSegments = 0;
    this.#prevDir = null;
    this.#activeFoot = null;
    this.#movingSamples = 0;
  }

  get open(): AirGesture | null {
    return this.#open ? { ...this.#open } : null;
  }

  /** Same-family label replacements in the current air window (hysteresis test). */
  get replacements(): number {
    return this.#replacements;
  }

  /** Board-local (vLong along nose, vLat across-board heelside+) of a pad vel. */
  private decompose(v: Vec2): { vLong: number; vLat: number } {
    return this.regular
      ? { vLong: v.x, vLat: v.y }
      : { vLong: -v.x, vLat: -v.y };
  }

  /**
   * Observe one air step. Returns the currently open air gesture (or null).
   * Only ever called by the FSM inside the air-trick window (step ≤ expireStep).
   */
  update(inp: AirGestureInputs): AirGesture | null {
    // Pick the ACTIVE (flicking) foot by max pad speed — never a fixed role, so
    // stance's nose/tail binding does not double-count into the decomposition.
    let active: { foot: 'nose' | 'tail'; vel: Vec2; speed: number } | null = null;
    for (const foot of ['nose', 'tail'] as const) {
      const f = inp[foot];
      if (!f.planted) continue;
      const speed = Math.hypot(f.vel.x, f.vel.y);
      if (!active || speed > active.speed) active = { foot, vel: f.vel, speed };
    }
    if (!active) return this.open; // no planted foot to read — hold current state

    // Sensitivity is deliberately local to trick recognition. It scales the
    // player's post-pop motion evidence (speed, travel, and sweep arc) without
    // touching BoardController or the board's physical propulsion.
    const gestureVel = {
      x: active.vel.x * this.sensitivity,
      y: active.vel.y * this.sensitivity,
    };
    const gestureSpeed = active.speed * this.sensitivity;
    const { vLong, vLat } = this.decompose(gestureVel);
    if (this.#activeFoot !== active.foot) {
      this.#prevDir = null; // foot switched — don't accumulate a bogus turn
      this.#activeFoot = active.foot;
    }
    this.#latDisp += vLat * inp.dt;
    if (Math.abs(vLat) > this.#peakLat) this.#peakLat = Math.abs(vLat);
    if (Math.abs(vLong) > this.#peakLong) this.#peakLong = Math.abs(vLong);

    // Turning of the velocity direction (arc evidence for sweep). Only integrate
    // when actually moving, so a near-still foot's noisy direction is ignored.
    const rec = this.config.recognition;
    if (gestureSpeed > rec.flickSpeedMin * 0.25) {
      this.#movingSamples += 1;
      const dir = Math.atan2(gestureVel.y, gestureVel.x);
      if (this.#prevDir !== null) {
        const turn = wrapPi(dir - this.#prevDir);
        if (Math.abs(turn) <= MAX_SWEEP_SEGMENT_TURN_RAD) {
          this.#yawArc += turn * this.sensitivity;
          if (Math.abs(turn) > 1e-3) this.#sweepTurnSegments += 1;
        }
      }
      this.#prevDir = dir;
    }

    const candidate = this.#candidate(inp.step);
    if (candidate) this.#openOrReplace(candidate, inp.step);
    return this.open;
  }

  /** Build the best candidate label from the current evidence, or null. */
  #candidate(step: number): AirGesture | null {
    const rec = this.config.recognition;
    const flip = this.config.flip;

    const flickGate =
      this.#movingSamples >= 3 &&
      this.#peakLat >= rec.flickSpeedMin &&
      this.#peakLat >= flip.axisDominanceRatio * this.#peakLong &&
      Math.abs(this.#latDisp) >= flip.flickPathMinLen;
    const sweepGate =
      this.#sweepTurnSegments >= MIN_SWEEP_TURN_SEGMENTS &&
      Math.abs(this.#yawArc) >= rec.sweepMinAngleRad;
    if (!flickGate && !sweepGate) return null;

    // Dominant-axis resolution (spec §3.1): compare threshold-normalized scores.
    const flickN = this.#peakLat / rec.flickSpeedMin;
    const arcN = Math.abs(this.#yawArc) / rec.sweepMinAngleRad;
    // A clearly developed arc owns shuv even when one leg of that arc was also
    // a fast lateral motion. This keeps forgiving thresholds from opening a
    // flip on the first sample and then refusing the player's smooth sweep.
    const clearSweep = sweepGate && arcN >= 1.25;
    const chooseFlip = flickGate && (!clearSweep && (!sweepGate || flickN >= arcN));

    if (chooseFlip) {
      const raw = clamp01(
        (this.#peakLat - rec.flickSpeedMin) /
          Math.max(1e-6, flip.flickSpeedForMaxS - rec.flickSpeedMin),
      );
      // Crossing the forgiving gesture gate should complete a readable game
      // trick. Fine motor precision varies the upper third; it does not decide
      // whether the board responds at all.
      const s = 0.72 + 0.28 * raw;
      const axisPurity = this.#peakLat / Math.max(1e-6, this.#peakLat + this.#peakLong);
      const pathCompletion = clamp01(
        Math.abs(this.#latDisp) / Math.max(1e-6, flip.flickPathMinLen * 2),
      );
      const accuracy = clamp01(0.65 * axisPurity + 0.35 * pathCompletion);
      const sign = this.#latDisp >= 0 ? 1 : -1;
      return {
        kind: 'flip',
        label: labelFor('flip', sign),
        axis: 'long',
        omegaTarget: s * sign * flip.omegaFlipMax,
        intensity: s,
        accuracy,
        confidence: rec.cEnter + (1 - rec.cEnter) * raw,
        sign,
        openStep: step,
      };
    }

    const s = clamp01(
      (Math.abs(this.#yawArc) - rec.sweepMinAngleRad) /
        Math.max(1e-6, Math.PI - rec.sweepMinAngleRad),
    );
    // Stance folds into the shuv sign exactly once (mirror of the flip latAxis).
    const shuvSign = (this.regular ? this.#yawArc : -this.#yawArc) >= 0 ? 1 : -1;
    const accuracy = clamp01(
      Math.abs(this.#yawArc) / Math.max(1e-6, rec.sweepMinAngleRad * 2),
    );
    return {
      kind: 'shuv',
      label: labelFor('shuv', shuvSign),
      axis: 'up',
      omegaTarget: shuvSign * flip.shuvOmegaMax,
      intensity: s,
      accuracy,
      confidence: rec.cEnter + (1 - rec.cEnter) * s,
      sign: shuvSign,
      openStep: step,
    };
  }

  #openOrReplace(candidate: AirGesture, step: number): void {
    const rec = this.config.recognition;
    if (!this.#open) {
      if (candidate.confidence >= rec.cEnter) {
        this.#open = candidate;
        this.telemetry?.log({
          type: candidate.kind === 'flip' ? 'flipRecognized' : 'shuvRecognized',
          step,
          label: candidate.label,
          sign: candidate.sign,
          intensity: candidate.intensity,
          confidence: candidate.confidence,
          omegaTarget: candidate.omegaTarget,
        });
      }
      return;
    }

    const sameLabel = candidate.kind === this.#open.kind && candidate.sign === this.#open.sign;
    if (sameLabel) {
      // Grow the established envelope; keep the original openStep. Confidence is
      // the running peak so a later challenger must beat the peak, not the dip.
      this.#open.intensity = candidate.intensity;
      this.#open.accuracy = candidate.accuracy;
      this.#open.omegaTarget = candidate.omegaTarget;
      if (candidate.confidence > this.#open.confidence) this.#open.confidence = candidate.confidence;
      return;
    }

    // Different label: replace only if higher by the margin (spec §3 replace δ).
    if (candidate.confidence >= this.#open.confidence + rec.replaceMargin) {
      this.#replacements += 1;
      this.#open = candidate;
      this.telemetry?.log({
        type: candidate.kind === 'flip' ? 'flipRecognized' : 'shuvRecognized',
        step,
        label: candidate.label,
        sign: candidate.sign,
        intensity: candidate.intensity,
        confidence: candidate.confidence,
        omegaTarget: candidate.omegaTarget,
        replaced: true,
      });
    }
    // Otherwise keep the open label (hysteresis).
  }
}
