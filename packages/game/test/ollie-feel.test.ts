/**
 * Ollie feel (M4): pop quality q must map to a playable height/airtime band at
 * the DEFAULT config — q=0 → jMin pop, q=1 → jMax pop, monotonic in between.
 * Targets (brief): height ∈ ~[0.25, 0.8] m, airtime ∈ [0.4, 1.0] s.
 *
 * The measured table is printed so tuning changes are reviewable numbers, not
 * vibes. All runs are scripted ContactFrame injections (inject-only).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { eventsOf, flyOut, scriptOllie, settled } from './helpers/maneuver';
import type { FlightResult } from './helpers/maneuver';

interface FeelRow {
  name: string;
  q: number;
  jY: number;
  height: number;
  airtimeSec: number;
  outcome: string;
  thetaDeg: number | null;
}

async function measure(
  name: string,
  script: { prepMoveFrames?: number; prepSpeedPerFrame?: number; gapSteps?: number },
  catchAfterApexSteps: number | null,
): Promise<{ row: FeelRow; flight: FlightResult }> {
  const d = await settled(0xfee1);
  d.cruise(90);
  scriptOllie(d, script);
  const flight = flyOut(d, { catchAfterApexSteps });
  const pop = eventsOf(d.harness, 'popRecognized')[0];
  expect(pop, `${name}: pop must be recognized`).toBeDefined();
  const q = pop!.q as number;
  const cfg = DEFAULT_SIM_CONFIG.pop;
  const row: FeelRow = {
    name,
    q,
    jY: cfg.jMin + q * (cfg.jMax - cfg.jMin),
    height: flight.height,
    airtimeSec: flight.airtimeSec,
    outcome: flight.outcome,
    thetaDeg: flight.thetaDeg,
  };
  return { row, flight };
}

describe('ollie feel (M4 defaults)', () => {
  it('q=0 (no prep) → jMin pop inside the playable band', async () => {
    // Lift the nose LONG before the kick (outside the lookback window) → q=0.
    const { row } = await measure('q0-no-prep', { gapSteps: 10 }, null);
    expect(row.q).toBe(0);
    expect(row.height).toBeGreaterThanOrEqual(0.22);
    expect(row.height).toBeLessThanOrEqual(0.45);
    expect(row.airtimeSec).toBeGreaterThanOrEqual(0.4);
    console.info('[ollie-feel]', JSON.stringify(row));
  });

  it('q=1 (crisp centered prep) → jMax pop inside the playable band', async () => {
    const { row } = await measure(
      'q1-crisp',
      { prepMoveFrames: 4, prepSpeedPerFrame: 0.06, gapSteps: 0 },
      null,
    );
    expect(row.q).toBeGreaterThanOrEqual(0.95);
    expect(row.height).toBeGreaterThan(0.5);
    expect(row.height).toBeLessThanOrEqual(0.85);
    expect(row.airtimeSec).toBeGreaterThan(0.55);
    expect(row.airtimeSec).toBeLessThanOrEqual(1.0);
    console.info('[ollie-feel]', JSON.stringify(row));
  });

  it('q is monotonic: better prep → higher pop', async () => {
    const q0 = await measure('q0', { gapSteps: 10 }, null);
    const qMid = await measure('qMid', { gapSteps: 2 }, null);
    const q1 = await measure('q1', { prepMoveFrames: 4, prepSpeedPerFrame: 0.06, gapSteps: 0 }, null);
    expect(qMid.row.q).toBeGreaterThan(q0.row.q);
    expect(q1.row.q).toBeGreaterThan(qMid.row.q);
    expect(qMid.row.height).toBeGreaterThan(q0.row.height);
    expect(q1.row.height).toBeGreaterThan(qMid.row.height);
    console.info('[ollie-feel] table:');
    for (const r of [q0.row, qMid.row, q1.row]) console.info('  ', JSON.stringify(r));
  });

  it('catch matters at defaults: uncaught max-q ollie does NOT land clean, caught does', async () => {
    const uncaught = await measure('q1-no-catch', { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 }, null);
    const caught = await measure('q1-catch', { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 }, 1);
    console.info('[ollie-feel] uncaught:', JSON.stringify(uncaught.row));
    console.info('[ollie-feel] caught:', JSON.stringify(caught.row));
    // The uncaught outcome sits in the tail-strike regime (dirty at the pinned
    // defaults; small physics changes may flip it to bail) — the FEEL contract
    // is "a big uncaught pop never lands clean, a caught one does".
    expect(uncaught.flight.outcome === 'dirty' || uncaught.flight.outcome === 'bail').toBe(true);
    expect(caught.flight.outcome).toBe('clean');
  });
});
