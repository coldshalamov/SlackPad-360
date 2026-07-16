/**
 * Trace-corpus helpers (Sprint 02 S5, reviews/03 §Stage 0.3): load recorded
 * full-session traces from testdata/traces and replay them through a fresh
 * AgentHarness. A corpus trace is a golden made of real hands — replay must
 * reproduce its checkpoints bit-for-bit (G4) or the trace is stale evidence.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReplayCheckpoint, SessionTrace } from '@slackpad/shared';
import { AgentHarness } from '../../src/agent/AgentHarness';

export const CORPUS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', 'testdata', 'traces',
);

/** Every recorded corpus trace (empty until humans record — by policy). */
export function corpusTraceFiles(): string[] {
  if (!existsSync(CORPUS_DIR)) return [];
  return readdirSync(CORPUS_DIR)
    .filter((name) => name.endsWith('.trace.json'))
    .sort()
    .map((name) => join(CORPUS_DIR, name));
}

/** Parse + shape-check one SessionTrace file (throws on malformed input). */
export function loadSessionTrace(filePath: string): SessionTrace {
  const raw: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  const trace = raw as SessionTrace;
  if (
    typeof trace !== 'object' || trace === null ||
    typeof trace.header !== 'object' || trace.header === null ||
    typeof trace.header.seed !== 'number' ||
    typeof trace.header.levelId !== 'string' ||
    !Array.isArray(trace.frames) ||
    !Array.isArray(trace.checkpoints) ||
    typeof trace.controlTrace !== 'object'
  ) {
    throw new Error(`${filePath}: not a SessionTrace (header/frames/checkpoints/controlTrace)`);
  }
  return trace;
}

export interface CorpusReplayResult {
  recorded: ReplayCheckpoint[];
  replayed: ReplayCheckpoint[];
  /** True when every replayed checkpoint matches the recording (G4). */
  identical: boolean;
}

/** Replay a trace through a fresh harness; header validation happens inside. */
export async function replaySessionTrace(trace: SessionTrace): Promise<CorpusReplayResult> {
  const harness = new AgentHarness();
  const replayed = await harness.replay(trace);
  const recorded = trace.checkpoints;
  const identical =
    recorded.length === replayed.length &&
    recorded.every((c, i) => replayed[i]!.step === c.step && replayed[i]!.hash === c.hash);
  return { recorded, replayed, identical };
}
