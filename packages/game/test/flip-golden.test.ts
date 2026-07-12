/// <reference types="node" />
/**
 * Flip golden (M5). A fixed scripted session (~500 steps):
 *   settle → cruise → ollie+KICKFLIP+catch (clean) → cruise →
 *   ollie+HEELFLIP, missed catch (fails readably) → cruise →
 *   ollie+BS-SHUV-180+catch (clean) → cruise.
 * Record/replay must agree AND the checkpoint sequence is pinned in
 * goldens/baselines.json (UPDATE_GOLDENS=1 regenerates; run with
 * --no-file-parallelism because the golden files share the baseline file).
 *
 * The checkpoint hash folds in the REAL maneuver phase string, so this golden
 * pins the phase timeline (ground/pop/air/catch/bail) as well as the trajectory.
 * Semantic guards additionally pin WHAT happened: three pops, a kickflip then a
 * heelflip then a bs-shuv recognized, with correctly SIGNED rotations.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentHarness } from '../src/agent/AgentHarness';
import type { ReplayCheckpoint, SessionTrace } from '@slackpad/shared';
import { PadDriver, scriptOllie, flyWithGesture, eventsOf, NOSE_POS, TAIL_POS } from './helpers/maneuver';

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

const SEED = 0x5f11;

/** Cruise until the board is riding on the ground again (covers bail→respawn). */
function toGround(d: PadDriver, max = 220): void {
  for (let i = 0; i < max && d.harness.observe().phase !== 'ground'; i++) {
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
  }
  d.cruise(20); // stabilize + refresh the rest pose before the next pop
}

/** Drive the full scripted session on `h` (assumes reset + startRecording done). */
function driveSession(h: AgentHarness): void {
  const d = new PadDriver(h);
  d.idle(60); // settle
  d.cruise(30);

  // 1) Kickflip: heelside flick, caught → clean.
  scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
  flyWithGesture(d, { gesture: 'flip-heel', perFrame: 0.13, catchAfterApexSteps: 6, frames: 6, startAfterAir: 2 });
  toGround(d);

  // 2) Heelflip: toeside flick, NO catch → readable fail (missed catch); wait
  //    out the bail→respawn so the board is riding again for the next pop.
  scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
  flyWithGesture(d, { gesture: 'flip-toe', perFrame: 0.13, catchAfterApexSteps: null, frames: 6, startAfterAir: 2 });
  toGround(d);

  // 3) BS shuv 180: yaw sweep, caught → clean.
  scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
  flyWithGesture(d, { gesture: 'shuv-bs', catchAfterApexSteps: 8, frames: 6, startAfterAir: 2 });
  toGround(d);
}

async function recordSession(h: AgentHarness): Promise<SessionTrace> {
  await h.reset(SEED, 'flat-dev');
  h.startRecording();
  driveSession(h);
  return h.stopRecording();
}

const joinHashes = (cps: ReplayCheckpoint[]): string => cps.map((cp) => `${cp.step}:${cp.hash}`).join('|');

describe('flip golden (M5)', () => {
  it('cruise→kickflip→heelflip→bs-shuv replays identically and matches the pin', async () => {
    const harness = new AgentHarness();
    const trace = await recordSession(harness);
    expect(trace.checkpoints.length).toBeGreaterThan(0);

    // --- Semantic guards: the session actually produced the intended tricks ---
    const flips = eventsOf(harness, 'flipRecognized');
    const shuvs = eventsOf(harness, 'shuvRecognized');
    const tricks = eventsOf(harness, 'trickCompleted');
    const bails = eventsOf(harness, 'bail');

    expect(eventsOf(harness, 'popRecognized').length).toBe(3);
    // A kickflip then a heelflip were recognized (in that order), plus a bs-shuv.
    expect(flips.map((e) => e.label)).toEqual(['kickflip', 'heelflip']);
    expect(shuvs.map((e) => e.label)).toEqual(['bs-shuv']);
    // Signs: kickflip +, heelflip −, bs-shuv +yaw.
    expect(Math.sign(flips[0]!.omegaTarget as number)).toBe(1);
    expect(Math.sign(flips[1]!.omegaTarget as number)).toBe(-1);
    expect(Math.sign(shuvs[0]!.omegaTarget as number)).toBe(1);

    // The kickflip landed CLEAN with a positive full-ish roll…
    const kick = tricks.find((t) => t.label === 'kickflip');
    expect(kick, 'a clean kickflip completed').toBeDefined();
    expect(kick!.cleanliness).toBe('clean');
    expect(kick!.flipRotations as number).toBeGreaterThan(0.8);
    // …the bs-shuv landed CLEAN near the 180 target with positive yaw…
    const shuv = tricks.find((t) => t.label === 'bs-shuv');
    expect(shuv, 'a clean bs-shuv completed').toBeDefined();
    expect(shuv!.cleanliness).toBe('clean');
    expect(shuv!.shuvDegrees as number).toBeGreaterThan(120);
    // …and the uncaught heelflip did NOT land clean (bailed or dirty — readable).
    const heelClean = tricks.find((t) => t.label === 'heelflip' && t.cleanliness === 'clean');
    expect(heelClean, 'the missed-catch heelflip must not land clean').toBeUndefined();
    const heelFailed =
      bails.length > 0 || tricks.some((t) => t.label === 'heelflip' && t.cleanliness === 'dirty');
    expect(heelFailed, 'the heelflip attempt resolved to a readable fail').toBe(true);

    // --- Determinism: record → replay reproduces the pinned checkpoints -------
    const replayed = await harness.replay(trace);
    expect(replayed).toEqual(trace.checkpoints);
    checkBaseline('flip-session-repro', joinHashes(trace.checkpoints));
  });

  afterAll(() => {
    if (!UPDATE_GOLDENS) return;
    mkdirSync(dirname(BASELINE_PATH), { recursive: true });
    // Merge, don't overwrite: the other golden files share this baseline file.
    const current: Record<string, string> = existsSync(BASELINE_PATH)
      ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, string>)
      : {};
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ ...current, ...computed }, null, 2)}\n`, 'utf8');
  });
});
