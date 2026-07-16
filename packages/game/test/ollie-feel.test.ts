/**
 * Ollie feel (M4): a lift-and-retap pop uses the shipping binary pop quality.
 * The retap always maps to the same playable height/airtime band;
 * post-pop swipes, rather than a hidden lift-timing ladder, shape the trick.
 * Targets (brief): height ∈ ~[0.25, 0.8] m, airtime ∈ [0.4, 1.0] s.
 *
 * The measured table is printed so tuning changes are reviewable numbers, not
 * vibes. All runs are scripted ContactFrame injections (inject-only).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { eventsOf, flyOut, lastEventOf, NOSE_POS, scriptOllie, settled, TAIL_POS } from './helpers/maneuver';
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
  it('a tail pop raises the physical nose above the tail', async () => {
    const d = await settled(0xfee0);
    d.cruise(30);
    scriptOllie(d);

    let greatestNoseOverTail = -Infinity;
    const halfLength = DEFAULT_SIM_CONFIG.physics.boardLength / 2;
    for (let i = 0; i < 8; i++) {
      const { q } = d.harness.observe().board;
      // Local +Z is the physical nose. Its world-height difference from local
      // -Z is 2 * halfLength * the quaternion-rotated +Z vector's Y component.
      const noseOverTail = 2 * halfLength * (2 * (q.y * q.z - q.w * q.x));
      greatestNoseOverTail = Math.max(greatestNoseOverTail, noseOverTail);
      d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    }

    expect(greatestNoseOverTail).toBeGreaterThan(0.025);
  });

  it('tail lift-retap uses the fixed pop quality and lands in the playable pop band', async () => {
    const { row } = await measure('binary-retap', {}, null);
    const systemMass = DEFAULT_SIM_CONFIG.physics.boardMass + DEFAULT_SIM_CONFIG.physics.riderMass;
    expect(row.q).toBe(DEFAULT_SIM_CONFIG.pop.baseQuality);
    expect(row.jY / systemMass).toBeGreaterThan(2.8);
    expect(row.jY / systemMass).toBeLessThan(3.8);
    expect(row.height).toBeGreaterThanOrEqual(0.35);
    expect(row.height).toBeLessThanOrEqual(0.7);
    expect(row.airtimeSec).toBeGreaterThanOrEqual(0.4);
    expect(row.airtimeSec).toBeLessThanOrEqual(0.9);
    console.info('[ollie-feel]', JSON.stringify(row));
  });

  it('setup timing and prep motion cannot secretly change binary retap strength', async () => {
    const plain = await measure('plain', {}, null);
    const delayed = await measure('delayed', { gapSteps: 4 }, null);
    const moving = await measure('moving', { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 }, null);
    for (const run of [plain, delayed, moving]) {
      expect(run.row.q).toBe(DEFAULT_SIM_CONFIG.pop.baseQuality);
      expect(run.row.jY).toBeCloseTo(plain.row.jY, 9);
      // Physical suspension/contact and a moved heading can shift the measured
      // apex slightly even though the point impulse is identical.
      expect(Math.abs(run.row.height - plain.row.height)).toBeLessThan(0.055);
      // A short physical pop envelope can cross the airborne/contact boundary
      // on adjacent suspension phases while preserving the exact intent/impulse.
      expect(Math.abs(run.row.airtimeSec - plain.row.airtimeSec)).toBeLessThanOrEqual(0.05 + 1e-6);
    }
  });

  it('L1 auto-catches a held stable stance and completes the ordinary ollie cleanly', async () => {
    const d = await settled(0xfee2);
    d.cruise(90);
    scriptOllie(d);
    let maxPitchDeg = 0;
    for (let i = 0; i < 240; i++) {
      const obs = d.harness.observe();
      const pitch = Math.atan2(
        2 * (obs.board.q.w * obs.board.q.x + obs.board.q.y * obs.board.q.z),
        1 - 2 * (obs.board.q.x * obs.board.q.x + obs.board.q.y * obs.board.q.y),
      );
      maxPitchDeg = Math.max(maxPitchDeg, Math.abs(pitch * 180 / Math.PI));
      const done = lastEventOf(d.harness, 'trickCompleted') ?? lastEventOf(d.harness, 'bail');
      if (done && (obs.phase === 'ground' || obs.phase === 'bail')) break;
      d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    }
    const caught = lastEventOf(d.harness, 'catch');
    const trick = lastEventOf(d.harness, 'trickCompleted');
    expect(caught?.foot).toBe('both');
    expect(trick?.label).toBe('ollie');
    expect(trick?.cleanliness).toBe('clean');
    // The deck still performs a readable nose-up ollie rather than translating
    // vertically while remaining perfectly flat.
    expect(maxPitchDeg).toBeGreaterThan(8);
  });
});
