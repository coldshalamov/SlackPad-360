import { describe, expect, it } from 'vitest';
import { skateboardTruckSteering } from '../src/sim/skateboardTrucks';

describe('skateboard truck steering model', () => {
  it('keeps both axles neutral when the deck is level', () => {
    expect(
      skateboardTruckSteering({
        leanRad: 0,
        speed: 4,
        frontLoad: 100,
        rearLoad: 100,
        leanToSteer: 1.4,
        maxSteerRad: 0.35,
        speedFade: 0.08,
      }),
    ).toEqual({ front: 0, rear: 0 });
  });

  it('turns front and rear trucks in opposite directions from actual lean', () => {
    const steer = skateboardTruckSteering({
      leanRad: 0.2,
      speed: 2,
      frontLoad: 100,
      rearLoad: 100,
      leanToSteer: 1.4,
      maxSteerRad: 0.35,
      speedFade: 0.08,
    });
    expect(steer.front).toBeGreaterThan(0);
    expect(steer.rear).toBeLessThan(0);
    expect(Math.abs(steer.front)).toBeLessThanOrEqual(0.35);
  });

  it('reduces twitchiness at speed and on an unloaded axle', () => {
    const slow = skateboardTruckSteering({
      leanRad: 0.2,
      speed: 1,
      frontLoad: 100,
      rearLoad: 100,
      leanToSteer: 1.4,
      maxSteerRad: 0.35,
      speedFade: 0.08,
    });
    const fastRearLight = skateboardTruckSteering({
      leanRad: 0.2,
      speed: 8,
      frontLoad: 100,
      rearLoad: 10,
      leanToSteer: 1.4,
      maxSteerRad: 0.35,
      speedFade: 0.08,
    });
    expect(Math.abs(fastRearLight.front)).toBeLessThan(Math.abs(slow.front));
    expect(Math.abs(fastRearLight.rear)).toBeLessThan(Math.abs(fastRearLight.front));
  });
});
