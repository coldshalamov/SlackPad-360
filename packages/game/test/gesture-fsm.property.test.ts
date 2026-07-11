/**
 * GestureFSM property test (M4) — arbitrary streams of VALID frames (random
 * plants/lifts/replants/kicks) through the full harness for 500 steps:
 *  - never throws;
 *  - phase is always a member of the enum;
 *  - no NaN anywhere in the board state;
 *  - every observed phase transition follows the legal-edge table.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { AgentHarness } from '../src/agent/AgentHarness';
import { CONTACT_FRAME_SCHEMA_VERSION } from '@slackpad/shared';
import { DT_MS } from './helpers/maneuver';

const PHASES = ['none', 'ground', 'pop', 'air', 'catch', 'bail'] as const;

/** The legal transition table (mirrors the GestureFSM doc comment). */
const LEGAL_EDGES: Record<string, readonly string[]> = {
  none: ['ground'],
  ground: ['pop', 'none'],
  pop: ['air', 'ground', 'bail'],
  air: ['catch', 'ground', 'bail'],
  catch: ['ground', 'bail'],
  bail: ['none'],
};

const footArb = fc.oneof(
  fc.constant(null),
  fc.record({
    x: fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }),
    y: fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }),
  }),
);

/** Per-slot input: which feet are down, where, and whether primary is held. */
const stepSpecArb = fc.record({
  nose: footArb,
  tail: footArb,
  primary: fc.boolean(),
  /** How many steps this input state holds (temporal coherence). */
  holdSteps: fc.integer({ min: 1, max: 20 }),
});

const streamArb = fc.array(stepSpecArb, { minLength: 1, maxLength: 40 });
const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });

describe('GestureFSM (property)', () => {
  it('random valid plant/lift/kick streams: no throw, legal phases, no NaN', async () => {
    const harness = new AgentHarness();
    await harness.init();

    await fc.assert(
      fc.asyncProperty(seedArb, streamArb, async (seed, stream) => {
        await harness.reset(seed, 'flat-dev');

        let frameId = 0;
        let noseId = 100;
        let tailId = 200;
        let noseWasOn = false;
        let tailWasOn = false;
        let spec = 0;
        let hold = 0;

        const phasesSeen: string[] = [harness.observe().phase];

        for (let step = 0; step < 500; step++) {
          const cur = stream[spec % stream.length]!;
          const contacts: Array<{ id: number; tip: boolean; x: number; y: number; confidence: boolean }> = [];
          if (cur.nose) {
            if (!noseWasOn) noseId += 1; // fresh contact id per replant
            contacts.push({ id: noseId, tip: true, x: cur.nose.x, y: cur.nose.y, confidence: true });
          }
          if (cur.tail) {
            if (!tailWasOn) tailId += 1;
            contacts.push({ id: tailId, tip: true, x: cur.tail.x, y: cur.tail.y, confidence: true });
          }
          noseWasOn = cur.nose != null;
          tailWasOn = cur.tail != null;

          harness.injectContactFrame({
            schemaVersion: CONTACT_FRAME_SCHEMA_VERSION,
            frameId: frameId++,
            tPerfMs: step * DT_MS,
            contacts,
            buttons: { primary: cur.primary && step % 2 === 0, secondary: false, auxiliary: false },
          });
          harness.step(1);

          const obs = harness.observe();
          expect(PHASES).toContain(obs.phase);
          const last = phasesSeen[phasesSeen.length - 1]!;
          if (obs.phase !== last) phasesSeen.push(obs.phase);

          hold += 1;
          if (hold >= cur.holdSteps) {
            hold = 0;
            spec += 1;
          }
        }

        // No NaN in the final board state.
        const board = harness.observe().board;
        for (const vec of [board.p, board.q, board.lv, board.av]) {
          for (const v of Object.values(vec)) expect(Number.isFinite(v)).toBe(true);
        }

        // Every transition observed obeys the legal-edge table.
        for (let i = 1; i < phasesSeen.length; i++) {
          const from = phasesSeen[i - 1]!;
          const to = phasesSeen[i]!;
          expect(
            LEGAL_EDGES[from],
            `illegal phase transition ${from} → ${to} (sequence: ${phasesSeen.join('>')})`,
          ).toContain(to);
        }
      }),
      { numRuns: 12 },
    );
  });
});
