import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { SimWorld } from '../src/sim/SimWorld';

const SETTLE_STEPS = 90;

async function settledWorld(seed = 0x4a11): Promise<SimWorld> {
  const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
  await world.reset(seed, 'flat-dev');
  for (let i = 0; i < SETTLE_STEPS; i++) world.step();
  return world;
}

function horizontalSpeedInBoardFrame(world: SimWorld): { forward: number; lateral: number } {
  const pose = world.boardPose();
  const q = pose.q;
  const rightX = 1 - 2 * (q.y * q.y + q.z * q.z);
  const rightZ = 2 * (q.x * q.z - q.w * q.y);
  const forwardX = 2 * (q.x * q.z + q.w * q.y);
  const forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);
  return {
    forward: pose.lv.x * forwardX + pose.lv.z * forwardZ,
    lateral: pose.lv.x * rightX + pose.lv.z * rightZ,
  };
}

describe('four-wheel swept contact physics', () => {
  it('settles upright on four distinct wheel contact points', async () => {
    const world = await settledWorld();
    const wheels = world.wheelObservations();

    expect(wheels).toHaveLength(4);
    expect(wheels.every((wheel) => wheel.inContact)).toBe(true);
    expect(new Set(wheels.map((wheel) => wheel.id)).size).toBe(4);

    const points = wheels.map((wheel) => wheel.contactPoint);
    expect(points.every((point) => point !== null)).toBe(true);
    const xs = points.map((point) => point!.x);
    const zs = points.map((point) => point!.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.12);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.35);
    expect(world.boardPose().p.y).toBeGreaterThan(0.07);
    expect(world.boardPose().p.y).toBeLessThan(0.12);
    expect(world.isGrounded()).toBe(true);
    world.free();
  });

  it('has no phantom support in the air and reacquires all wheels after a pop', async () => {
    const world = await settledWorld(0xa17);
    world.applyManeuver({
      kind: 'pop',
      jY: DEFAULT_SIM_CONFIG.pop.jMin
        + DEFAULT_SIM_CONFIG.pop.baseQuality * (DEFAULT_SIM_CONFIG.pop.jMax - DEFAULT_SIM_CONFIG.pop.jMin),
      pitchTorqueImpulse: 0,
    });

    let sawAirborne = false;
    let reacquiredAllWheels = false;
    for (let i = 0; i < 180; i++) {
      world.step();
      const contacts = world.wheelObservations().filter((wheel) => wheel.inContact).length;
      if (contacts === 0 && world.boardPose().p.y > 0.16) sawAirborne = true;
      if (sawAirborne && contacts === 4) {
        reacquiredAllWheels = true;
        break;
      }
    }

    expect(sawAirborne).toBe(true);
    expect(reacquiredAllWheels).toBe(true);
    expect(world.isGrounded()).toBe(true);
    world.free();
  });

  it('swept wheels reacquire the raised grind-lab ledge instead of the floor below it', async () => {
    const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
    await world.reset(0x1ed6e, 'grind-lab');
    for (let i = 0; i < SETTLE_STEPS; i++) world.step();

    for (let i = 0; i < 420 && world.boardPose().p.z < 6.35; i++) {
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
    expect(world.boardPose().p.z).toBeGreaterThan(6.2);
    world.applyManeuver({
      kind: 'pop',
      jY: DEFAULT_SIM_CONFIG.pop.jMin
        + DEFAULT_SIM_CONFIG.pop.baseQuality * (DEFAULT_SIM_CONFIG.pop.jMax - DEFAULT_SIM_CONFIG.pop.jMin),
      pitchTorqueImpulse: 0,
    });

    let raisedContact = false;
    for (let i = 0; i < 180; i++) {
      world.step();
      if (
        world.wheelObservations().some(
          (wheel) => wheel.inContact && wheel.contactPoint !== null && wheel.contactPoint.y > 0.12,
        )
      ) {
        raisedContact = true;
        break;
      }
    }

    expect(raisedContact).toBe(true);
    world.free();
  });

  it('does not treat a board planted on its side as wheel-supported riding', async () => {
    const world = await settledWorld(0x51de);

    let sawSide = false;
    for (let i = 0; i < 120; i++) {
      world.applyManeuver({
        kind: 'flipTorque',
        axis: 'long',
        omegaTarget: 12,
        tauMax: DEFAULT_SIM_CONFIG.flip.tauMax[2],
      });
      world.step();
      const pose = world.boardPose();
      const deckUpY = 1 - 2 * (pose.q.x * pose.q.x + pose.q.z * pose.q.z);
      if (Math.abs(deckUpY) < 0.3 && pose.p.y < 0.18) {
        sawSide = true;
        expect(world.wheelObservations().filter((wheel) => wheel.inContact).length).toBeLessThan(4);
        expect(world.isGrounded()).toBe(false);
        break;
      }
    }

    expect(sawSide).toBe(true);
    world.free();
  });

  it('uses wheel side friction to keep planted travel aligned with the deck', async () => {
    const world = await settledWorld(0x1a7e);

    for (let i = 0; i < 180; i++) {
      world.applyGroundForces({
        active: true,
        driveForce: DEFAULT_SIM_CONFIG.locomotion.cruiseDriveForce,
        brakeForce: 0,
        pushImpulse: 0,
        targetYawRate: i < 90 ? 0 : 0.45,
        steerAngle: null,
        rollTorque: 0,
      });
      world.step();
    }

    const velocity = horizontalSpeedInBoardFrame(world);
    expect(world.wheelObservations().filter((wheel) => wheel.inContact)).toHaveLength(4);
    expect(Math.abs(velocity.forward)).toBeGreaterThan(1);
    expect(Math.abs(velocity.lateral)).toBeLessThan(0.35);
    expect(Math.abs(velocity.lateral)).toBeLessThan(Math.abs(velocity.forward) * 0.3);
    world.free();
  });

  it('returns copied plain data instead of controller or body handles', async () => {
    const world = await settledWorld(0xc0f1);
    const first = world.wheelObservations();
    const second = world.wheelObservations();

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(Object.keys(first[0]!).sort()).toEqual([
      'contactNormal',
      'contactPoint',
      'id',
      'inContact',
      'lateralSlip',
      'longitudinalSlip',
      'normalLoad',
      'rotation',
      'suspensionCompression',
      'suspensionLength',
    ]);
    expect(first.every((wheel) => Number.isFinite(wheel.rotation))).toBe(true);

    for (let i = 0; i < 60; i++) {
      world.applyGroundForces({
        active: true,
        driveForce: DEFAULT_SIM_CONFIG.locomotion.cruiseDriveForce,
        brakeForce: 0,
        pushImpulse: 0,
        targetYawRate: 0,
        steerAngle: null,
        rollTorque: 0,
      });
      world.step();
    }
    const rolling = world.wheelObservations();
    expect(rolling.some((wheel, i) => Math.abs(wheel.rotation - first[i]!.rotation) > 0.1)).toBe(true);
    // This model has massless pure-rolling wheels, not independent wheel
    // inertia. Do not mislabel forward travel speed as longitudinal slip.
    expect(rolling.every((wheel) => wheel.longitudinalSlip === 0)).toBe(true);
    world.free();
  });
});
