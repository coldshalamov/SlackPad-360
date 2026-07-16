import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUT_PROFILE, DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import type { Contact } from '@slackpad/shared';
import { AgentHarness } from '../src/agent/AgentHarness';
import type { InjectableFrame } from '../src/agent/AgentHarness';
import { SimWorld } from '../src/sim/SimWorld';

const REST: Contact[] = [
  { id: 1, x: 0.4, y: 0.5, tip: true, confidence: true },
  { id: 2, x: 0.6, y: 0.5, tip: true, confidence: true },
];

const TURN_90_CLOCKWISE: Contact[] = [
  { ...REST[0]!, x: 0.5, y: 0.4 },
  { ...REST[1]!, x: 0.5, y: 0.6 },
];

let frameId = 90_000;
function frame(step: number, contacts: Contact[], accelerating: boolean): InjectableFrame {
  return {
    schemaVersion: 1,
    frameId: frameId++,
    tPerfMs: step * (1000 / DEFAULT_SIM_CONFIG.physics.hz),
    contacts,
    buttons: { primary: false, secondary: false, auxiliary: accelerating },
  };
}

function yaw(harness: AgentHarness): number {
  const q = harness.observe().board.q;
  return Math.atan2(
    2 * (q.x * q.z + q.w * q.y),
    1 - 2 * (q.x * q.x + q.y * q.y),
  );
}

function worldYaw(world: SimWorld): number {
  const q = world.boardPose().q;
  return Math.atan2(
    2 * (q.x * q.z + q.w * q.y),
    1 - 2 * (q.x * q.x + q.y * q.y),
  );
}

async function grounded(seed: number): Promise<AgentHarness> {
  const harness = new AgentHarness(DEFAULT_SIM_CONFIG, () => ({
    ...DEFAULT_INPUT_PROFILE,
    bothClickMeans: 'push',
    kickAttribution: 'plantMask',
  }));
  await harness.reset(seed, 'flat-dev');
  harness.step(60);
  return harness;
}

