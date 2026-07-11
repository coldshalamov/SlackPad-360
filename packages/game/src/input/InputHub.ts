/**
 * InputHub — multi-source ContactFrame intake.
 *
 * Every frame (hardware, synthetic, agent, replay) enters the sim through here
 * and nowhere else (final-input-and-trick-spec: "ContactFrame is the sole path
 * for hardware, agent, replay, synthetic"). Frames are validated against the
 * shared v1 contract on the way in; malformed frames are rejected + logged and
 * never thrown past this boundary. Valid frames are held in an ordered queue
 * (by tPerfMs, then frameId) and released as a batch to the sim per step.
 *
 * Frame-consumption policy (architecture §4, chosen for M2): the sim drains ALL
 * pending ordered frames, then steps once. `drainForStep()` implements the
 * drain half of that policy.
 */

import type { ContactFrame, ContactFrameSource } from '@slackpad/shared';
import { quantizeContactFrame, validateContactFrame } from '@slackpad/shared';
import type { Telemetry } from '../telemetry/Telemetry';

/**
 * Canonicalize an accepted frame: quantize to the replay grid and rebuild a
 * fresh object with exactly the contract fields. This guarantees that
 *  (a) the sim consumes IDENTICAL values live and on replay (G4 — quantizing
 *      only at trace-storage time would let raw/quantized streams diverge, and
 *      sub-quantum tPerfMs ties could even reorder between record and replay);
 *  (b) callers cannot mutate a queued/recorded frame after push (no aliasing);
 *  (c) unknown extra properties never reach the sim or the trace.
 */
function canonicalizeFrame(frame: ContactFrame): ContactFrame {
  const q = quantizeContactFrame(frame);
  const out: ContactFrame = {
    schemaVersion: q.schemaVersion,
    frameId: q.frameId,
    tPerfMs: q.tPerfMs,
    source: q.source,
    contacts: q.contacts.map((c) => ({
      id: c.id,
      tip: c.tip,
      x: c.x,
      y: c.y,
      confidence: c.confidence,
      ...(c.pressure !== undefined ? { pressure: c.pressure } : {}),
      ...(c.width !== undefined ? { width: c.width } : {}),
      ...(c.height !== undefined ? { height: c.height } : {}),
    })),
    buttons: {
      primary: q.buttons.primary,
      secondary: q.buttons.secondary,
      auxiliary: q.buttons.auxiliary,
    },
  };
  if (q.tScanUs !== undefined) out.tScanUs = q.tScanUs;
  if (q.meta !== undefined) out.meta = structuredClone(q.meta);
  return out;
}

interface QueuedFrame {
  frame: ContactFrame;
  /** Monotonic intake sequence — total-order tiebreak for equal (tPerfMs, frameId). */
  seq: number;
}

export class InputHub {
  private readonly pending: QueuedFrame[] = [];
  private readonly sources = new Set<string>();
  private seq = 0;

  constructor(private readonly telemetry: Telemetry) {}

  /** Announce a frame source (bookkeeping/telemetry; push does not require it). */
  registerSource(source: ContactFrameSource): void {
    if (!this.sources.has(source)) {
      this.sources.add(source);
      this.telemetry.log({ type: 'sourceRegistered', source });
    }
  }

  /** Sources seen via registerSource(). */
  registeredSources(): ContactFrameSource[] {
    return [...this.sources] as ContactFrameSource[];
  }

  /**
   * Validate + enqueue a frame. Invalid frames emit a `frameRejected` event and
   * are dropped. NEVER throws — malformed input from any source is data, not a
   * fault (gt-malformed suite).
   */
  push(frame: ContactFrame): boolean {
    // Hostile inputs (getter-throwing objects, Proxy traps) must not escape
    // this boundary either — validation AND canonicalization run inside the
    // guard so "NEVER throws" holds for arbitrary junk, not just plain data.
    try {
      const result = validateContactFrame(frame);
      if (!result.ok) {
        const source =
          frame && typeof frame === 'object' && typeof (frame as { source?: unknown }).source === 'string'
            ? (frame as { source: string }).source
            : 'unknown';
        this.telemetry.log({ type: 'frameRejected', source, errors: result.errors });
        return false;
      }
      const canonical = canonicalizeFrame(frame);
      this.sources.add(canonical.source);
      this.pending.push({ frame: canonical, seq: this.seq++ });
      this.telemetry.log({
        type: 'frameAccepted',
        source: canonical.source,
        frameId: canonical.frameId,
      });
      return true;
    } catch (err) {
      this.telemetry.log({
        type: 'frameRejected',
        source: 'unknown',
        errors: [`push threw: ${err instanceof Error ? err.message : String(err)}`],
      });
      return false;
    }
  }

  /** Number of frames waiting to be consumed by the next step. */
  pendingCount(): number {
    return this.pending.length;
  }

  /**
   * Return and clear all pending frames in canonical order (tPerfMs, then
   * frameId, then intake sequence). The sim consumes the whole batch, then
   * steps once.
   */
  drainForStep(): ContactFrame[] {
    if (this.pending.length === 0) return [];
    const ordered = this.pending
      .slice()
      .sort((a, b) => {
        if (a.frame.tPerfMs !== b.frame.tPerfMs) return a.frame.tPerfMs - b.frame.tPerfMs;
        if (a.frame.frameId !== b.frame.frameId) return a.frame.frameId - b.frame.frameId;
        return a.seq - b.seq;
      })
      .map((q) => q.frame);
    this.pending.length = 0;
    return ordered;
  }

  /** Drop queued frames AND source bookkeeping (used on reset — no cross-run leaks). */
  clear(): void {
    this.pending.length = 0;
    this.seq = 0;
    this.sources.clear();
  }
}
