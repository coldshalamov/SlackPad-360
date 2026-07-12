/// <reference types="node" />
/**
 * Grind golden (M6). A fixed scripted 50-50 session on grind-lab:
 *   settle → cruise up to speed → plain ollie over the ledge front → soft-snap
 *   latch → clean 50-50 ride → speed-end dismount.
 * Record/replay must agree AND the checkpoint sequence is pinned in
 * goldens/grind-baselines.json (a SEPARATE file from the shared M4/M5 baselines,
 * so this new golden never collides with those). Because checkpoint hashes fold
 * in the REAL maneuver phase string, this pins the grind phase timeline as well
 * as the trajectory — a grind regression flips the hashes even if the physics
 * happens to match.
 *
 * Regenerate: UPDATE_GOLDENS=1 npx vitest run grind-golden
 */
import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentHarness } from '../src/agent/AgentHarness';
import type { InjectableFrame } from '../src/agent/AgentHarness';
import type { Contact, ReplayCheckpoint, SessionTrace } from '@slackpad/shared';
import { DT_MS, NOSE_POS, TAIL_POS, eventsOf } from './helpers/maneuver';

const BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'goldens', 'grind-baselines.json');
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
    throw new Error(`no pinned baseline for "${key}" — run UPDATE_GOLDENS=1 and commit goldens/grind-baselines.json`);
  }
  expect(actual, `pinned golden baseline "${key}"`).toBe(pinned);
}

const SEED = 12345;
const SESSION_STEPS = 300;
const POP_STEP = 166;

function c(id: number, x: number, y: number): Contact {
  return { id, tip: true, x, y, confidence: true };
}

/** Fixed 50-50 script (deterministic default-config physics; latch ≈ step 202
 * over the ledge, clean 82-step ride, speed-end dismount). */
function scriptFifty(step: number, frameId: number): InjectableFrame | null {
  if (step < 60) return null; // settle drop

  let contacts: Contact[];
  let primary = false;
  if (step < POP_STEP) {
    contacts = [c(1, NOSE_POS.x, NOSE_POS.y), c(2, TAIL_POS.x, TAIL_POS.y)]; // cruise up to speed
  } else if (step === POP_STEP) {
    contacts = [c(2, TAIL_POS.x, TAIL_POS.y)]; // tail-only + kick → plain straight ollie
    primary = true;
  } else {
    contacts = [c(3, NOSE_POS.x, NOSE_POS.y), c(2, TAIL_POS.x, TAIL_POS.y)]; // re-plant + ride
  }
  return { schemaVersion: 1, frameId, tPerfMs: step * DT_MS, contacts, buttons: { primary, secondary: false, auxiliary: false } };
}

/** Fixed BOARDSLIDE script: a gentle nose-prep SLIDE (steer ~50° off the rail)
 * before the pop; approach-align completes the turn onto the sliding ledge. */
function scriptBoardslide(step: number, frameId: number): InjectableFrame | null {
  if (step < 60) return null; // settle drop

  let contacts: Contact[];
  let primary = false;
  if (step < POP_STEP - 5) {
    contacts = [c(1, NOSE_POS.x, NOSE_POS.y), c(2, TAIL_POS.x, TAIL_POS.y)]; // cruise
  } else if (step < POP_STEP) {
    const i = step - (POP_STEP - 6); // 1..5 gentle nose-prep slide (steering yaw)
    contacts = [c(1, NOSE_POS.x, NOSE_POS.y - 0.12 * i), c(2, TAIL_POS.x, TAIL_POS.y)];
  } else if (step === POP_STEP) {
    contacts = [c(2, TAIL_POS.x, TAIL_POS.y)];
    primary = true;
  } else {
    contacts = [c(3, NOSE_POS.x, NOSE_POS.y), c(2, TAIL_POS.x, TAIL_POS.y)]; // re-plant + ride
  }
  return { schemaVersion: 1, frameId, tPerfMs: step * DT_MS, contacts, buttons: { primary, secondary: false, auxiliary: false } };
}

