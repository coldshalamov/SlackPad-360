import { describe, expect, it } from 'vitest';
import { eventsOf, NOSE_POS, settled, TAIL_POS } from './helpers/maneuver';

describe('shipping lift-and-retap pop contract', () => {
  it('ignores physical mouse-button clicks', async () => {
    const d = await settled(0xc11a4);
    d.cruise(30);

    d.drive({ nose: NOSE_POS, tail: TAIL_POS, primary: true });
    d.drive({ nose: NOSE_POS, tail: TAIL_POS, secondary: true });

    expect(eventsOf(d.harness, 'popRecognized')).toHaveLength(0);
  });

  it('lifting and quickly retapping the tail finger pops an ollie', async () => {
    const d = await settled(0xc11a5);
    d.cruise(12);

    d.drive({ nose: NOSE_POS, tail: null });
    d.drive({ nose: NOSE_POS, tail: null });
    const tapStep = d.step;
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });

    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops).toHaveLength(1);
    expect(pops[0]!.label).toBe('ollie');
    expect(pops[0]!.step).toBeLessThanOrEqual(tapStep + 1);
    expect(['pop', 'air']).toContain(d.harness.observe().phase);
  });

  it('lifting and quickly retapping the nose finger pops a nollie', async () => {
    const d = await settled(0xc11a6);
    d.cruise(12);

    d.drive({ nose: null, tail: TAIL_POS });
    d.drive({ nose: null, tail: TAIL_POS });
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });

    const pops = eventsOf(d.harness, 'popRecognized');
    expect(pops).toHaveLength(1);
    expect(pops[0]!.label).toBe('nollie');
  });

  it('does not pop when a lifted finger replants far from its prior position', async () => {
    const d = await settled(0xc11a7);
    d.cruise(12);

    d.drive({ nose: NOSE_POS, tail: null });
    d.drive({ nose: NOSE_POS, tail: null });
    d.drive({ nose: NOSE_POS, tail: { x: 0.1, y: 0.85 } });

    expect(eventsOf(d.harness, 'popRecognized')).toHaveLength(0);
  });

  it('does not mistake the initial one- or two-finger plant for a tap', async () => {
    const d = await settled(0xc11a8);
    d.drive({ tail: TAIL_POS });
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    expect(eventsOf(d.harness, 'popRecognized')).toHaveLength(0);
  });
});
