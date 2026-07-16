import { describe, expect, it } from 'vitest';
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
    expect(parity.requestedHeadingRad).toBeCloseTo(0, 6);
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

  it('shows a clockwise pad heading producing the same signed board turn', async () => {
    const d = await settled(0xc0de3);
    const tail = { x: 0.5, y: 0.4 };
    const nose = { x: 0.5, y: 0.6 };
    // Establish physical index-left/middle-right identity before rotating the
    // sticky contact pair through 90 degrees.
    d.drive({ tail: TAIL_POS, nose: NOSE_POS });
    for (let i = 0; i < 120; i++) {
      d.drive({ tail, nose, auxiliary: true });
    }

    const parity = parityOf(d);
    expect(parity.requestedHeadingRad).toBeCloseTo(-Math.PI / 2, 3);
    expect(parity.actualHeadingRad).toBeLessThan(-0.2);
    expect(Math.abs(parity.headingErrorRad ?? Math.PI)).toBeLessThan(Math.PI / 2);
  });
});
