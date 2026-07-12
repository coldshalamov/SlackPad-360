/**
 * GT-click 'buttonSide' (IMPL-007, the ship DEFAULT) — the product owner's
 * Tech Deck model: both fingers stay planted like a real ollie stance and the
 * BUTTON picks the kicking end, instantly.
 *
 *   both planted + LMB            → ollie, SAME step (no lookahead latency)
 *   both planted + RMB            → nollie, same step
 *   tail-only + LMB               → ollie   (single-foot rule: planted foot wins)
 *   tail-only + RMB               → ollie   (a foot not on the board cannot kick)
 *   nose-only + LMB               → nollie  (mirrored)
 *   none + either button          → ignored (no pop, no push)
 *   clicks never produce a push   (cruise drive owns push in this mode)
 *
 * The legacy 'plantMask' table lives in gt-click.test.ts (pinned explicitly).
 */
import { describe, expect, it } from 'vitest';
import { eventsOf, NOSE_POS, settledProfiled, TAIL_POS } from './helpers/maneuver';
import type { PadDriver } from './helpers/maneuver';

async function riding(seed: number): Promise<PadDriver> {
  // Default profile IS buttonSide; pass it explicitly so this suite still
  // pins the behavior if the default ever changes.
  const d = await settledProfiled(seed, { kickAttribution: 'buttonSide' });
  d.cruise(90);
  return d;
}

describe("GT-click 'buttonSide': the Tech Deck kick table", () => {
  it('both planted + LMB → ollie on the SAME step (no lookahead delay)', async () => {
    const d = await riding(0xb5001);
    const kickStep = d.step;
    d.drive({ nose: NOSE_POS, tail: TAIL_POS, primary: true });
    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops.length).toBe(1);
    expect(pops[0]!.label).toBe('ollie');
    expect(pops[0]!.step as number).toBeLessThanOrEqual(kickStep + 1);
    expect(eventsOf(d.harness, 'push').length).toBe(0);
    expect(['pop', 'air']).toContain(d.harness.observe().phase);
  });

  it('both planted + RMB → nollie on the same step', async () => {
    const d = await riding(0xb5002);
    d.drive({ nose: NOSE_POS, tail: TAIL_POS, secondary: true });
    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops.length).toBe(1);
    expect(pops[0]!.label).toBe('nollie');
    expect(eventsOf(d.harness, 'push').length).toBe(0);
  });

  it('tail-only + RMB → still ollie (a lifted foot cannot kick)', async () => {
    const d = await riding(0xb5003);
    d.drive({ tail: TAIL_POS }); // nose lifted
    d.drive({ tail: TAIL_POS, secondary: true });
    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops.length).toBe(1);
    expect(pops[0]!.label).toBe('ollie');
  });

  it('nose-only + LMB → nollie (planted foot wins over button)', async () => {
    const d = await riding(0xb5004);
    d.drive({ nose: NOSE_POS }); // tail lifted
    d.drive({ nose: NOSE_POS, primary: true });
    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops.length).toBe(1);
    expect(pops[0]!.label).toBe('nollie');
  });

  it('no feet + either button → ignored (no pop, no push)', async () => {
    const d = await riding(0xb5005);
    d.drive({}); // lift everything
    d.drive({ primary: true });
    d.drive({});
    d.drive({ secondary: true });
    d.cruise(0);
    expect(eventsOf(d.harness, 'popRecognized').length).toBe(0);
    expect(eventsOf(d.harness, 'push').length).toBe(0);
  });

  it('nose-lift prep before an LMB pop still raises quality q (prep is a bonus, not a gate)', async () => {
    // No prep: q floor.
    const flat = await riding(0xb5006);
    flat.drive({ nose: NOSE_POS, tail: TAIL_POS, primary: true });
    const qFlat = eventsOf(flat.harness, 'popRecognized')[0]!.q as number;

    // Crisp nose-lift prep just before the click (the M4 skill move).
    const prepped = await riding(0xb5006);
    prepped.drive({ nose: { x: NOSE_POS.x, y: NOSE_POS.y - 0.06 }, tail: TAIL_POS });
    prepped.drive({ tail: TAIL_POS }); // nose lifts with speed
    prepped.drive({ tail: TAIL_POS, primary: true });
    const qPrepped = eventsOf(prepped.harness, 'popRecognized')[0]!.q as number;

    expect(qPrepped).toBeGreaterThan(qFlat);
  });

  it('replay determinism: a buttonSide session with RMB nollies reproduces its checkpoints', async () => {
    // v1 traces are full-session: record from step 0 (reset → record → play).
    const d = await settledProfiled(0xb5007, { kickAttribution: 'buttonSide' });
    await d.harness.reset(0xb5007, 'flat-dev');
    d.harness.startRecording();
    d.idle(60); // settle drop
    d.cruise(90);
    // RMB nollie → land → LMB ollie
    d.drive({ nose: NOSE_POS, tail: TAIL_POS, secondary: true });
    for (let i = 0; i < 70; i++) d.cruise(1);
    d.drive({ nose: NOSE_POS, tail: TAIL_POS, primary: true });
    for (let i = 0; i < 70; i++) d.cruise(1);
    const trace = d.harness.stopRecording();
    const replayed = await d.harness.replay(trace);
    expect(replayed).toEqual(trace.checkpoints);
  });
});
