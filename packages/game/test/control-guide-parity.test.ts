import { describe, expect, it } from 'vitest';
import * as ControlGuideModule from '../src/ui/ControlGuide';
import type { ControlDiagnostics } from '../src/agent/AgentHarness';

describe('native control parity readout', () => {
  it('states role assignment, requested versus actual heading, and pop polarity', () => {
    const diagnostics: ControlDiagnostics = {
      contacts: {
        tail: { id: 7, planted: true, pad: { x: 0.4, y: 0.5 } },
        nose: { id: 9, planted: true, pad: { x: 0.6, y: 0.5 } },
      },
      requestedHeadingRad: Math.PI / 6,
      actualHeadingRad: Math.PI / 9,
      headingErrorRad: Math.PI / 18,
      popSide: 'tail',
      noseOverTailMeters: 0.042,
      popPolarityOk: true,
    };
    const format = (ControlGuideModule as unknown as {
      controlParityText(value: ControlDiagnostics): string;
    }).controlParityText;

    expect(typeof format).toBe('function');
    const text = format(diagnostics);
    expect(text).toContain('TAIL #7');
    expect(text).toContain('NOSE #9');
    expect(text).toContain('request 30.0° → board 20.0°');
    expect(text).toContain('POP TAIL → nose +4.2 cm ✓');
  });
});
