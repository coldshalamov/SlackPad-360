/**
 * GameLoop — fixed-timestep accumulator (architecture §4).
 *
 * Wall clock is allowed HERE (scheduling only) — never inside the sim step. The
 * loop folds real elapsed time into an accumulator and drains it in fixed
 * `1/hz` increments via `onStep`; `onRender` receives the interpolation alpha
 * (leftover accumulator / dt) so the renderer can blend previous→current pose.
 * The renderer never steps physics; the loop is the sole driver of `onStep`.
 *
 * Overload policy: per-frame intake is clamped to `maxFrameMs`, at most
 * `maxStepsPerFrame` fixed steps run per rendered frame, and — critically —
 * any backlog that still exceeds one fixed step after the cap is DISCARDED
 * (time-drop, reported via `onSaturated`). Without that discard, sustained rAF
 * throttling (occluded window at 1–4 fps) accumulates minutes of sim debt that
 * would replay as a long fast-forward, and alpha would exceed the documented
 * [0, 1) contract.
 */

import type { SimConfig } from '@slackpad/shared';

export interface GameLoopHooks {
  /** Advance the sim exactly one fixed step (drain-all-then-step-once lives here). */
  onStep: () => void;
  /** Render with interpolation alpha and the rAF-derived presentation delta. */
  onRender: (alpha: number, frameDeltaSeconds: number, rawFrameMs: number) => void;
  /** Optional: called when backlog beyond the step cap was discarded (ms dropped). */
  onSaturated?: (droppedMs: number) => void;
}

export class GameLoop {
  private readonly dtMs: number;
  private readonly maxFrameMs: number;
  private readonly maxStepsPerFrame: number;

  private running = false;
  private rafId = 0;
  private lastMs = 0;
  private accumulatorMs = 0;
  private steppedTotal = 0;

  constructor(
    private readonly hooks: GameLoopHooks,
    config: SimConfig,
  ) {
    this.dtMs = 1000 / config.physics.hz;
    this.maxFrameMs = config.runtime.loop.maxFrameMs;
    this.maxStepsPerFrame = config.runtime.loop.maxStepsPerFrame;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastMs = performance.now();
    this.accumulatorMs = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  /** Total fixed steps executed since start (diagnostics / banner). */
  totalSteps(): number {
    return this.steppedTotal;
  }

  /**
   * One scheduler frame at wall time `nowMs`. Public for deterministic unit
   * testing (the rAF callback delegates here); production code never calls it
   * directly.
   */
  tick(nowMs: number): void {
    // Negative elapsed (clock adjustment / first-frame ordering) folds to 0.
    const rawElapsed = Math.max(0, nowMs - this.lastMs);
    const elapsed = Math.min(rawElapsed, this.maxFrameMs);
    // Camera/shoe/wheel presentation must not leap by a tenth of a second when
    // a native WebView or background tab resumes. Use the same rAF clock as the
    // accumulator, but cap visual integration to two fixed steps (33.3 ms at
    // 60 Hz). Simulation overload handling below remains unchanged.
    const presentationElapsed = Math.min(rawElapsed, this.dtMs * 2);
    this.lastMs = nowMs;
    this.accumulatorMs += elapsed;

    let stepped = 0;
    while (this.accumulatorMs >= this.dtMs && stepped < this.maxStepsPerFrame) {
      this.hooks.onStep();
      this.accumulatorMs -= this.dtMs;
      stepped += 1;
      this.steppedTotal += 1;
    }

    // Saturated: the cap was hit with at least one more full step pending.
    // Drop whole-step backlog (keep only the sub-step remainder — modulo is
    // strictly < dt, so alpha stays < 1) and the sim never fast-forwards
    // through stale time after throttling ends.
    if (this.accumulatorMs >= this.dtMs) {
      const remainder = this.accumulatorMs % this.dtMs;
      this.hooks.onSaturated?.(this.accumulatorMs - remainder);
      this.accumulatorMs = remainder;
    }

    this.hooks.onRender(
      this.accumulatorMs / this.dtMs,
      presentationElapsed / 1000,
      rawElapsed,
    );
  }

  private readonly frame = (nowMs: number): void => {
    if (!this.running) return;
    this.tick(nowMs);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