describe('professional skate physics foundation', () => {
  it('configures a rider-loaded board and two 120 Hz physics substeps', () => {
    const physics = DEFAULT_SIM_CONFIG.physics as typeof DEFAULT_SIM_CONFIG.physics & {
      riderMass: number;
      physicsSubsteps: number;
      ccdSubsteps: number;
    };

    expect(physics.riderMass).toBeGreaterThanOrEqual(60);
    expect(physics.boardMass + physics.riderMass).toBeGreaterThanOrEqual(65);
    expect(physics.physicsSubsteps).toBe(2);
    expect(physics.hz * physics.physicsSubsteps).toBe(120);
    expect(physics.ccdSubsteps).toBeGreaterThanOrEqual(2);
  });

  it('builds the playable body with the configured board-plus-rider mass and CCD', async () => {
    const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
    await world.reset(0x4d455441, 'flat-dev');

    const diagnostics = world.physicsDiagnostics();
    expect(diagnostics.boardMass).toBe(DEFAULT_SIM_CONFIG.physics.boardMass);
    expect(diagnostics.riderMass).toBe(DEFAULT_SIM_CONFIG.physics.riderMass);
    expect(diagnostics.totalMass).toBeCloseTo(
      DEFAULT_SIM_CONFIG.physics.boardMass + DEFAULT_SIM_CONFIG.physics.riderMass,
      5,
    );
    expect(diagnostics.ccdEnabled).toBe(true);
    expect(diagnostics.physicsSubsteps).toBe(2);
    world.free();
  });

  it('applies a pop through a short multi-substep actuation envelope', async () => {
    const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
    await world.reset(0x5011, 'flat-dev');
    for (let i = 0; i < 90; i++) world.step();
    const before = world.boardPose().lv.y;
    const cfg = DEFAULT_SIM_CONFIG.pop;
    const impulse = cfg.jMin + cfg.baseQuality * (cfg.jMax - cfg.jMin);

    world.applyManeuver({ kind: 'pop', jY: impulse, pitchTorqueImpulse: 0 });
    expect(world.boardPose().lv.y).toBeCloseTo(before, 6);
    expect(world.physicsDiagnostics().activePopSubstepsRemaining).toBe(cfg.actuationSubsteps);

    world.step();
    expect(world.boardPose().lv.y).toBeGreaterThan(before + 0.5);
    expect(world.physicsDiagnostics().activePopSubstepsRemaining).toBeGreaterThan(0);
    world.step();
    expect(world.physicsDiagnostics().activePopSubstepsRemaining).toBe(0);
    world.free();
  });

  it('does not spin a stationary planted board toward a new finger heading', async () => {
    const harness = await grounded(0x57a7e);

    for (let i = 0; i < 90; i++) {
      harness.injectContactFrame(frame(60 + i, TURN_90_CLOCKWISE, false));
      harness.step(1);
    }

    expect(Math.abs(yaw(harness))).toBeLessThan(0.12);
    expect(Math.hypot(harness.observe().board.lv.x, harness.observe().board.lv.z)).toBeLessThan(0.2);
  });

  it('keeps a neutral loaded rider upright and tracking straight without phantom steering', async () => {
    const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
    await world.reset(0x1ed6e, 'flat-dev');
    for (let i = 0; i < 90; i++) world.step();
    const startX = world.boardPose().p.x;

    for (let i = 0; i < 240; i++) {
      world.applyGroundForces({
        active: true,
        driveForce: DEFAULT_SIM_CONFIG.locomotion.cruiseDriveForce,
        brakeForce: 0,
        pushImpulse: 0,
        targetYawRate: 0,
        steerAngle: 0,
        rollTorque: 0,
      });
      world.step();
    }

    const pose = world.boardPose();
    const deckUpY = 1 - 2 * (pose.q.x * pose.q.x + pose.q.z * pose.q.z);
    expect(Math.abs(pose.p.x - startX)).toBeLessThan(0.2);
    expect(deckUpY).toBeGreaterThan(0.97);
    world.free();
  });

  it('keeps an aggressively turning planted board rideable instead of casually flipping', async () => {
    const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
    await world.reset(0x7a11, 'flat-dev');
    for (let i = 0; i < 90; i++) world.step();

    let minimumDeckUp = 1;
    for (let i = 0; i < 360; i++) {
      world.applyGroundForces({
        active: true,
        driveForce: DEFAULT_SIM_CONFIG.locomotion.accelerationStrokePeakForce,
        brakeForce: 0,
        pushImpulse: 0,
        targetYawRate: 0,
        steerAngle: Math.PI / 2,
        rollTorque: 0,
      });
      world.step();
      const q = world.boardPose().q;
      minimumDeckUp = Math.min(
        minimumDeckUp,
        1 - 2 * (q.x * q.x + q.z * q.z),
      );
    }

    expect(minimumDeckUp).toBeGreaterThan(0.7);
    expect(world.isGrounded()).toBe(true);
    world.free();
  });

  it('turns at full cruise progressively without toy-like snap or immediate scrub', async () => {
    const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
    await world.reset(0x7a12, 'flat-dev');
    for (let i = 0; i < 90; i++) world.step();
    for (let i = 0; i < 240; i++) {
      world.applyGroundForces({
        active: true,
        driveForce: DEFAULT_SIM_CONFIG.locomotion.cruiseDriveForce,
        brakeForce: 0,
        pushImpulse: 0,
        targetYawRate: 0,
        steerAngle: 0,
        rollTorque: 0,
      });
      world.step();
    }
    const entrySpeed = Math.hypot(world.boardPose().lv.x, world.boardPose().lv.z);
    const target = Math.PI / 2;
    let yawAt300ms = 0;
    let speedAt300ms = entrySpeed;
    let peakYawRate = 0;
    let peakYaw = 0;
    // Judge the progressive carve before its trajectory reaches flat-dev's
    // +X grind ledge. A longer horizon measures an obstacle collision rather
    // than truck steering or speed scrub.
    for (let i = 0; i < 78; i++) {
      world.applyGroundForces({
        active: true,
        driveForce: DEFAULT_SIM_CONFIG.locomotion.cruiseDriveForce,
        brakeForce: 0,
        pushImpulse: 0,
        targetYawRate: 0,
        steerAngle: target,
        rollTorque: 0,
      });
      world.step();
      const pose = world.boardPose();
      const currentYaw = worldYaw(world);
      peakYaw = Math.max(peakYaw, currentYaw);
      peakYawRate = Math.max(peakYawRate, Math.abs(pose.av.y));
      if (i === 17) {
        yawAt300ms = currentYaw;
        speedAt300ms = Math.hypot(pose.lv.x, pose.lv.z);
      }
    }
    expect(yawAt300ms).toBeGreaterThan(0.08);
    expect(yawAt300ms).toBeLessThan(Math.PI / 4);
    expect(speedAt300ms).toBeGreaterThan(entrySpeed * 0.85);
    expect(peakYawRate).toBeLessThanOrEqual(DEFAULT_SIM_CONFIG.physics.steerYawRateMax * 1.2);
    expect(peakYaw).toBeLessThan(target + 0.25);
    expect(Math.abs(target - worldYaw(world))).toBeLessThan(0.3);
    expect(world.isGrounded()).toBe(true);
    world.free();
  });
});
