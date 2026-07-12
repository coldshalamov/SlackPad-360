/// <reference types="node" />
/**
 * Ground-locomotion golden (M3). A fixed scripted push + steer session (~300
 * steps) is recorded, then replayed; replay must reproduce identical checkpoint
 * hashes, and the sequence is pinned in goldens/baselines.json via the same
 * checkBaseline / UPDATE_GOLDENS=1 mechanism as replay-hash.golden.
 *
 * Because two golden files share baselines.json under the forks pool, the
 * UPDATE writer MERGES (read-modify-write) rather than overwriting. Regenerate
 * with `UPDATE_GOLDENS=1 npx vitest run --no-file-parallelism` so the two files
 * do not race on the file.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentHarness } from '../src/agent/AgentHarness';
import type { InjectableFrame } from '../src/agent/AgentHarness';
import type { ReplayCheckpoint, SessionTrace } from '@slackpad/shared';
import { DEFAULT_INPUT_PROFILE, DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { rotateAboutCenter } from '../src/input/FootTracker';

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

const DT_MS = 1000 / DEFAULT_SIM_CONFIG.physics.hz;
const SESSION_STEPS = 300;

/** Deterministic scripted session: settle, cruise, push, then carve. */
function scriptFrame(step: number, frameId: number): InjectableFrame | null {
  // No input during the initial settle so the board lands first.
  if (step < 40) return null;

  const primary = step === 120 || step === 150 || step === 180; // three push kicks
  let contacts = [
    { id: 1, x: 0.4, y: 0.5, tip: true, confidence: true },
    { id: 2, x: 0.6, y: 0.5, tip: true, confidence: true },
  ];
  // Carve: rotate the segment during the back third of the session.
  if (step >= 200) {
    const deg = (step - 200) * 1.5;
    contacts = contacts.map((c) => {
      const r = rotateAboutCenter(c.x, c.y, deg);
      return { ...c, x: r.x, y: r.y };
    });
  }
  return {
    schemaVersion: 1,
    frameId,
    tPerfMs: step * DT_MS,
    contacts,
    buttons: { primary, secondary: false, auxiliary: false },
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

const joinHashes = (cps: ReplayCheckpoint[]): string => cps.map((c) => `${c.step}:${c.hash}`).join('|');

// This golden's scripted session uses plant-mask push semantics (both-planted
// clicks are pushes). The ship default is now 'buttonSide' (IMPL-007), so the
// legacy mode is pinned explicitly — the committed baseline stays byte-valid.
const PLANT_MASK_PROFILE = () => ({ ...DEFAULT_INPUT_PROFILE, kickAttribution: 'plantMask' as const });

describe('ground-locomotion golden (M3)', () => {
  it('replay of a scripted push+steer session reproduces pinned checkpoints', async () => {
    const harness = new AgentHarness(DEFAULT_SIM_CONFIG, PLANT_MASK_PROFILE);
    const trace = await recordSession(harness, 0x6704d);
    expect(trace.checkpoints.length).toBeGreaterThan(0);

    const replayed = await harness.replay(trace);
    expect(replayed).toEqual(trace.checkpoints);
    checkBaseline('ground-session-repro', joinHashes(trace.checkpoints));
  });

  it('the scripted session actually moves the board (not a constant-pose hash)', async () => {
    const harness = new AgentHarness(DEFAULT_SIM_CONFIG, PLANT_MASK_PROFILE);
    await harness.reset(0x6704d, 'flat-dev');
    for (let i = 0; i < SESSION_STEPS; i++) {
      const f = scriptFrame(i, i);
      if (f) harness.injectContactFrame(f);
      harness.step(1);
    }
    const obs = harness.observe();
    // Cruise + push should have carried the board well down the +Z line.
    expect(Math.hypot(obs.board.p.x, obs.board.p.z)).toBeGreaterThan(2);
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
