import { describe, expect, it } from 'vitest';
import { DT_MS, eventsOf, NOSE_POS, settled, TAIL_POS } from './helpers/maneuver';

describe('default Skate-like click contract', () => {
  it('two already-stable fingers + LMB pops an ollie immediately', async () => {
    const d = await settled(0xc11a4);
    d.cruise(30);

    const kickStep = d.step;
    d.drive({ nose: NOSE_POS, tail: TAIL_POS, primary: true });

    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops).toHaveLength(1);
    expect(pops[0]!.label).toBe('ollie');
    expect(pops[0]!.q).toBeGreaterThanOrEqual(0.5);
    expect(pops[0]!.step).toBeLessThanOrEqual(kickStep + 1);
    expect(['pop', 'air']).toContain(d.harness.observe().phase);
  });

  it('two already-stable fingers + RMB pops a nollie immediately', async () => {
    const d = await settled(0xc11a6);
    d.cruise(30);

    d.drive({ nose: NOSE_POS, tail: TAIL_POS, secondary: true });

    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops).toHaveLength(1);
    expect(pops[0]!.label).toBe('nollie');
  });

  it('does not treat a tap-to-click produced by the first fast finger plant as a pop', async () => {
    const d = await settled(0xc11a5);
    d.drive({ tail: TAIL_POS, primary: true });
    d.drive({ tail: TAIL_POS, primary: false });
    expect(eventsOf(d.harness, 'popRecognized')).toHaveLength(0);
  });

  it('does not treat a click on the first two-finger contact frame as a pop', async () => {
    const d = await settled(0xc11a7);

    d.drive({ nose: NOSE_POS, tail: TAIL_POS, primary: true });
    d.drive({ nose: NOSE_POS, tail: TAIL_POS, primary: false });

    expect(eventsOf(d.harness, 'popRecognized')).toHaveLength(0);
  });

  it('accepts a host-recovered click edge after a one-report dropout in the same sim step', async () => {
    const d = await settled(0xc11a8);
    d.cruise(30);

    const tPerfMs = d.step * DT_MS;
    d.harness.injectContactFrame([
      {
        schemaVersion: 1,
        frameId: 10_000,
        tPerfMs,
        contacts: [
          { id: 2, tip: true, x: TAIL_POS.x, y: TAIL_POS.y, confidence: true },
        ],
        buttons: { primary: false, secondary: false, auxiliary: false },
      },
      {
        schemaVersion: 1,
        frameId: 10_001,
        tPerfMs: tPerfMs + 0.25,
        contacts: [
          { id: 1, tip: true, x: NOSE_POS.x, y: NOSE_POS.y, confidence: true },
          { id: 2, tip: true, x: TAIL_POS.x, y: TAIL_POS.y, confidence: true },
        ],
        buttons: { primary: true, secondary: false, auxiliary: false },
      },
    ]);
    d.harness.step(1);

    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops).toHaveLength(1);
    expect(pops[0]!.label).toBe('ollie');
  });
});
