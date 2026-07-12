/**
 * Grind property test (M6) — arbitrary streams of VALID frames through the full
 * harness on the grind-lab level for 500 steps:
 *  - never throws;
 *  - phase is always a member of the (grind-inclusive) enum;
 *  - no NaN anywhere in the board state;
 *  - the grind balance meter is always finite;
 *  - grind.active is only ever reported NEAR a rail (no magnetism from afar);
 *  - every observed phase transition follows the legal-edge table.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { AgentHarness } from '../src/agent/AgentHarness';
import { CONTACT_FRAME_SCHEMA_VERSION } from '@slackpad/shared';
import { DT_MS } from './helpers/maneuver';
import { LEDGE, RAIL } from '../src/sim/levels/grind-lab';

const PHASES = ['none', 'ground', 'pop', 'air', 'catch', 'grind', 'bail'] as const;

const LEGAL_EDGES: Record<string, readonly string[]> = {
  none: ['ground'],
  ground: ['pop', 'none'],
  pop: ['air', 'ground', 'bail'],
  air: ['catch', 'ground', 'grind', 'bail'],
  catch: ['ground', 'bail'],
  grind: ['pop', 'air', 'ground', 'bail'],
  bail: ['none'],
};

/** Horizontal distance from (x,z) to a rail centre-line segment (x=cx, z∈[z0,z1]). */
function distToRail(x: number, z: number, cx: number, z0: number, z1: number): number {
  const cz = Math.max(z0, Math.min(z1, z));
  return Math.hypot(x - cx, z - cz);
}

const footArb = fc.oneof(
  fc.constant(null),
  fc.record({
    x: fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }),
    y: fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }),
  }),
);

const stepSpecArb = fc.record({
  nose: footArb,
  tail: footArb,
  primary: fc.boolean(),
  holdSteps: fc.integer({ min: 1, max: 20 }),
});

const streamArb = fc.array(stepSpecArb, { minLength: 1, maxLength: 40 });
const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });

describe('GrindSystem (property)', () => {
  it('random streams on grind-lab: no throw, legal phases, finite balance, grind only near rails', async () => {
    const harness = new AgentHarness();
    await harness.init();

    await fc.assert(
      fc.asyncProperty(seedArb, streamArb, async (seed, stream) => {
        await harness.reset(seed, 'grind-lab');

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
            if (!noseWasOn) noseId += 1;
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

          if (obs.grind) {
            expect(Number.isFinite(obs.grind.balance)).toBe(true);
            if (obs.grind.active) {
              // Active grind must be geometrically near a grind-lab rail — never
              // magnetised from afar. (Generous 1 m bound; the latch itself is rSnap-tight.)
              const dLedge = distToRail(obs.board.p.x, obs.board.p.z, LEDGE.cx, LEDGE.z0, LEDGE.z1);
              const dRail = distToRail(obs.board.p.x, obs.board.p.z, RAIL.cx, RAIL.z0, RAIL.z1);
              expect(Math.min(dLedge, dRail)).toBeLessThan(1.0);
            }
          }

          const last = phasesSeen[phasesSeen.length - 1]!;
          if (obs.phase !== last) phasesSeen.push(obs.phase);

          hold += 1;
          if (hold >= cur.holdSteps) {
            hold = 0;
            spec += 1;
          }
        }

        const board = harness.observe().board;
        for (const vec of [board.p, board.q, board.lv, board.av]) {
          for (const v of Object.values(vec)) expect(Number.isFinite(v)).toBe(true);
        }

        for (let i = 1; i < phasesSeen.length; i++) {
          const fromPh = phasesSeen[i - 1]!;
          const toPh = phasesSeen[i]!;
          expect(
            LEGAL_EDGES[fromPh],
            `illegal phase transition ${fromPh} → ${toPh} (sequence: ${phasesSeen.join('>')})`,
          ).toContain(toPh);
        }
      }),
      { numRuns: 12 },
    );
  });
});
