/**
 * KickArbiter — click-centered pop recognition + the push-vs-ollie conflict
 * table, in ONE place (M4; final-input-and-trick-spec §3.1 / §4.1).
 *
 * TWO ATTRIBUTION MODES (profile.kickAttribution, IMPL-007):
 *
 * 'buttonSide' (shipping Skate-like profile): both feet stay
 * planted like a real ollie stance and the BUTTON picks the kicking end —
 * LMB/primary = back-foot kick → ollie, RMB/secondary = front-foot kick →
 * nollie, resolved INSTANTLY (no lookahead latency or lift choreography).
 * A tiny stable-two-contact debounce rejects the click produced by an initial
 * finger slap. Clicks never mean push (Ctrl/trackpad travel own propulsion).
 *
 * 'plantMask' (M4 legacy): on a kick (primary rising edge) the plant mask
 * decides the path:
 *
 *   | Plant mask | Decision                                                |
 *   | ---------- | ------------------------------------------------------- |
 *   | tail only  | OLLIE pop path (prep quality from the lookback buffer)  |
 *   | nose only  | NOLLIE pop path (mirrored)                               |
 *   | both       | bothClickMeans 'ignore' → no action; 'ollie' → ollie;     |
 *   |            | 'push' → HELD PENDING                                     |
 *   |            | for popLookaheadMs: a nose lift within the window makes  |
 *   |            | it an ollie ("clicked slightly before the lift" — the    |
 *   |            | forgiveness case, research/control-grammar §6.2), a tail |
 *   |            | lift makes it a nollie, expiry releases it to locomotion |
 *   |            | as a push (BoardController applies the pulse).           |
 *   | none       | ignored (soft suppress)                                  |
 *
 * The FSM CLAIMS a kick when a pop path opens; otherwise the kick goes to
 * locomotion — never both, so push and pop cannot double-trigger. The cost of
 * the forgiveness window is that a both-planted push resolves popLookaheadMs
 * (~4 steps) after the click; that latency is the disambiguation price and is
 * covered by the push cooldown.
 *
 * Pop quality q ∈ [0, 1] (intensity input for ManeuverAssist — the label
 * itself is pure occurrence):
 *   timing = 1 − |lift↔click gap| / windowSide   (click-centered)
 *   crisp  = liftSpeed ≥ prepLiftSpeedMin ? min(liftSpeed / prepLiftSpeedForMaxQ, 1) : 0
 *   q      = qTimingWeight·timing + qCrispWeight·crisp
 * No prep lift found in the lookback → unarmed click, ignored in the shipping
 * plant-mask profile. Shipping button-side clicks use the fixed configured
 * clickQuality instead; no lift timing is involved.
 *
 * Determinism: step-count arithmetic only (ms → steps via hz); no wall clock.
 *
 * tapToClickIsKick note: OS tap-generated primaries are indistinguishable from
 * physical clicks at the ContactFrame level (report-level Button 1). Honoring
 * `tapToClickIsKick: false` needs adapter metadata from the native host and is
 * deferred to the host milestone — documented, not silently dropped.
 */

import type { InputProfile, PopConfig, RecognitionConfig, SimConfig } from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';
import type { FeetState, KickEvent } from '../input/FootTracker';

/** A kick that opened a pop path (occurrence + quality). */
export interface PopRecognition {
  /** Step at which the pop resolved (== kick step unless lookahead-resolved). */
  step: number;
  label: 'ollie' | 'nollie';
  /** Pop prep quality ∈ [0, 1]. */
  q: number;
}

export interface ArbitratedKicks {
  /** Kicks claimed by the pop path (consumed by GestureFSM). */
  pops: PopRecognition[];
  /** Kicks released to ground locomotion (consumed by BoardController). */
  locomotion: KickEvent[];
}

interface FeetSnapshot {
  step: number;
  nosePlanted: boolean;
  tailPlanted: boolean;
  noseSpeed: number;
  tailSpeed: number;
}

interface PendingBothKick {
  kickStep: number;
  expiresStep: number;
}

