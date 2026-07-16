import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { describe, expect, it } from 'vitest';

import {
  isRideableWheelSupport,
  TransitionAssist,
  type TransitionAssistAction,
  type TransitionAssistSample,
} from '../src/sim/TransitionAssist';
import { SimWorld } from '../src/sim/SimWorld';
import { DEFAULT_LEVEL_ID } from '../src/sim/levels';

const DT = 1 / 120;
const MASS = DEFAULT_SIM_CONFIG.physics.boardMass + DEFAULT_SIM_CONFIG.physics.riderMass;

function sample(overrides: Partial<TransitionAssistSample> = {}): TransitionAssistSample {
  return {
    supported: false,
    supportNormal: null,
    boardUp: { x: 0, y: 1, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    dt: DT,
    totalMass: MASS,
    ...overrides,
  };
}

function magnitude(v: { x: number; y: number; z: number }): number {
  return Math.hypot(v.x, v.y, v.z);
}

function runUphillApproach(assist: TransitionAssist): TransitionAssistAction[] {
  const angle = 20 * Math.PI / 180;
  const normal = { x: 0, y: Math.cos(angle), z: -Math.sin(angle) };
  const velocity = { x: 0, y: 5 * Math.sin(angle), z: 5 * Math.cos(angle) };
  const actions: TransitionAssistAction[] = [];
  for (let i = 0; i < 8; i++) {
    actions.push(assist.update(sample({
      supported: true,
      supportNormal: normal,
      boardUp: normal,
      velocity,
    })));
  }
  for (let i = 0; i < DEFAULT_SIM_CONFIG.transition.lipDepartureConfirmSubsteps; i++) {
    actions.push(assist.update(sample({ velocity })));
  }
  return actions;
}

describe('TransitionAssist', () => {
  it('keeps wheel control through steep vert but rejects a side-resting deck', () => {
    const steep = 70 * Math.PI / 180;
    const transitionNormal = { x: 0, y: Math.cos(steep), z: -Math.sin(steep) };
    expect(isRideableWheelSupport(transitionNormal, transitionNormal, 4, 0.64)).toBe(true);
    expect(isRideableWheelSupport(
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      4,
      0.64,
    )).toBe(false);
    expect(isRideableWheelSupport(transitionNormal, transitionNormal, 1, 0.64)).toBe(false);
  });

  it('does not manufacture pump or launch energy on flat ground', () => {
    const assist = new TransitionAssist(DEFAULT_SIM_CONFIG.transition);
    for (let i = 0; i < 12; i++) {
      const action = assist.update(sample({
        supported: true,
        supportNormal: { x: 0, y: 1, z: 0 },
        velocity: { x: 0, y: 0, z: 5 },
      }));
      expect(action.kind).toBe('none');
      expect(magnitude(action.linearImpulse)).toBe(0);
    }
    const departure = assist.update(sample({ velocity: { x: 0, y: 0, z: 5 } }));
    expect(departure.kind).toBe('none');
    expect(magnitude(departure.linearImpulse)).toBe(0);
  });

  it('adds a bounded along-motion pump and one proportional lip-launch impulse', () => {
    const cfg = DEFAULT_SIM_CONFIG.transition;
    const actions = runUphillApproach(new TransitionAssist(cfg));
    const pumps = actions.filter((action) => action.kind === 'pump');
    const launch = actions.at(-1)!;

    expect(pumps.length).toBeGreaterThanOrEqual(1);
    for (const pump of pumps) {
      expect(pump.linearImpulse.y).toBeGreaterThan(0);
      expect(pump.linearImpulse.z).toBeGreaterThan(0);
      expect(magnitude(pump.linearImpulse)).toBeLessThanOrEqual(cfg.pumpForceMax * DT + 1e-9);
    }
    expect(launch.kind).toBe('lip-launch');
    expect(launch.linearImpulse.y).toBeGreaterThan(0);
    expect(launch.linearImpulse.z, 'launch preserves forward momentum direction').toBeGreaterThan(0);
    expect(magnitude(launch.linearImpulse)).toBeLessThanOrEqual(cfg.lipLaunchImpulseMax + 1e-9);

    const nextAir = new TransitionAssist(cfg);
    const sequence = runUphillApproach(nextAir);
    const afterLaunch = nextAir.update(sample({ velocity: { x: 0, y: 2, z: 5 } }));
    expect(sequence.at(-1)!.kind).toBe('lip-launch');
    expect(afterLaunch.kind).toBe('none');
  });

  it('never lip-launches a downhill departure', () => {
    const assist = new TransitionAssist(DEFAULT_SIM_CONFIG.transition);
    const angle = 20 * Math.PI / 180;
    const normal = { x: 0, y: Math.cos(angle), z: -Math.sin(angle) };
    for (let i = 0; i < 10; i++) {
      assist.update(sample({
        supported: true,
        supportNormal: normal,
        boardUp: normal,
        velocity: { x: 0, y: -5 * Math.sin(angle), z: -5 * Math.cos(angle) },
      }));
    }
    const departure = assist.update(sample({ velocity: { x: 0, y: -2, z: -5 } }));
    expect(departure.kind).toBe('none');
    expect(magnitude(departure.linearImpulse)).toBe(0);
  });

  it('does not launch from a one-frame bank edge or contact flicker', () => {
    const cfg = DEFAULT_SIM_CONFIG.transition;
    const assist = new TransitionAssist(cfg);
    const angle = 20 * Math.PI / 180;
    const normal = { x: 0, y: Math.cos(angle), z: -Math.sin(angle) };
    const velocity = { x: 0, y: 5 * Math.sin(angle), z: 5 * Math.cos(angle) };
    for (let i = 0; i < cfg.minSupportedSubsteps - 1; i++) {
      assist.update(sample({
        supported: true,
        supportNormal: normal,
        boardUp: normal,
        velocity,
      }));
    }
    const departure = assist.update(sample({ velocity }));
    expect(departure.kind).toBe('none');
    expect(magnitude(departure.linearImpulse)).toBe(0);
  });

  it('requires a confirmed support departure after a stable armed approach', () => {
    const cfg = DEFAULT_SIM_CONFIG.transition;
    const assist = new TransitionAssist(cfg);
    const angle = 20 * Math.PI / 180;
    const normal = { x: 0, y: Math.cos(angle), z: -Math.sin(angle) };
    const velocity = { x: 0, y: 5 * Math.sin(angle), z: 5 * Math.cos(angle) };
    for (let i = 0; i < cfg.minSupportedSubsteps + 2; i++) {
      assist.update(sample({
        supported: true,
        supportNormal: normal,
        boardUp: normal,
        velocity,
      }));
    }

    expect(assist.update(sample({ velocity })).kind).toBe('none');
    expect(assist.update(sample({
      supported: true,
      supportNormal: normal,
      boardUp: normal,
      velocity,
    })).kind).not.toBe('lip-launch');
  });

  it('uses a bounded angular correction only for a descending, near-aligned transition landing', () => {
    const cfg = DEFAULT_SIM_CONFIG.transition;
    const assist = new TransitionAssist(cfg);
    for (let i = 0; i < cfg.landingMinAirborneSubsteps + 2; i++) {
      assist.update(sample({ velocity: { x: 0, y: -2, z: 3 } }));
    }

    const angle = 18 * Math.PI / 180;
    const normal = { x: 0, y: Math.cos(angle), z: -Math.sin(angle) };
    const boardUp = { x: 0, y: Math.cos(angle / 2), z: -Math.sin(angle / 2) };
    const landing = assist.update(sample({
      supported: true,
      supportNormal: normal,
      boardUp,
      velocity: { x: 0, y: -2, z: 3 },
      angularVelocity: { x: -1.2, y: 0, z: 0 },
    }));

    expect(landing.kind).toBe('landing');
    expect(landing.angularDelta.x).toBeLessThan(0);
    expect(magnitude(landing.angularDelta)).toBeGreaterThan(0);
    expect(landing.angularImpulseMax).toBe(cfg.landingAngularImpulseMax);
    expect(magnitude(landing.linearImpulse)).toBe(0);

    const outsideCone = new TransitionAssist(cfg);
    for (let i = 0; i < cfg.landingMinAirborneSubsteps + 2; i++) {
      outsideCone.update(sample({ velocity: { x: 0, y: -2, z: 3 } }));
    }
    const badLanding = outsideCone.update(sample({
      supported: true,
      supportNormal: normal,
      boardUp: { x: 0, y: 0.25, z: 0.9682458 },
      velocity: { x: 0, y: -2, z: 3 },
    }));
    expect(badLanding.kind).toBe('none');
    expect(magnitude(badLanding.angularDelta)).toBe(0);
  });

  it('is deterministic for an identical support and flight history', () => {
    const a = runUphillApproach(new TransitionAssist(DEFAULT_SIM_CONFIG.transition));
    const b = runUphillApproach(new TransitionAssist(DEFAULT_SIM_CONFIG.transition));
    expect(a).toEqual(b);
  });

  it('physically pumps and launches once from the playable north-bank lip', async () => {
    const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
    await world.reset(0x7e47, DEFAULT_LEVEL_ID);
    for (let i = 0; i < 90; i++) world.step();

    let pumps = 0;
    let launches = 0;
    let stepsAfterLaunch = -1;
    let launchDetails = '';
    let maxY = world.boardPose().p.y;
    for (let i = 0; i < 2100 && stepsAfterLaunch < 120; i++) {
      const pose = world.boardPose();
      // Keep the approach inside the 4 m-wide north bank. x=2 is its exact
      // half-width and lets the loaded board roll off the side before the lip.
      const targetX = pose.p.z < 28 ? -0.75 : 1;
      const targetHeading = Math.atan2(targetX - pose.p.x, 5);
      world.applyGroundForces({
        active: true,
        driveForce: DEFAULT_SIM_CONFIG.locomotion.cruiseDriveForce,
        brakeForce: 0,
        pushImpulse: 0,
        targetYawRate: 0,
        steerAngle: targetHeading,
        rollTorque: 0,
      });
      world.step();
      maxY = Math.max(maxY, world.boardPose().p.y);
      const action = world.lastTransitionAssist();
      if (action?.kind === 'pump') pumps += 1;
      if (action?.kind === 'lip-launch') {
        launches += 1;
        launchDetails = `${JSON.stringify(action)} pose=${JSON.stringify(world.boardPose())}`;
        if (stepsAfterLaunch < 0) stepsAfterLaunch = 0;
      } else if (stepsAfterLaunch >= 0) {
        stepsAfterLaunch += 1;
      }
    }

    expect(pumps, `no transition pump before ${JSON.stringify(world.boardPose())}`).toBeGreaterThan(0);
    expect(
      launches,
      `one stable uphill support loss gets one launch; pumps=${pumps} maxY=${maxY.toFixed(3)} final=${JSON.stringify(world.boardPose())}`,
    ).toBe(1);
    expect(
      maxY,
      `the loaded board follows the bank above its authored 1.05 m lip; launch=${launchDetails} final=${JSON.stringify(world.boardPose())}`,
    ).toBeGreaterThan(1.35);
    world.free();
  });
});
