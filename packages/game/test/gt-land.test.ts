/**
 * GT-land (M4) — landing cones (final-physics §3.2): board-up vs world-up θ
 * classifies clean (≤25°) / dirty (≤70°, speed scrub) / bail (beyond, or
 * inverted deck). Binary click pop strength is fixed, so cone entry is
 * engineered by scaling pop pitch torque via config overrides (never a pose
 * write or a lift-derived quality script).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG, deepFreezeConfig } from '@slackpad/shared';
import type { SimConfig } from '@slackpad/shared';
import { AgentHarness } from '../src/agent/AgentHarness';
import { GestureFSM } from '../src/control/GestureFSM';
import type { FsmInputs } from '../src/control/GestureFSM';
import type { FeetState } from '../src/input/FootTracker';
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

const CLICK = {};

function dirtyPitchConfig(scrub = DEFAULT_SIM_CONFIG.land.dirtySpeedScrub): SimConfig {
  return configWith((c) => {
    (c.pop as { pitchTorqueScale: number }).pitchTorqueScale = 0.12;
    (c.pop as { levelKp: number }).levelKp = 0;
    (c.pop as { levelKd: number }).levelKd = 0;
    (c.land as { dirtySpeedScrub: number }).dirtySpeedScrub = scrub;
  });
}

describe('GT-land: landing cones', () => {
  it('small pop lands CLEAN: θ ≤ thetaCleanDeg, phase ground, no fail reason', async () => {
    const { h, flight } = await popAndLand(0x1a2d1, undefined, CLICK);
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

  it('an engineered pitched click-pop lands DIRTY: θ in cone + speed scrub applied', async () => {
    const cfg = dirtyPitchConfig();
    const { h, flight } = await popAndLand(0x1a2d2, cfg, CLICK);
    expect(flight.outcome).toBe('dirty');
    expect(flight.thetaDeg!).toBeGreaterThan(DEFAULT_SIM_CONFIG.land.thetaCleanDeg);
    expect(flight.thetaDeg!).toBeLessThanOrEqual(DEFAULT_SIM_CONFIG.land.thetaDirtyDeg);
    expect(h.observe().phase).toBe('ground');

    // Scrub isolation: identical run with dirtySpeedScrub = 0 keeps more speed.
    const noScrub = dirtyPitchConfig(0);
    const control = await popAndLand(0x1a2d2, noScrub, CLICK);
    expect(control.flight.outcome).toBe('dirty'); // same cone, no scrub
    const speedOf = (x: AgentHarness): number => {
      const lv = x.observe().board.lv;
      return Math.hypot(lv.x, lv.z);
    };
    expect(speedOf(h)).toBeLessThan(speedOf(control.h) - 0.5);
  });

  it('a landing outside the configured dirty cone BAILS with reason over-rotation', async () => {
    const cfg = configWith((c) => {
      (c.pop as { pitchTorqueScale: number }).pitchTorqueScale = 0.12;
      (c.pop as { levelKp: number }).levelKp = 0;
      (c.pop as { levelKd: number }).levelKd = 0;
      // Collapse the dirty cone onto the clean cone. The same click landing
      // proven dirty above must now exercise the over-rotation path.
      (c.land as { thetaDirtyDeg: number }).thetaDirtyDeg = c.land.thetaCleanDeg;
    });
    const { h, flight } = await popAndLand(0x1a2d3, cfg, CLICK);
    expect(flight.outcome).toBe('bail');
    expect(h.observe().lastFailReason).toBe('over-rotation');
    expect(eventsOf(h, 'bail')[0]!.reason).toBe('over-rotation');
  });

  it('an inverted deck at landing contact bails with reason inverted', () => {
    // Ray wheels correctly point away from the floor while upside down, so an
    // integration fixture can side-rest without ever producing a wheel-support
    // landing edge. Exercise the deterministic landing classifier directly at
    // the contact pose; the other three cases above retain full rigid-body runs.
    const feet: FeetState = {
      nose: {
        role: 'nose', planted: true, pos: { x: 0.6, y: 0.5 }, vel: { x: 0, y: 0 },
        offsetFromRest: { x: 0, y: 0 }, contactId: 1,
      },
      tail: {
        role: 'tail', planted: true, pos: { x: 0.4, y: 0.5 }, vel: { x: 0, y: 0 },
        offsetFromRest: { x: 0, y: 0 }, contactId: 2,
      },
      segment: {
        valid: true, angle: 0, angleFromRest: 0, angVel: 0,
        midpoint: { x: 0.5, y: 0.5 }, midpointOffsetFromRest: { x: 0, y: 0 },
        midpointVel: { x: 0, y: 0 }, lengthRatio: 1,
      },
      bothPlanted: true,
      plantCount: 2,
    };
    const upright = {
      p: { x: 0, y: 0.1, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 },
      lv: { x: 0, y: 0, z: 2 }, av: { x: 0, y: 0, z: 0 },
    };
    const input = (step: number, patch: Partial<FsmInputs> = {}): FsmInputs => ({
      feet,
      pops: [],
      grounded: false,
      pose: upright,
      contactImpulse: 0,
      supportContactImpulse: 0,
      railProximity: null,
      step,
      ...patch,
    });
    const fsm = new GestureFSM(DEFAULT_SIM_CONFIG, 1, 'regular');
    fsm.update(input(0, { grounded: true }));
    fsm.update(input(1, {
      grounded: true,
      pops: [{ step: 1, label: 'ollie', q: DEFAULT_SIM_CONFIG.pop.baseQuality }],
    }));
    fsm.update(input(2, {
      pose: { ...upright, p: { x: 0, y: 0.5, z: 0 }, lv: { x: 0, y: 1, z: 2 } },
    }));
    const result = fsm.update(input(3, {
      grounded: true,
      supportContactImpulse: 1,
      pose: {
        ...upright,
        q: { x: 1, y: 0, z: 0, w: 0 },
        lv: { x: 0, y: -1, z: 2 },
      },
    }));
    expect(result.phase).toBe('bail');
    expect(result.lastFailReason).toBe('inverted');
    expect(result.events).toContainEqual({ kind: 'bail', reason: 'inverted' });
  });
});