function msToSteps(ms: number, hz: number): number {
  return Math.max(1, Math.round((ms / 1000) * hz));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class KickArbiter {
  private readonly rec: RecognitionConfig;
  private readonly pop: PopConfig;
  private readonly lookbackSteps: number;
  private readonly lookaheadSteps: number;
  private readonly stableClickSteps: number;

  /** Ring of recent per-step feet snapshots (lookback + lookahead + slack). */
  private readonly buffer: FeetSnapshot[] = [];
  private readonly bufferCap: number;

  private pending: PendingBothKick | null = null;

  constructor(
    config: SimConfig,
    private readonly profile: Pick<InputProfile, 'bothClickMeans' | 'kickAttribution'>,
    private readonly telemetry?: Telemetry,
  ) {
    this.rec = config.recognition;
    this.pop = config.pop;
    const hz = config.physics.hz;
    this.lookbackSteps = msToSteps(this.rec.popLookbackMs, hz);
    this.lookaheadSteps = msToSteps(this.rec.popLookaheadMs, hz);
    this.stableClickSteps = msToSteps(this.rec.stableClickContactMs, hz);
    this.bufferCap = this.lookbackSteps + this.lookaheadSteps + 4;
  }

  /**
   * Per-step arbitration. `popAllowed` is the FSM gate (previous-step phase
   * 'ground'): pops open only from riding-on-ground recognition — never
   * spontaneously and never mid-maneuver.
   */
  update(feet: FeetState, kicks: KickEvent[], popAllowed: boolean, step: number): ArbitratedKicks {
    const prev = this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
    const snap: FeetSnapshot = {
      step,
      nosePlanted: feet.nose.planted,
      tailPlanted: feet.tail.planted,
      noseSpeed: Math.hypot(feet.nose.vel.x, feet.nose.vel.y),
      tailSpeed: Math.hypot(feet.tail.vel.x, feet.tail.vel.y),
    };
    this.buffer.push(snap);
    if (this.buffer.length > this.bufferCap) this.buffer.shift();

    const out: ArbitratedKicks = { pops: [], locomotion: [] };

    // --- Resolve a pending both-mask kick (lookahead confirmation) ----------
    if (this.pending) {
      if (!popAllowed) {
        // Phase left ground while pending (bounce/bail) — drop the kick.
        this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'dropped-pending', mask: 'both' });
        this.pending = null;
      } else {
        const noseLifted = prev != null && prev.nosePlanted && !snap.nosePlanted;
        const tailLifted = prev != null && prev.tailPlanted && !snap.tailPlanted;
        if (noseLifted && snap.tailPlanted) {
          // Click-before-lift forgiveness: still an ollie.
          const gap = step - this.pending.kickStep;
          const timing = 1 - clamp01(gap / this.lookaheadSteps);
          const crisp = this.crispness(prev ? prev.noseSpeed : 0);
          out.pops.push({ step, label: 'ollie', q: this.quality(timing, crisp) });
          this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'ollie-lookahead', mask: 'both' });
          this.pending = null;
        } else if (tailLifted && snap.nosePlanted) {
          const gap = step - this.pending.kickStep;
          const timing = 1 - clamp01(gap / this.lookaheadSteps);
          const crisp = this.crispness(prev ? prev.tailSpeed : 0);
          out.pops.push({ step, label: 'nollie', q: this.quality(timing, crisp) });
          this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'nollie-lookahead', mask: 'both' });
          this.pending = null;
        } else if (step > this.pending.expiresStep) {
          // No lift within the lookahead: it was a push all along. (The
          // pending path only ever holds primary clicks — plantMask mode.)
          out.locomotion.push({ step: this.pending.kickStep, mask: 'both', button: 'primary' });
          this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'push', mask: 'both' });
          this.pending = null;
        }
      }
    }

    // --- Classify new kicks --------------------------------------------------
    for (const kick of kicks) {
      if (!popAllowed) {
        // Not riding on ground: no pop path AND no push (mid-maneuver kicks are
        // reserved for later milestones, e.g. grind hop).
        this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'ignored-phase', mask: kick.mask });
        continue;
      }

      // --- 'buttonSide' attribution (IMPL-007, the Tech Deck model) ---------
      // Both feet stay planted like a real ollie stance; the BUTTON picks the
      // kicking end: LMB/primary = back foot (ollie), RMB/secondary = front
      // foot (nollie) — instantly, no lookahead. With only one foot planted
      // the planted foot wins regardless of button (a foot that is not on the
      // board cannot kick). Clicks never mean push here — cruise drive covers
      // push, so the plantMask pending machinery is bypassed entirely.
      if (this.profile.kickAttribution === 'buttonSide') {
        if (kick.mask !== 'both' || !this.hadStableTwoFingerStanceBefore(step)) {
          this.telemetry?.log({
            type: 'kickArbitrated',
            step,
            decision: kick.mask === 'none' ? 'ignored-none' : 'ignored-unstable-contact',
            mask: kick.mask,
          });
          continue;
        }
        const label: 'ollie' | 'nollie' = kick.button === 'secondary' ? 'nollie' : 'ollie';
        out.pops.push({ step, label, q: clamp01(this.pop.clickQuality) });
        this.telemetry?.log({
          type: 'kickArbitrated',
          step,
          decision: `${label}-${kick.button === 'secondary' ? 'rmb' : 'lmb'}`,
          mask: kick.mask,
        });
        if (out.pops.length > 0) break;
        continue;
      }

      // --- 'plantMask' attribution (M4 legacy behavior, unchanged) ----------
      switch (kick.mask) {
        case 'tail':
          {
            const q = this.lookbackQuality('nose', step);
            if (q == null) {
              this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'ignored-unarmed', mask: kick.mask });
            } else {
              out.pops.push({ step, label: 'ollie', q });
              this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'ollie', mask: kick.mask });
            }
          }
          break;
        case 'nose':
          {
            const q = this.lookbackQuality('tail', step);
            if (q == null) {
              this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'ignored-unarmed', mask: kick.mask });
            } else {
              out.pops.push({ step, label: 'nollie', q });
              this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'nollie', mask: kick.mask });
            }
          }
          break;
        case 'both':
          if (this.profile.bothClickMeans === 'ignore') {
            // Shipping Tech Deck profile: an unprepared click is commonly an
            // OS tap-to-click produced while planting. It cannot be a jump.
            this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'ignored-unarmed', mask: kick.mask });
          } else if (this.profile.bothClickMeans === 'ollie') {
            // Advanced mapping: both-planted click pops directly.
            out.pops.push({ step, label: 'ollie', q: this.lookbackQuality('nose', step) ?? 0 });
            this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'ollie-both', mask: kick.mask });
          } else if (this.pending == null && out.pops.length === 0) {
            this.pending = { kickStep: step, expiresStep: step + this.lookaheadSteps };
            this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'pending', mask: kick.mask });
          } else {
            this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'ignored-duplicate', mask: kick.mask });
          }
          break;
        case 'none':
          this.telemetry?.log({ type: 'kickArbitrated', step, decision: 'ignored-none', mask: kick.mask });
          break;
      }
      // One pop per step at most: further kicks this step go unprocessed.
      if (out.pops.length > 0) break;
    }

    return out;
  }

  /** Completed steps before the click must already show a two-finger stance. */
  private hadStableTwoFingerStanceBefore(kickStep: number): boolean {
    let stable = 0;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const s = this.buffer[i]!;
      if (s.step >= kickStep) continue;
      if (!s.nosePlanted || !s.tailPlanted) return false;
      stable += 1;
      if (stable >= this.stableClickSteps) return true;
    }
    return false;
  }

  /**
   * Prep quality for a kick whose mask already committed the pop: search the
   * lookback window for the most recent lift edge of the PREP foot (nose for
   * ollie, tail for nollie); timing is click-centered on that edge.
   */
  private lookbackQuality(prepFoot: 'nose' | 'tail', kickStep: number): number | null {
    const planted = (s: FeetSnapshot): boolean => (prepFoot === 'nose' ? s.nosePlanted : s.tailPlanted);
    const speed = (s: FeetSnapshot): number => (prepFoot === 'nose' ? s.noseSpeed : s.tailSpeed);
    for (let i = this.buffer.length - 1; i >= 1; i--) {
      const cur = this.buffer[i]!;
      const before = this.buffer[i - 1]!;
      if (cur.step < kickStep - this.lookbackSteps) break;
      if (!planted(cur) && planted(before)) {
        const gap = kickStep - cur.step;
        if (gap > this.lookbackSteps) break;
        const timing = 1 - clamp01(gap / this.lookbackSteps);
        return this.quality(timing, this.crispness(speed(before)));
      }
    }
    return null; // no lift preparation: likely an accidental plant/tap click
  }

  /** Crispness ∈ [0,1] from the prep foot's pad speed at the lift instant. */
  private crispness(liftSpeed: number): number {
    if (liftSpeed < this.rec.prepLiftSpeedMin) return 0;
    return clamp01(liftSpeed / this.pop.prepLiftSpeedForMaxQ);
  }

  private quality(timing: number, crisp: number): number {
    return clamp01(this.pop.qTimingWeight * timing + this.pop.qCrispWeight * crisp);
  }
}
