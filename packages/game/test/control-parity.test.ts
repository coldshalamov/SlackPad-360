import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { NOSE_POS, scriptOllie, settled, TAIL_POS } from './helpers/maneuver';

interface ParityReadback {
  contacts: {
    nose: { id: number | null; planted: boolean; pad: { x: number; y: number } };
    tail: { id: number | null; planted: boolean; pad: { x: number; y: number } };
  };
  requestedHeadingRad: number | null;
  actualHeadingRad: number;
  headingErrorRad: number | null;
  popSide: 'nose' | 'tail' | null;
  noseOverTailMeters: number;
  popPolarityOk: boolean | null;
}

function parityOf(driver: Awaited<ReturnType<typeof settled>>): ParityReadback {
  return (driver.harness as unknown as { controlDiagnostics(): ParityReadback }).controlDiagnostics();
}

describe('live control parity diagnostics', () => {
  it('shows the physical contact ids and their assigned regular-stance roles', async () => {
    const d = await settled(0xc0de1);
    d.drive({ tail: TAIL_POS, nose: NOSE_POS });

    const parity = parityOf(d);
    expect(parity.contacts.tail).toMatchObject({ planted: true });
    expect(parity.contacts.nose).toMatchObject({ planted: true });
    expect(parity.contacts.tail.id).not.toBe(parity.contacts.nose.id);
    expect(parity.contacts.tail.pad.x).toBeCloseTo(TAIL_POS.x, 4);
    expect(parity.contacts.tail.pad.y).toBeCloseTo(TAIL_POS.y, 4);
    expect(parity.contacts.nose.pad.x).toBeCloseTo(NOSE_POS.x, 4);
    expect(parity.contacts.nose.pad.y).toBeCloseTo(NOSE_POS.y, 4);
    // Relative steering (S2): a fresh dual-plant ANCHORS the servo target to
    // the board's live heading — it never snaps to the pad's absolute angle.
    expect(parity.requestedHeadingRad).not.toBeNull();
    expect(parity.requestedHeadingRad!).toBeCloseTo(parity.actualHeadingRad, 3);
    expect(parity.headingErrorRad).not.toBeNull();
  });

  it('reports whether a tail pop physically raises the nose', async () => {
    const d = await settled(0xc0de2);
    d.cruise(30);
    scriptOllie(d);

    let parity = parityOf(d);
    for (let i = 0; i < 8 && parity.popPolarityOk !== true; i++) {
      d.drive({ tail: TAIL_POS, nose: NOSE_POS });
      parity = parityOf(d);
    }

    expect(parity.popSide).toBe('tail');
    expect(parity.noseOverTailMeters).toBeGreaterThan(0);
    expect(parity.popPolarityOk).toBe(true);
  });

  it('shows a clockwise pad rotation producing the same signed board turn', async () => {
    const d = await settled(0xc0de3);
    // Establish identity, then ROTATE the pair through +90° at a finger rate
    // (~200°/s) — relative steering follows the change, not the absolute pose.
    for (let i = 0; i < 10; i++) d.drive({ tail: TAIL_POS, nose: NOSE_POS });
    const steps = 27;
    for (let k = 1; k <= steps; k++) {
      const a = (Math.PI / 2) * (k / steps);
      const c = 0.1 * Math.cos(a);
      const s = 0.1 * Math.sin(a);
      d.drive({
        tail: { x: 0.5 - c, y: 0.5 - s },
        nose: { x: 0.5 + c, y: 0.5 + s },
        auxiliary: true,
      });
    }
    for (let i = 0; i < 90; i++) {
      d.drive({ tail: { x: 0.5, y: 0.4 }, nose: { x: 0.5, y: 0.6 }, auxiliary: true });
    }

    const parity = parityOf(d);
    const expected = -(Math.PI / 2) * DEFAULT_SIM_CONFIG.locomotion.steerDirectGain;
    expect(parity.requestedHeadingRad).not.toBeNull();
    expect(parity.requestedHeadingRad!).toBeCloseTo(expected, 1);
    expect(parity.actualHeadingRad).toBeLessThan(-1.2);
    expect(Math.abs(parity.headingErrorRad ?? Math.PI)).toBeLessThan(0.2);
  });
});
