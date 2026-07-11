import type { ContactFrame } from './contactFrame';

/**
 * Replay format v1. Body is the ordered ContactFrame stream plus periodic
 * checkpoint hashes of sim state; identical header + body must reproduce
 * identical checkpoints (G4).
 */

export const REPLAY_VERSION = 1 as const;

export interface ReplayHeader {
  replayVersion: typeof REPLAY_VERSION;
  gameVersion: string;
  rapierVersion: string;
  hz: number;
  seed: number;
  levelId: string;
  createdAt: string;
  contactFrameSchema: 1;
  /** Input profile at record time — stance/padYawOffset affect interpretation. */
  profile?: Record<string, unknown>;
}

export interface ReplayCheckpoint {
  step: number;
  /** FNV-1a / stable hash of quantized board pose + phase. */
  hash: string;
}

export interface SessionTrace {
  header: ReplayHeader;
  /** Frames tagged with the sim step at which they were consumed. */
  frames: Array<{ step: number; frame: ContactFrame }>;
  checkpoints: ReplayCheckpoint[];
}

/** Stable 32-bit FNV-1a over a string, hex-encoded. Deterministic across runs. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
