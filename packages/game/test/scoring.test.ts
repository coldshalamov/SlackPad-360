import { describe, expect, it } from 'vitest';
import { flyOut, scriptOllie, settled } from './helpers/maneuver';

describe('playable line scoring', () => {
  it('awards visible score for a landed trick and resets it with the run', async () => {
    const d = await settled(0x5c0a1);
    d.cruise(60);
    scriptOllie(d, { gapSteps: 2 });
    const flight = flyOut(d);
    expect(['clean', 'dirty']).toContain(flight.outcome);
    expect(d.harness.observe().score).toBeGreaterThan(0);

    await d.harness.reset(0x5c0a2, 'flat-dev');
    expect(d.harness.observe().score).toBe(0);
  });
});
