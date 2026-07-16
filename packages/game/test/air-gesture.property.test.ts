/**
 * Air-gesture property test (M5):
 *  - the classifier never throws on arbitrary finite pad-velocity streams, and
 *    its open gesture is always well-formed: at most ONE open label, finite
 *    omegaTarget bounded by the config max, intensity/confidence in [0,1],
 *    replacements never decreasing and (by the peak-monotonic confidence)
 *    bounded small;
 *  - through the full harness, arbitrary air streams keep the board state finite
 *    and NEVER open a flip/shuv label outside the air window (phase-exclusive).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_SIM_CONFIG, CONTACT_FRAME_SCHEMA_VERSION } from '@slackpad/shared';
import { AirGestureClassifier } from '../src/control/AirGestureClassifier';
import { AgentHarness } from '../src/agent/AgentHarness';
import { DT_MS } from './helpers/maneuver';

const MAX_OMEGA = Math.max(
  DEFAULT_SIM_CONFIG.flip.omegaFlipMax,
  DEFAULT_SIM_CONFIG.flip.shuvOmegaMax,
);

const velArb = fc.record({
  x: fc.double({ min: -12, max: 12, noNaN: true, noDefaultInfinity: true }),
  y: fc.double({ min: -12, max: 12, noNaN: true, noDefaultInfinity: true }),
});
const streamArb = fc.array(velArb, { minLength: 1, maxLength: 60 });

describe('AirGestureClassifier (property)', () => {
  it('arbitrary velocity streams: no throw, single well-formed open label', () => {
    fc.assert(
      fc.property(fc.constantFrom('regular', 'goofy'), streamArb, (stance, vels) => {
        const c = new AirGestureClassifier(DEFAULT_SIM_CONFIG, stance as 'regular' | 'goofy');
        const dt = 1 / DEFAULT_SIM_CONFIG.physics.hz;
        let prevReplacements = 0;
        for (let i = 0; i < vels.length; i++) {
          const g = c.update({
            step: i + 1,
            dt,
            nose: { planted: false, vel: { x: 0, y: 0 } },
            tail: { planted: true, vel: vels[i]! },
          });
          // Replacements never decrease and stay small (hysteresis + margin).
          expect(c.replacements).toBeGreaterThanOrEqual(prevReplacements);
          prevReplacements = c.replacements;
          expect(c.replacements).toBeLessThanOrEqual(3);
          if (g) {
            expect(['flip', 'shuv']).toContain(g.kind);
            expect(Number.isFinite(g.omegaTarget)).toBe(true);
            expect(Math.abs(g.omegaTarget)).toBeLessThanOrEqual(MAX_OMEGA + 1e-9);
            expect(g.intensity).toBeGreaterThanOrEqual(0);
            expect(g.intensity).toBeLessThanOrEqual(1);
            expect(g.confidence).toBeGreaterThanOrEqual(DEFAULT_SIM_CONFIG.recognition.cEnter - 1e-9);
            expect(g.confidence).toBeLessThanOrEqual(1);
            // The single open snapshot equals the returned gesture (one label).
            expect(c.open!.label).toBe(g.label);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

const footArb = fc.oneof(
  fc.constant(null),
  fc.record({
    x: fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }),
    y: fc.double({ min: 0.05, max: 0.95, noNaN: true, noDefaultInfinity: true }),
  }),
);
const stepArb = fc.record({ nose: footArb, tail: footArb, primary: fc.boolean(), hold: fc.integer({ min: 1, max: 8 }) });
const harnessStreamArb = fc.array(stepArb, { minLength: 1, maxLength: 30 });

describe('air-gesture harness property', () => {
  it('arbitrary air streams: finite board, flip/shuv labels open ONLY in the air phase', async () => {
    const h = new AgentHarness();
    await h.init();
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 2 ** 31 - 1 }), harnessStreamArb, async (seed, stream) => {
        await h.reset(seed, 'flat-dev');
        // Pop first so an air window can exist, then feed the arbitrary stream.
        const airSteps = new Set<number>();
        let frameId = 0;
        let noseId = 500;
        let tailId = 600;
        let noseOn = false;
        let tailOn = false;

        const inject = (contacts: Array<{ id: number; tip: boolean; x: number; y: number; confidence: boolean }>, primary: boolean, step: number): void => {
          h.injectContactFrame({
            schemaVersion: CONTACT_FRAME_SCHEMA_VERSION,
            frameId: frameId++,
            tPerfMs: step * DT_MS,
            contacts,
            buttons: { primary, secondary: false, auxiliary: false },
          });
          h.step(1);
        };

        // Settle + cruise + a scripted ollie so we reach the air window.
        for (let s = 0; s < 60; s++) h.step(1);
        for (let s = 0; s < 30; s++) inject([{ id: 1, tip: true, x: 0.4, y: 0.5, confidence: true }, { id: 2, tip: true, x: 0.6, y: 0.5, confidence: true }], false, h.getStep());
        inject([{ id: 2, tip: true, x: 0.6, y: 0.5, confidence: true }], true, h.getStep());

        let spec = 0;
        let held = 0;
        for (let s = 0; s < 200; s++) {
          const cur = stream[spec % stream.length]!;
          const contacts: Array<{ id: number; tip: boolean; x: number; y: number; confidence: boolean }> = [];
          if (cur.nose) {
            if (!noseOn) noseId += 1;
            contacts.push({ id: noseId, tip: true, x: cur.nose.x, y: cur.nose.y, confidence: true });
          }
          if (cur.tail) {
            if (!tailOn) tailId += 1;
            contacts.push({ id: tailId, tip: true, x: cur.tail.x, y: cur.tail.y, confidence: true });
          }
          noseOn = cur.nose != null;
          tailOn = cur.tail != null;
          const processedStep = h.getStep();
          inject(contacts, cur.primary && s % 2 === 0, processedStep);
          // Gesture telemetry is stamped with the step being processed, while
          // observe().step is the world step after integration. Record the
          // former so recognition on the exact pop→air transition is covered.
          if (h.observe().phase === 'air') airSteps.add(processedStep);
          if (++held >= cur.hold) {
            held = 0;
            spec += 1;
          }
        }

        // Board state finite.
        const b = h.observe().board;
        for (const vec of [b.p, b.q, b.lv, b.av]) for (const v of Object.values(vec)) expect(Number.isFinite(v)).toBe(true);

        // Every flip/shuv recognition happened on a step observed in the air phase.
        const recs = [...eventsByType(h, 'flipRecognized'), ...eventsByType(h, 'shuvRecognized')];
        for (const e of recs) {
          expect(airSteps.has(e.step as number), `air-gesture opened at step ${e.step} outside the air phase`).toBe(true);
        }
      }),
      { numRuns: 12 },
    );
  });
});

function eventsByType(h: AgentHarness, type: string): Array<Record<string, unknown>> {
  return h.getTelemetry().snapshot().events.filter((e) => e.type === type) as Array<Record<string, unknown>>;
}
