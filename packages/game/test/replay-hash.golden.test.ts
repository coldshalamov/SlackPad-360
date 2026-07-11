/// <reference types="node" />
/**
 * Replay-hash golden (G4). Three checks:
 *  1. repro    — record a scripted ~240-step session, replay(trace) reproduces
 *                identical checkpoint hashes.
 *  2. dual-run — two fresh harnesses, same seed + same frames → identical hashes.
 *  3. cross-seed — different seed (flat-dev has seeded spawn variation) → the
 *                checkpoint hash sequence differs (guards against constant-hash).
 *
 * When GOLDEN_REPORT_DIR is set, a machine-readable report is written per
 * final-observability §4.1.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentHarness } from '../src/agent/AgentHarness';
import type { InjectableFrame } from '../src/agent/AgentHarness';
import type { ReplayCheckpoint, SessionTrace } from '@slackpad/shared';
import { CONTACT_FRAME_SCHEMA_VERSION } from '@slackpad/shared';

/**
 * Pinned baselines: committed expected hash sequences. A behavioral physics or
 * input-path change fails here even when record and replay agree with each
 * other (self-consistency alone would pass silently). Regenerate deliberately
 * with UPDATE_GOLDENS=1 and review the diff like any other contract change.
 */
const BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'goldens', 'baselines.json');
const UPDATE_GOLDENS = process.env.UPDATE_GOLDENS === '1';
const baselines: Record<string, string> = existsSync(BASELINE_PATH)
  ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, string>)
  : {};
const newBaselines: Record<string, string> = {};

function checkBaseline(key: string, actual: string): void {
  newBaselines[key] = actual;
  if (UPDATE_GOLDENS) return;
  const pinned = baselines[key];
  if (pinned === undefined) {
    throw new Error(
      `no pinned baseline for "${key}" — run UPDATE_GOLDENS=1 vitest and commit goldens/baselines.json`,
    );
  }
  expect(actual, `pinned golden baseline "${key}"`).toBe(pinned);
}

const SESSION_STEPS = 240;
const INJECT_STEPS = [10, 40, 70, 100, 130, 160, 190, 220];
const DT_MS = 1000 / 60;

interface GoldenReport {
  suite: string;
  passed: boolean;
  hashExpected: string;
  hashActual: string;
  steps: number;
}
const reports: GoldenReport[] = [];

function plantFrame(step: number, frameId: number): InjectableFrame {
  // source omitted → stamped 'agent' by the harness.
  return {
    schemaVersion: CONTACT_FRAME_SCHEMA_VERSION,
    frameId,
    tPerfMs: step * DT_MS,
    contacts: [
      { id: 1, tip: true, x: 0.4, y: 0.55, confidence: true },
      { id: 2, tip: true, x: 0.6, y: 0.55, confidence: true },
    ],
    buttons: { primary: false, secondary: false, auxiliary: false },
  };
}

/** Record a fixed scripted session and return its trace. */
async function recordSession(harness: AgentHarness, seed: number): Promise<SessionTrace> {
  await harness.reset(seed, 'flat-dev');
  harness.startRecording();
  let frameId = 0;
  const injectAt = new Set(INJECT_STEPS);
  for (let i = 0; i < SESSION_STEPS; i++) {
    if (injectAt.has(i)) harness.injectContactFrame(plantFrame(i, frameId++));
    harness.step(1);
  }
  return harness.stopRecording();
}

const joinHashes = (cps: ReplayCheckpoint[]): string => cps.map((c) => `${c.step}:${c.hash}`).join('|');

