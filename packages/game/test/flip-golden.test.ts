/// <reference types="node" />
/**
 * Flip golden (M5). A fixed scripted session (~500 steps):
 *   settle → Ctrl-cruise → LMB ollie + forgiving KICKFLIP swipe + auto-catch →
 *   cruise → LMB ollie + HEELFLIP swipe + auto-catch → cruise →
 *   LMB ollie + BS-SHUV-180 sweep + auto-catch → cruise.
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
import {
  eventsOf,
  gesturePos,
  lastEventOf,
  NOSE_POS,
  PadDriver,
  scriptOllie,
  TAIL_POS,
} from './helpers/maneuver';
import type { GestureScript } from './helpers/maneuver';

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

/** Shipping gesture flight: both contacts remain down and L1 auto-catches. */
function flyHeldGesture(
  d: PadDriver,
  gesture: GestureScript,
  perFrame = 0.08,
  frames = 6,
): void {
  let airStart: number | null = null;
  let gi = 0;
  for (let i = 0; i < 240; i++) {
    const obs = d.harness.observe();
    if ((obs.phase === 'air' || obs.phase === 'catch') && airStart == null) airStart = obs.step;
    const done = lastEventOf(d.harness, 'trickCompleted') ?? lastEventOf(d.harness, 'bail');
    if (done && (obs.phase === 'ground' || obs.phase === 'bail')) break;
    if (airStart != null && obs.step >= airStart + 2 && gi < frames) gi += 1;
    d.drive({
      nose: NOSE_POS,
      tail: gi > 0 ? gesturePos(gesture, gi, perFrame, frames) : TAIL_POS,
    });
  }
}

/** Drive the full scripted session on `h` (assumes reset + startRecording done). */
function driveSession(h: AgentHarness): void {
  const d = new PadDriver(h);
  d.idle(60); // settle
  d.cruise(30);

  // 1) Kickflip: forgiving heelside swipe, stable stance auto-catches clean.
  scriptOllie(d);
  flyHeldGesture(d, 'flip-heel', 0.08);
  toGround(d);

  // 2) Heelflip: mirrored forgiving swipe, same held-stance auto-catch.
  scriptOllie(d);
  flyHeldGesture(d, 'flip-toe', 0.08);
  toGround(d);

  // 3) BS shuv 180: smooth yaw sweep, stable stance auto-catches.
  scriptOllie(d);
  flyHeldGesture(d, 'shuv-bs');
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
    expect(
      shuv!.cleanliness,
      `bs-shuv outcome=${JSON.stringify(shuv)}`,
    ).toBe('clean');
    expect(shuv!.shuvDegrees as number).toBeGreaterThan(120);
    // …and the mirrored heelflip also completes under the same forgiving
    // held-stance contract. None of the three scripted tricks silently bails.
    const heel = tricks.find((t) => t.label === 'heelflip');
    expect(heel, 'a clean heelflip completed').toBeDefined();
    expect(heel!.cleanliness).toBe('clean');
    expect(heel!.flipRotations as number).toBeLessThan(-0.8);
    expect(bails.length).toBe(0);

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
