/**
 * GT-click (M4) — kick classification truth table through the full harness
 * pipeline (final-input-and-trick-spec §3.1 conflicts + §4.1 plant-mask):
 *
 *   tail-only + click                        → ollie (no push)
 *   nose-only + click                        → nollie (no push)
 *   both + click, no lift follows            → push (no pop)
 *   both + click, nose lifts in lookahead    → ollie (forgiveness — clicked
 *                                              slightly BEFORE the lift)
 *   both + click, tail lifts in lookahead    → nollie (mirrored forgiveness)
 *   none + click                             → ignored (no pop, no push)
 *
 * tap-to-click note: InputProfile.tapToClickIsKick exists, but OS tap-generated
 * primaries are indistinguishable from physical clicks at the ContactFrame
 * level (report-level Button 1, spec §4 device matrix). Honoring the toggle
 * needs adapter metadata from the native host (host milestone) — documented
 * here rather than silently faked.
 */
import { describe, expect, it } from 'vitest';
import { eventsOf, NOSE_POS, settled, settledProfiled, TAIL_POS } from './helpers/maneuver';
import type { PadDriver } from './helpers/maneuver';

// This suite is the PLANT-MASK truth table (M4 legacy mode, pinned explicitly
// while the optional buttonSide profile has its own table). The buttonSide table
// lives in gt-click-buttonside.test.ts.
async function riding(seed: number): Promise<PadDriver> {
  const d = await settledProfiled(seed, { kickAttribution: 'plantMask' });
  d.cruise(90); // both planted: rest captured, phase 'ground'
  return d;
}

describe('GT-click: kick classification truth table', () => {
  it('ship default: physical LMB is ignored and tail lift-retap opens an ollie', async () => {
    const d = await settled(0xc1100);
    d.cruise(30);
    const kickStep = d.step;
    d.drive({ nose: NOSE_POS, tail: TAIL_POS, primary: true });
    expect(eventsOf(d.harness, 'popRecognized')).toHaveLength(0);
    d.drive({ nose: NOSE_POS, tail: null });
    d.drive({ nose: NOSE_POS, tail: null });
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops).toHaveLength(1);
    expect(pops[0]!.label).toBe('ollie');
    expect(d.step).toBeGreaterThan(kickStep);
    expect(eventsOf(d.harness, 'push')).toHaveLength(0);
  });
  it('tail plant + nose lift + click → ollie (kick claimed, no push)', async () => {
    const d = await riding(0xc11c1);
    d.drive({ tail: TAIL_POS }); // nose lift
    d.drive({ tail: TAIL_POS, primary: true }); // kick
    d.cruise(0);
    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops.length).toBe(1);
    expect(pops[0]!.label).toBe('ollie');
    expect(['pop', 'air']).toContain(d.harness.observe().phase);
    expect(d.harness.observe().label).toBe('ollie');
    expect(eventsOf(d.harness, 'push').length).toBe(0);
  });

  it('nose plant + tail lift + click → nollie (mirrored)', async () => {
    const d = await riding(0xc11c2);
    d.drive({ nose: NOSE_POS }); // tail lift
    d.drive({ nose: NOSE_POS, primary: true }); // kick
    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops.length).toBe(1);
    expect(pops[0]!.label).toBe('nollie');
    expect(eventsOf(d.harness, 'push').length).toBe(0);
  });

  it('both planted + click with no lift → push after the lookahead, no pop', async () => {
    const d = await riding(0xc11c3);
    const kickStep = d.step;
    d.drive({ nose: NOSE_POS, tail: TAIL_POS, primary: true });
    // Stay planted through the lookahead window and beyond.
    d.cruise(10);
    expect(eventsOf(d.harness, 'popRecognized').length).toBe(0);
    const pushes = eventsOf(d.harness, 'push');
    expect(pushes.length).toBe(1);
    // The push resolves AFTER the lookahead window (the disambiguation price).
    expect(pushes[0]!.step as number).toBeGreaterThan(kickStep);
    expect(pushes[0]!.step as number).toBeLessThanOrEqual(kickStep + 8);
    expect(d.harness.observe().phase).toBe('ground');
  });

  it('click slightly BEFORE the nose lift (within lookahead) → still ollie', async () => {
    const d = await riding(0xc11c4);
    d.drive({ nose: NOSE_POS, tail: TAIL_POS, primary: true }); // kick, both planted
    d.drive({ nose: NOSE_POS, tail: TAIL_POS }); // 1 step later…
    d.drive({ tail: TAIL_POS }); // …nose lifts (2 steps ≤ lookahead 4)
    d.drive({ tail: TAIL_POS });
    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops.length).toBe(1);
    expect(pops[0]!.label).toBe('ollie');
    expect(eventsOf(d.harness, 'push').length).toBe(0); // claimed, not double-triggered
    const decisions = eventsOf(d.harness, 'kickArbitrated').map((e) => e.decision);
    expect(decisions).toContain('ollie-lookahead');
  });

  it('click slightly BEFORE the tail lift → nollie (mirrored forgiveness)', async () => {
    const d = await riding(0xc11c5);
    d.drive({ nose: NOSE_POS, tail: TAIL_POS, primary: true });
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    d.drive({ nose: NOSE_POS }); // tail lifts within the lookahead
    d.drive({ nose: NOSE_POS });
    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops.length).toBe(1);
    expect(pops[0]!.label).toBe('nollie');
    expect(eventsOf(d.harness, 'push').length).toBe(0);
  });

  it('no feet planted + click → ignored (no pop, no push)', async () => {
    const d = await riding(0xc11c6);
    d.drive({}); // lift both feet (plant mask goes none)
    d.drive({ primary: true }); // click with nothing planted
    d.cruise(8);
    expect(eventsOf(d.harness, 'popRecognized').length).toBe(0);
    expect(eventsOf(d.harness, 'push').length).toBe(0);
    const decisions = eventsOf(d.harness, 'kickArbitrated').map((e) => e.decision);
    expect(decisions).toContain('ignored-none');
  });

  it('kicks while airborne (no ground phase) are ignored — no assist without recognition', async () => {
    const d = await riding(0xc11c7);
    d.drive({ tail: TAIL_POS });
    d.drive({ tail: TAIL_POS, primary: true }); // ollie
    // Wait until airborne, then click again mid-air.
    for (let i = 0; i < 10; i++) d.drive({ tail: TAIL_POS });
    expect(d.harness.observe().phase).toBe('air');
    d.drive({ tail: TAIL_POS, primary: false });
    d.drive({ tail: TAIL_POS, primary: true }); // mid-air kick
    for (let i = 0; i < 4; i++) d.drive({ tail: TAIL_POS });
    // Only ONE pop was ever recognized; the mid-air kick opened nothing.
    expect(eventsOf(d.harness, 'popRecognized').length).toBe(1);
    const decisions = eventsOf(d.harness, 'kickArbitrated').map((e) => e.decision);
    expect(decisions).toContain('ignored-phase');
  });
});