describe('replay-hash golden (G4)', () => {
  it('replay(trace) reproduces identical checkpoint hashes', async () => {
    const harness = new AgentHarness();
    const trace = await recordSession(harness, 0xa11ce);
    expect(trace.checkpoints.length).toBeGreaterThan(0);

    const replayed = await harness.replay(trace);
    const expected = joinHashes(trace.checkpoints);
    const actual = joinHashes(replayed);

    reports.push({
      suite: 'replay-hash-repro',
      passed: expected === actual,
      hashExpected: expected,
      hashActual: actual,
      steps: SESSION_STEPS,
    });

    expect(replayed).toEqual(trace.checkpoints);
    checkBaseline('replay-hash-repro', expected);
  });

  it('checkpoints are input-sensitive: same seed with vs without frames diverges', async () => {
    const withFrames = new AgentHarness();
    const withoutFrames = new AgentHarness();
    const traceA = await recordSession(withFrames, 0xfeed);

    await withoutFrames.reset(0xfeed, 'flat-dev');
    withoutFrames.startRecording();
    withoutFrames.step(SESSION_STEPS);
    const traceB = withoutFrames.stopRecording();

    // Frames do not yet drive physics in M2, but the consumed-input digest is
    // folded into every checkpoint — so a broken input path (frames silently
    // dropped, reordered, or mutated) can never masquerade as a passing G4.
    expect(joinHashes(traceA.checkpoints)).not.toBe(joinHashes(traceB.checkpoints));
  });

  it('sub-quantum tPerfMs ties replay in identical order (canonicalized at intake)', async () => {
    const record = async (): Promise<{ trace: SessionTrace; replayed: ReplayCheckpoint[] }> => {
      const harness = new AgentHarness();
      await harness.reset(0x7ae, 'flat-dev');
      harness.startRecording();
      for (let i = 0; i < 90; i++) {
        if (i === 20) {
          // Two frames whose raw tPerfMs differ by less than the 10 µs replay
          // quantum, with frameId order INVERTED vs time order. Without
          // intake-time quantization the live run orders by raw time while the
          // replay orders by frameId tiebreak — a hash divergence. Canonical
          // intake makes both runs see the same tie and the same tiebreak.
          harness.injectContactFrame([
            { ...plantFrame(20, 9), tPerfMs: 333.331 },
            { ...plantFrame(20, 2), tPerfMs: 333.334 },
          ]);
        }
        harness.step(1);
      }
      const trace = harness.stopRecording();
      const replayed = await harness.replay(trace);
      return { trace, replayed };
    };

    const { trace, replayed } = await record();
    expect(replayed).toEqual(trace.checkpoints);
    checkBaseline('replay-hash-tie-order', joinHashes(trace.checkpoints));
  });

  it('startRecording() mid-run throws (v1 traces are full-session)', async () => {
    const harness = new AgentHarness();
    await harness.reset(1, 'flat-dev');
    harness.step(5);
    expect(() => harness.startRecording()).toThrow(/step 0/);
  });

  it('replay() rejects a trace with an incompatible header', async () => {
    const harness = new AgentHarness();
    const trace = await recordSession(harness, 0xdead);
    const tampered: SessionTrace = {
      ...trace,
      header: { ...trace.header, hz: 120 },
    };
    await expect(harness.replay(tampered)).rejects.toThrow(/incompatible trace header/);
  });

  it('dual-run: same seed + same frames → identical hashes', async () => {
    const a = new AgentHarness();
    const b = new AgentHarness();
    const traceA = await recordSession(a, 0xbeef);
    const traceB = await recordSession(b, 0xbeef);

    const hashA = joinHashes(traceA.checkpoints);
    const hashB = joinHashes(traceB.checkpoints);

    reports.push({
      suite: 'replay-hash-dual-run',
      passed: hashA === hashB,
      hashExpected: hashA,
      hashActual: hashB,
      steps: SESSION_STEPS,
    });

    expect(hashB).toBe(hashA);
    expect(traceA.checkpoints.length).toBeGreaterThan(0);
  });

  it('cross-seed: different seed → different checkpoint hash sequence', async () => {
    const a = new AgentHarness();
    const b = new AgentHarness();
    const traceA = await recordSession(a, 1);
    const traceB = await recordSession(b, 999999);

    const hashA = joinHashes(traceA.checkpoints);
    const hashB = joinHashes(traceB.checkpoints);

    reports.push({
      suite: 'replay-hash-cross-seed',
      passed: hashA !== hashB,
      hashExpected: hashA,
      hashActual: hashB,
      steps: SESSION_STEPS,
    });

    // Seeded spawn variation must make the full sequence diverge.
    expect(hashB).not.toBe(hashA);
  });

  afterAll(() => {
    if (UPDATE_GOLDENS) {
      mkdirSync(dirname(BASELINE_PATH), { recursive: true });
      // Merge, don't overwrite: ground-golden.test.ts shares this file. Under
      // the forks pool, regenerate with --no-file-parallelism so the two
      // writers cannot race (read-modify-write is only serialized then).
      const current: Record<string, string> = existsSync(BASELINE_PATH)
        ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, string>)
        : {};
      writeFileSync(BASELINE_PATH, `${JSON.stringify({ ...current, ...newBaselines }, null, 2)}\n`, 'utf8');
    }
    const dir = process.env.GOLDEN_REPORT_DIR;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'replay-hash.json'), `${JSON.stringify(reports, null, 2)}\n`, 'utf8');
  });
});
