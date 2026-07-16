/**
 * Sprint 02 S5 gate — the corpus loop closes: a session recorded through the
 * SAME record path the R hotkey uses (startRecording → play → stopRecording →
 * serialize), written under the corpus naming convention, loads through the
 * corpus helper and replays deterministically (checkpoints bit-identical).
 *
 * Any real recorded traces present in testdata/traces are replayed too — a
 * human trace that stops reproducing is stale evidence and must fail loudly.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pairAt } from './feel/scenarios';
import { PadDriver, scriptOllie, settled } from './helpers/maneuver';
import {
  corpusTraceFiles,
  loadSessionTrace,
  replaySessionTrace,
} from './helpers/traceCorpus';

describe('trace corpus (S5)', () => {
  it('a session recorded via the hotkey path replays deterministically through the loader', async () => {
    // Record: reset → startRecording at step 0 → play a representative
    // session (settle, cruise, ratchet turn, ollie) → stopRecording.
    const d = await settled(0xc0a95);
    await d.harness.reset(0xc0a95, 'flat-dev');
    d.harness.startRecording();
    const driver = new PadDriver(d.harness);
    driver.idle(60);
    for (let i = 0; i < 30; i++) driver.drive({ ...pairAt(0), auxiliary: true });
    for (let k = 1; k <= 14; k++) {
      const a = ((200 / 60) * k * Math.PI) / 180;
      driver.drive({ ...pairAt(Math.min(a, Math.PI / 4)), auxiliary: true });
    }
    for (let i = 0; i < 30; i++) driver.drive({ ...pairAt(Math.PI / 4), auxiliary: true });
    scriptOllie(driver, { prepMoveFrames: 3 });
    driver.idle(90);
    const trace = d.harness.stopRecording();
    expect(trace.frames.length).toBeGreaterThan(50);
    expect(trace.checkpoints.length).toBeGreaterThan(2);

    // Persist with the corpus naming convention, then close the loop.
    const dir = mkdtempSync(join(tmpdir(), 'slackpad-corpus-'));
    const file = join(dir, '20260716-test-session.trace.json');
    writeFileSync(file, JSON.stringify(trace, null, 2));

    const loaded = loadSessionTrace(file);
    const result = await replaySessionTrace(loaded);
    expect(result.replayed.length).toBe(result.recorded.length);
    expect(result.identical).toBe(true);
  });

  it('replays every recorded corpus trace bit-identically (corpus may be empty)', async () => {
    for (const file of corpusTraceFiles()) {
      const trace = loadSessionTrace(file);
      const result = await replaySessionTrace(trace);
      expect(result.identical, `${file} must replay to its recorded checkpoints`).toBe(true);
    }
  });
});