async function recordSession(
  harness: AgentHarness,
  script: (step: number, frameId: number) => InjectableFrame | null,
): Promise<SessionTrace> {
  await harness.reset(SEED, 'grind-lab');
  harness.startRecording();
  let frameId = 0;
  for (let i = 0; i < SESSION_STEPS; i++) {
    const f = script(i, frameId);
    if (f) {
      harness.injectContactFrame(f);
      frameId += 1;
    }
    harness.step(1);
  }
  return harness.stopRecording();
}

/** Run a script fresh (no recording) and return the harness for telemetry checks. */
async function runSession(
  harness: AgentHarness,
  script: (step: number, frameId: number) => InjectableFrame | null,
): Promise<Set<string>> {
  await harness.reset(SEED, 'grind-lab');
  let frameId = 0;
  const families = new Set<string>();
  for (let i = 0; i < SESSION_STEPS; i++) {
    const f = script(i, frameId);
    if (f) {
      harness.injectContactFrame(f);
      frameId += 1;
    }
    harness.step(1);
    const o = harness.observe();
    if (o.phase === 'grind' && o.grind) families.add(o.grind.family);
  }
  return families;
}

const joinHashes = (cps: ReplayCheckpoint[]): string => cps.map((cp) => `${cp.step}:${cp.hash}`).join('|');

describe('grind golden (M6)', () => {
  it('records a 50-50 session whose replay is checkpoint-identical + pinned', async () => {
    const harness = new AgentHarness();
    await harness.init();
    const trace = await recordSession(harness, scriptFifty);
    const replayed = await harness.replay(trace);
    expect(replayed).toEqual(trace.checkpoints);
    checkBaseline('grind-fifty-repro', joinHashes(trace.checkpoints));
  });

  it('records a BOARDSLIDE session whose replay is checkpoint-identical + pinned', async () => {
    const harness = new AgentHarness();
    await harness.init();
    const trace = await recordSession(harness, scriptBoardslide);
    const replayed = await harness.replay(trace);
    expect(replayed).toEqual(trace.checkpoints);
    checkBaseline('grind-boardslide-repro', joinHashes(trace.checkpoints));
  });

  it('the 50-50 session actually latches + completes a clean fifty-fifty (semantic guard)', async () => {
    const harness = new AgentHarness();
    await harness.init();
    const families = await runSession(harness, scriptFifty);
    expect(families.has('fifty-fifty')).toBe(true);
    const latched = eventsOf(harness, 'grindLatched');
    expect(latched.length).toBeGreaterThanOrEqual(1);
    expect(latched[0]!.family).toBe('fifty-fifty');
    expect(eventsOf(harness, 'grindCompleted').length).toBeGreaterThanOrEqual(1);
    // Candidate strictly precedes the latch (visible-snap mandate).
    const cand = eventsOf(harness, 'grindCandidate');
    expect(cand.length).toBeGreaterThanOrEqual(1);
    expect(cand[0]!.step as number).toBeLessThan(latched[0]!.step as number);
  });

  it('the boardslide session actually latches + rides a boardslide (semantic guard)', async () => {
    const harness = new AgentHarness();
    await harness.init();
    const families = await runSession(harness, scriptBoardslide);
    expect(families.has('boardslide')).toBe(true);
    const latched = eventsOf(harness, 'grindLatched');
    expect(latched.some((e) => e.family === 'boardslide')).toBe(true);
    expect(eventsOf(harness, 'grindCompleted').length).toBeGreaterThanOrEqual(1);
  });

  afterAll(() => {
    if (!UPDATE_GOLDENS) return;
    mkdirSync(dirname(BASELINE_PATH), { recursive: true });
    const current: Record<string, string> = existsSync(BASELINE_PATH)
      ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, string>)
      : {};
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ ...current, ...computed }, null, 2)}\n`, 'utf8');
  });
});
