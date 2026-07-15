/**
 * GT-noisy (property) — arbitrary streams of VALID ContactFrames injected, then
 * 300 steps. Invariants: never throws, board pose stays finite, the step
 * counter advances exactly, and observe() is always well-formed.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { AgentHarness } from '../src/agent/AgentHarness';
import { CONTACT_FRAME_SCHEMA_VERSION } from '@slackpad/shared';

const OBSERVE_KEYS = [
  'step',
  'seed',
  'board',
  'phase',
  'label',
  'intent',
  'assistLevel',
  'feet',
  'grind',
  'score',
  'lastFailReason',
  'inputSource',
].sort();

const contactArb = fc.record({
  id: fc.integer({ min: 0, max: 9 }),
  tip: fc.boolean(),
  x: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  y: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  confidence: fc.boolean(),
});

const frameSpecArb = fc.record({
  contacts: fc.array(contactArb, { maxLength: 2 }), // 0–2 contacts
  primary: fc.boolean(),
  secondary: fc.boolean(),
  auxiliary: fc.boolean(),
  dt: fc.integer({ min: 0, max: 40 }), // ms gap → monotonic non-decreasing tPerfMs
  /** Sim step (0–299) at which this frame is injected — interleaves input with stepping. */
  atStep: fc.integer({ min: 0, max: 299 }),
});

const streamArb = fc.array(frameSpecArb, { maxLength: 40 });
const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });

describe('GT-noisy (property)', () => {
  it('valid noisy streams never break the sim over 300 steps', async () => {
    const harness = new AgentHarness();
    await harness.init();

    await fc.assert(
      fc.asyncProperty(seedArb, streamArb, async (seed, stream) => {
        await harness.reset(seed, 'flat-dev');
        const hub = harness.getInputHub();

        // Bucket frames by injection step so input interleaves with stepping —
        // a single pre-step batch would never exercise mid-run intake.
        let t = 0;
        const bySteps = new Map<number, Array<() => void>>();
        stream.forEach((spec, i) => {
          t += spec.dt;
          const tPerf = t;
          const push = (): void => {
            const accepted = hub.push({
              schemaVersion: CONTACT_FRAME_SCHEMA_VERSION,
              frameId: i,
              tPerfMs: tPerf,
              source: 'synthetic',
              contacts: spec.contacts,
              buttons: {
                primary: spec.primary,
                secondary: spec.secondary,
                auxiliary: spec.auxiliary,
              },
            });
            expect(accepted).toBe(true); // generated frames are valid by construction
          };
          const bucket = bySteps.get(spec.atStep);
          if (bucket) bucket.push(push);
          else bySteps.set(spec.atStep, [push]);
        });

        for (let s = 0; s < 300; s++) {
          const due = bySteps.get(s);
          if (due) for (const push of due) push();
          harness.step(1);
        }

        const obs = harness.observe();
        expect(obs.step).toBe(300);
        expect(Object.keys(obs).sort()).toEqual(OBSERVE_KEYS);

        for (const vec of [obs.board.p, obs.board.q, obs.board.lv, obs.board.av]) {
          for (const component of Object.values(vec)) {
            expect(Number.isFinite(component)).toBe(true);
          }
        }
      }),
      { numRuns: 25 },
    );
  });
});
