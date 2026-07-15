export interface SkateboardTruckInputs {
  leanRad: number;
  speed: number;
  frontLoad: number;
  rearLoad: number;
  leanToSteer: number;
  maxSteerRad: number;
  speedFade: number;
}

export interface SkateboardTruckSteering {
  front: number;
  rear: number;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Skateboard axles pivot in opposite directions. Steering comes from actual
 * deck lean, softens with speed, and loses authority when an axle unloads.
 */
export function skateboardTruckSteering(
  input: SkateboardTruckInputs,
): SkateboardTruckSteering {
  const maxSteer = Math.max(0, input.maxSteerRad);
  if (maxSteer === 0 || input.leanRad === 0) return { front: 0, rear: 0 };
  const speedScale = 1 / (1 + Math.abs(input.speed) * Math.max(0, input.speedFade));
  const base = clamp(input.leanRad * input.leanToSteer * speedScale, -maxSteer, maxSteer);
  const frontLoad = Math.max(0, input.frontLoad);
  const rearLoad = Math.max(0, input.rearLoad);
  const totalLoad = frontLoad + rearLoad;
  const loadScale = (load: number): number =>
    totalLoad <= 1e-6 ? 1 : clamp((2 * load) / totalLoad, 0, 1.5);
  return {
    front: clamp(base * loadScale(frontLoad), -maxSteer, maxSteer),
    rear: clamp(-base * loadScale(rearLoad), -maxSteer, maxSteer),
  };
}
