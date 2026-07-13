/// <reference types="node" />
/**
 * Air golden (M4). A fixed scripted session (~400 steps):
 *   settle → Ctrl-cruise → stable-contact LMB ollie → assisted catch/clean →
 *   Ctrl-cruise → stable-contact RMB nollie → assisted catch/clean → cruise.
 * Record/replay must agree AND the checkpoint sequence is pinned in
 * goldens/baselines.json (UPDATE_GOLDENS=1 regenerates; run with
 * --no-file-parallelism because three golden files share the baseline file).
 *
 * Because checkpoint hashes fold in the REAL maneuver phase string, this
 * golden pins the phase timeline (ground/pop/air/catch/bail) as well as the
 * trajectory — a recognition regression flips the hashes even if the physics
 * happens to match.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentHarness } from '../src/agent/AgentHarness';
import type { InjectableFrame } from '../src/agent/AgentHarness';
import type { Contact, ReplayCheckpoint, SessionTrace } from '@slackpad/shared';
import { DT_MS, NOSE_POS, TAIL_POS } from './helpers/maneuver';

const BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'goldens', 'baselines.json');
const UPDATE_GOLDENS = process.env.UPDATE_GOLDENS === '1';
const baselines: Record<string, string> = existsSync(BASELINE_PATH)
  ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, string>)
  : {};
const computed: Record<string, string> = {};

function checkBaseline(key: string, actual: string): void {
  computed[key] = actual;
  if (UPDATE_GOLDENS) return;
  const pinned = baselines[key];
  if (pinned === undefined) {
    throw new Error(`no pinned baseline for "${key}" — run UPDATE_GOLDENS=1 and commit goldens/baselines.json`);
  }
  expect(actual, `pinned golden baseline "${key}"`).toBe(pinned);
}

const SESSION_STEPS = 400;

function c(id: number, x: number, y: number): Contact {
  return { id, tip: true, x, y, confidence: true };
}

/**
 * The fixed script. Contact ids are hardware-faithful: each nose replant uses
 * a fresh id. Step landmarks (from the deterministic default-config physics):
 * Both clicks keep the stable two-contact stance used by the shipping control
 * model; L1 catches that held stance automatically on descent.
 */
function scriptFrame(step: number, frameId: number): InjectableFrame | null {
  if (step < 60) return null; // settle

  let contacts: Contact[];
  let primary = false;
  let secondary = false;

  if (step < 124) {
    contacts = [c(1, NOSE_POS.x, NOSE_POS.y), c(2, TAIL_POS.x, TAIL_POS.y)]; // Ctrl cruise
  } else if (step === 124) {
    contacts = [c(1, NOSE_POS.x, NOSE_POS.y), c(2, TAIL_POS.x, TAIL_POS.y)];
    primary = true;
  } else if (step === 250) {
    contacts = [c(1, NOSE_POS.x, NOSE_POS.y), c(2, TAIL_POS.x, TAIL_POS.y)];
    secondary = true;
  } else {
    contacts = [c(1, NOSE_POS.x, NOSE_POS.y), c(2, TAIL_POS.x, TAIL_POS.y)];
  }

  return {
    schemaVersion: 1,
    frameId,
    tPerfMs: step * DT_MS,
    contacts,
    buttons: { primary, secondary, auxiliary: true },
  };
}

async function recordSession(harness: AgentHarness, seed: number): Promise<SessionTrace> {
  await harness.reset(seed, 'flat-dev');
  harness.startRecording();
  let frameId = 0;
  for (let i = 0; i < SESSION_STEPS; i++) {
    const f = scriptFrame(i, frameId);
    if (f) {
      harness.injectContactFrame(f);
      frameId += 1;
    }
    harness.step(1);
  }
  return harness.stopRecording();
}

const joinHashes = (cps: ReplayCheckpoint[]): string => cps.map((cp) => `${cp.step}:${cp.hash}`).join('|');

describe('air golden (M4)', () => {
  it('Ctrl cruise→LMB ollie→RMB nollie both complete and replay identically', async () => {
    const harness = new AgentHarness();
    const trace = await recordSession(harness, 0xa14d);
    expect(trace.checkpoints.length).toBeGreaterThan(0);

    // Semantic guard: the script actually produced the intended session —
    // two stable-contact pops, two assisted catches, two completed clean
    // landings, and no bail.
    const events = harness.getTelemetry().snapshot().events;
    const byType = (t: string): Array<Record<string, unknown>> =>
      events.filter((e) => e.type === t) as Array<Record<string, unknown>>;
    expect(byType('popRecognized').length).toBe(2);
    expect(byType('popRecognized').map((e) => e.label)).toEqual(['ollie', 'nollie']);
    expect(byType('catch').length).toBe(2);
    expect(byType('bail').length).toBe(0);
    expect(byType('trickCompleted').map((e) => e.cleanliness)).toEqual(['clean', 'clean']);

    const replayed = await harness.replay(trace);
    expect(replayed).toEqual(trace.checkpoints);
    checkBaseline('air-session-repro', joinHashes(trace.checkpoints));
  });

  afterAll(() => {
    if (!UPDATE_GOLDENS) return;
    mkdirSync(dirname(BASELINE_PATH), { recursive: true });
    // Merge, don't overwrite: replay-hash + ground-golden share this file.
    const current: Record<string, string> = existsSync(BASELINE_PATH)
      ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, string>)
      : {};
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ ...current, ...computed }, null, 2)}\n`, 'utf8');
  });
});
