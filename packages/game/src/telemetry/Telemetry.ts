/**
 * Typed telemetry event bus + bounded ring log.
 *
 * The debug overlay, tests, and the agent harness all read from a single
 * Telemetry instance. Events are cheap plain-data records; the ring log is
 * capacity-bounded (config `runtime.telemetry.ringCapacity`) so a long session
 * never grows the working set without bound (observability spec §3).
 */

import type { ContactFrameSource } from '@slackpad/shared';

/** Discriminated telemetry events. `log()` accepts any of these. */
export type TelemetryEvent =
  | { type: 'reset'; step: number; seed: number; levelId: string }
  | { type: 'stepped'; step: number }
  | { type: 'checkpoint'; step: number; hash: string }
  | { type: 'frameRejected'; source: string; errors: string[] }
  | { type: 'frameAccepted'; source: ContactFrameSource; frameId: number }
  | { type: 'frameInjected'; source: ContactFrameSource; count: number }
  | { type: 'sourceRegistered'; source: string }
  | { type: 'recordingStarted'; step: number }
  | { type: 'recordingStopped'; step: number; frames: number; checkpoints: number }
  // --- M3 recognizer/controller events -----------------------------------
  | { type: 'footRebind'; reason: string; role?: 'nose' | 'tail'; step?: number; dropped?: number }
  | { type: 'kick'; step: number; mask: 'nose' | 'tail' | 'both' | 'none' }
  | { type: 'push'; step: number; mask: string }
  | { type: 'recenter'; reason: string }
  | { type: 'groundControl'; step: number; drive: number; yaw: number; bothPlanted: boolean }
  | { type: 'profileChanged'; patch: Record<string, unknown> }
  // --- M4 maneuver (pop/air/catch/land/bail) events -----------------------
  | { type: 'phaseChanged'; step: number; from: string; to: string }
  | { type: 'popRecognized'; step: number; label: 'ollie' | 'nollie'; q: number; confidence: number }
  | { type: 'popFizzled'; step: number; label: string }
  | { type: 'kickArbitrated'; step: number; decision: string; mask: string }
  | { type: 'catch'; step: number; foot: 'nose' | 'tail' | 'both'; factor: number }
  | {
      type: 'trickCompleted';
      step: number;
      label: string;
      cleanliness: 'clean' | 'dirty';
      thetaDeg: number;
      // M5: signed measured rotation at land (feeds the M9 scorer).
      flipRotations?: number;
      shuvDegrees?: number;
    }
  | { type: 'bail'; step: number; reason: string; flipRotations?: number; shuvDegrees?: number }
  | { type: 'respawn'; step: number }
  | { type: 'contactImpulse'; step: number; impulse: number; grounded: boolean }
  // --- M5 air-gesture (flick→flip / sweep→shuv) recognition ----------------
  | {
      type: 'flipRecognized' | 'shuvRecognized';
      step: number;
      label: string;
      sign: number;
      intensity: number;
      confidence: number;
      omegaTarget: number;
      replaced?: boolean;
    }
  | { type: 'quantize'; step: number; axis: 'long' | 'up'; damp: number; residualDeg: number }
  // Legacy M4 routing event (superseded by flip/shuvRecognized; kept for shape).
  | { type: 'airGesture'; step: number; foot: 'nose' | 'tail'; kind: string; speed: number }
  // Escape hatch for ad-hoc diagnostic events (never used for gameplay logic).
  | { type: string; [key: string]: unknown };

export type TelemetryEventType = TelemetryEvent['type'];

export interface TelemetrySnapshot {
  counts: Record<string, number>;
  events: TelemetryEvent[];
}

export type TelemetryListener = (event: TelemetryEvent) => void;

function deepFreeze(value: unknown): void {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
}

export class Telemetry {
  private readonly ring: TelemetryEvent[] = [];
  private readonly counts: Record<string, number> = {};
  private readonly listeners = new Set<TelemetryListener>();
  private readonly capacity: number;

  constructor(ringCapacity = 10000) {
    this.capacity = Math.max(1, Math.floor(ringCapacity));
  }

  /**
   * Record an event: tally by type, append to the ring, notify listeners.
   * Events are deep-frozen on entry so no subscriber (or later reader of a
   * snapshot) can corrupt the verification log — telemetry is evidence.
   */
  log(event: TelemetryEvent): void {
    deepFreeze(event);
    this.counts[event.type] = (this.counts[event.type] ?? 0) + 1;
    this.ring.push(event);
    if (this.ring.length > this.capacity) this.ring.shift();
    for (const listener of this.listeners) listener(event);
  }

  /** Subscribe to live events (debug overlay / audio triggers). */
  subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Total number of events of a given type observed since the last reset. */
  count(type: TelemetryEventType): number {
    return this.counts[type] ?? 0;
  }

  /** Immutable-ish snapshot for tests / overlay (arrays are fresh copies). */
  snapshot(): TelemetrySnapshot {
    return { counts: { ...this.counts }, events: [...this.ring] };
  }

  /** Clear ring + counters (called on sim reset so counts scope to a run). */
  clear(): void {
    this.ring.length = 0;
    for (const key of Object.keys(this.counts)) delete this.counts[key];
  }
}
