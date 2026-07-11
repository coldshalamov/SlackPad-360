/**
 * GT-land (M4) — landing cones (final-physics §3.2): board-up vs world-up θ
 * classifies clean (≤25°) / dirty (≤45°, speed scrub) / bail (beyond, or
 * inverted deck). Cone entry is engineered by scaling the pop pitch torque via
 * config overrides (harness constructor config — never a pose write).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG, deepFreezeConfig } from '@slackpad/shared';
import type { SimConfig } from '@slackpad/shared';
import { AgentHarness } from '../src/agent/AgentHarness';
import { eventsOf, flyOut, lastEventOf, scriptOllie, settled } from './helpers/maneuver';
import type { FlightResult } from './helpers/maneuver';

function configWith(patch: (cfg: SimConfig) => void): SimConfig {
  const cfg = structuredClone(DEFAULT_SIM_CONFIG) as SimConfig;
  patch(cfg);
  return deepFreezeConfig(cfg);
}

async function popAndLand(
  seed: number,
  cfg: SimConfig | undefined,
  script: { prepMoveFrames?: number; prepSpeedPerFrame?: number; gapSteps?: number },
): Promise<{ h: AgentHarness; flight: FlightResult }> {
  const h = new AgentHarness(cfg ?? DEFAULT_SIM_CONFIG);
  const d = await settled(seed, 'flat-dev', h);
  d.cruise(90);
  scriptOllie(d, script);
  const flight = flyOut(d, { catchAfterApexSteps: null });
  return { h, flight };
}

const MID_Q = { gapSteps: 2 }; // timing-only q=0.25 pop — small, safe
const MAX_Q = { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 }; // q=1

describe('GT-land: landing cones', () => {
  it('small pop lands CLEAN: θ ≤ thetaCleanDeg, phase ground, no fail reason', async () => {
    const { h, flight } = await popAndLand(0x1a2d1, undefined, MID_Q);
    expect(flight.outcome).toBe('clean');
    expect(flight.thetaDeg).not.toBeNull();
    expect(flight.thetaDeg!).toBeLessThanOrEqual(DEFAULT_SIM_CONFIG.land.thetaCleanDeg);
    expect(h.observe().phase).toBe('ground');
    expect(h.observe().lastFailReason).toBeNull();
    // trickCompleted telemetry carries the label for the future scorer (M9).
    const trick = lastEventOf(h, 'trickCompleted')!;
    expect(trick.label).toBe('ollie');
    expect(trick.cleanliness).toBe('clean');
  });

  it('uncaught max pop lands DIRTY: θ in the dirty cone + speed scrub applied', async () => {
    const { h, flight } = await popAndLand(0x1a2d2, undefined, MAX_Q);
    expect(flight.outcome).toBe('dirty');
    expect(flight.thetaDeg!).toBeGreaterThan(DEFAULT_SIM_CONFIG.land.thetaCleanDeg);
    expect(flight.thetaDeg!).toBeLessThanOrEqual(DEFAULT_SIM_CONFIG.land.thetaDirtyDeg);
    expect(h.observe().phase).toBe('ground');

    // Scrub isolation: identical run with dirtySpeedScrub = 0 keeps more speed.
    const noScrub = configWith((c) => {
      (c.land as { dirtySpeedScrub: number }).dirtySpeedScrub = 0;
    });
    const control = await popAndLand(0x1a2d2, noScrub, MAX_Q);
    expect(control.flight.outcome).toBe('dirty'); // same cone, no scrub
    const speedOf = (x: AgentHarness): number => {
      const lv = x.observe().board.lv;
      return Math.hypot(lv.x, lv.z);
    };
    expect(speedOf(h)).toBeLessThan(speedOf(control.h) - 0.5);
  });

  it('over-pitched pop BAILS with reason over-rotation', async () => {
    const cfg = configWith((c) => {
      (c.pop as { pitchTorqueScale: number }).pitchTorqueScale = 0.056;
    });
    const { h, flight } = await popAndLand(0x1a2d3, cfg, MAX_Q);
    expect(flight.outcome).toBe('bail');
    expect(h.observe().lastFailReason).toBe('over-rotation');
    expect(eventsOf(h, 'bail')[0]!.reason).toBe('over-rotation');
  });

  it('tumbling pop lands INVERTED → bail with reason inverted', async () => {
    const cfg = configWith((c) => {
      (c.pop as { pitchTorqueScale: number }).pitchTorqueScale = 0.2;
    });
    const { h, flight } = await popAndLand(0x1a2d4, cfg, MAX_Q);
    expect(flight.outcome).toBe('bail');
    expect(h.observe().lastFailReason).toBe('inverted');
  });
});
