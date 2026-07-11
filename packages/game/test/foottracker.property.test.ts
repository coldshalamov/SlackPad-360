/**
 * FootTracker property test (M3): arbitrary valid frame streams must never make
 * the tracker produce NaN, never bind more than two logical feet, and any
 * planted foot must report a calibrated position inside [0,1]².
 *
 * Runs on the DEFAULT profile (padYawOffset=0 → calibrated ≡ raw), so the
 * [0,1]² invariant is well-defined: rotating the unit square by a non-zero
 * padYawOffset would legitimately leave the square, so that case belongs only in
 * the dedicated near-center invariance test.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import type { Contact, ContactFrame } from '@slackpad/shared';
import { FootTracker } from '../src/input/FootTracker';
import type { FeetState } from '../src/input/FootTracker';

const FT = DEFAULT_SIM_CONFIG.footTracker;
const EPS = DEFAULT_SIM_CONFIG.recognition.plantSpeedEps;

const contactArb = fc.record({
  id: fc.integer({ min: 0, max: 6 }),
  tip: fc.boolean(),
  x: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  y: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  confidence: fc.boolean(),
});

const frameSpecArb = fc.record({
  contacts: fc.array(contactArb, { maxLength: 4 }),
  primary: fc.boolean(),
  dt: fc.integer({ min: 0, max: 40 }), // includes 0 → duplicate-timestamp dt guard
});

const streamArb = fc.array(frameSpecArb, { maxLength: 60 });

function assertFinite(v: number): void {
  expect(Number.isFinite(v)).toBe(true);
}

function checkState(s: FeetState): void {
  for (const foot of [s.nose, s.tail]) {
    assertFinite(foot.pos.x);
    assertFinite(foot.pos.y);
    assertFinite(foot.vel.x);
    assertFinite(foot.vel.y);
    assertFinite(foot.offsetFromRest.x);
    assertFinite(foot.offsetFromRest.y);
    if (foot.planted) {
      expect(foot.pos.x).toBeGreaterThanOrEqual(0);
      expect(foot.pos.x).toBeLessThanOrEqual(1);
      expect(foot.pos.y).toBeGreaterThanOrEqual(0);
      expect(foot.pos.y).toBeLessThanOrEqual(1);
    }
  }
  for (const v of [
    s.segment.angle,
    s.segment.angleFromRest,
    s.segment.angVel,
    s.segment.midpoint.x,
    s.segment.midpoint.y,
    s.segment.midpointVel.x,
    s.segment.midpointVel.y,
    s.segment.lengthRatio,
  ]) {
    assertFinite(v);
  }
  expect(s.plantCount).toBeLessThanOrEqual(2);
}

describe('FootTracker (property)', () => {
  it('arbitrary valid streams never NaN, ≤2 feet, planted pos in [0,1]²', () => {
    fc.assert(
      fc.property(streamArb, (stream) => {
        const t = new FootTracker(FT, EPS, { stance: 'regular', padYawOffset: 0, swapFeet: false });
        let tp = 0;
        let fidLocal = 0;
        stream.forEach((spec, i) => {
          tp += spec.dt;
          const frame: ContactFrame = {
            schemaVersion: 1,
            frameId: fidLocal++,
            tPerfMs: tp,
            source: 'synthetic',
            contacts: spec.contacts as Contact[],
            buttons: { primary: spec.primary, secondary: false, auxiliary: false },
          };
          const s = t.update([frame], i);
          checkState(s);
          t.drainKicks();
        });
      }),
      { numRuns: 200 },
    );
  });
});
