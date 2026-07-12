/**
 * M6 grind test helpers — build synthetic plain-data GrindInputs so the
 * GrindSystem detection/latch/balance logic can be driven directly and
 * deterministically (the same code path the harness runs, but with inputs the
 * test controls precisely — the robust way to exercise the fairness mandate
 * without scripting a full physics rail entry).
 */

import type { BoardPose } from '../../src/sim/SimWorld';
import { nearestRail } from '../../src/sim/rails';
import type { RailDescriptor, RailProximity } from '../../src/sim/rails';
import type { FeetState } from '../../src/input/FootTracker';
import type { GrindInputs } from '../../src/control/GrindSystem';
import { NOSE_POS, TAIL_POS, scriptOllie } from './maneuver';
import type { PadDriver } from './maneuver';

/** A single long straight ledge along +Z at x = 0, top at y = 0.15. */
export const TEST_RAIL: RailDescriptor = {
  id: 'test-ledge',
  topY: 0.15,
  ax: 0,
  az: -10,
  bx: 0,
  bz: 10,
  ledge: true,
};

/** Board-centre ride heights above the rail top for each family (mirror config). */
export const RIDE_Y_FIFTY = TEST_RAIL.topY + 0.085;
export const RIDE_Y_BOARDSLIDE = TEST_RAIL.topY + 0.025;

/** Quaternion for a yaw of `deg` about world up (+Y). */
export function yawQuat(deg: number): { x: number; y: number; z: number; w: number } {
  const h = (deg * Math.PI) / 180 / 2;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

export function makePose(opts: {
  x?: number;
  y?: number;
  z?: number;
  yawDeg?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}): BoardPose {
  return {
    p: { x: opts.x ?? 0, y: opts.y ?? RIDE_Y_FIFTY, z: opts.z ?? 0 },
    q: yawQuat(opts.yawDeg ?? 0),
    lv: { x: opts.vx ?? 0, y: opts.vy ?? 0, z: opts.vz ?? 3 },
    av: { x: 0, y: 0, z: 0 },
  };
}

/** Minimal valid FeetState: both planted, with an optional lateral foot bias. */
export function makeFeet(opts: { bothPlanted?: boolean; latBias?: number; nose?: boolean; tail?: boolean } = {}): FeetState {
  const bias = opts.latBias ?? 0;
  const nosePlanted = opts.nose ?? opts.bothPlanted ?? true;
  const tailPlanted = opts.tail ?? opts.bothPlanted ?? true;
  const foot = (role: 'nose' | 'tail', planted: boolean) => ({
    role,
    planted,
    pos: { x: 0.5 + bias, y: 0.5 },
    vel: { x: 0, y: 0 },
    offsetFromRest: { x: bias, y: 0 },
    contactId: planted ? 1 : null,
  });
  return {
    nose: foot('nose', nosePlanted),
    tail: foot('tail', tailPlanted),
    segment: {
      valid: nosePlanted && tailPlanted,
      angle: 0,
      angleFromRest: 0,
      angVel: 0,
      midpoint: { x: 0.5 + bias, y: 0.5 },
      midpointOffsetFromRest: { x: bias, y: 0 },
      midpointVel: { x: 0, y: 0 },
      lengthRatio: 1,
    },
    bothPlanted: nosePlanted && tailPlanted,
    plantCount: (nosePlanted ? 1 : 0) + (tailPlanted ? 1 : 0),
  };
}

/** Build GrindInputs from a pose + feet + flags, resolving rail proximity for real. */
export function makeInputs(opts: {
  pose: BoardPose;
  feet?: FeetState;
  canLatch?: boolean;
  recentPop?: boolean;
  hopRequested?: boolean;
  contactImpulse?: number;
  step: number;
  rail?: RailDescriptor | null;
}): GrindInputs {
  const railDesc = opts.rail === undefined ? TEST_RAIL : opts.rail;
  const rail: RailProximity | null = railDesc ? nearestRail([railDesc], opts.pose.p.x, opts.pose.p.z) : null;
  return {
    rail,
    pose: opts.pose,
    feet: opts.feet ?? makeFeet(),
    canLatch: opts.canLatch ?? true,
    recentPop: opts.recentPop ?? true,
    hopRequested: opts.hopRequested ?? false,
    contactImpulse: opts.contactImpulse ?? 0,
    step: opts.step,
  };
}

/**
 * Full-pipeline scripted 50-50 on the `grind-lab` ledge: cruise up to speed for a
 * FIXED step count (deterministic — reproducible for the golden), a plain straight
 * ollie (no prep slide, which would steer the approach off the 50-50 envelope),
 * then ride with both feet planted. The board ollies over the ledge front edge
 * and descends onto the top → soft-snap latch → clean 50-50 ride.
 */
export function scriptFiftyFifty(d: PadDriver, opts: { cruiseSteps?: number; rideSteps?: number } = {}): void {
  const cruiseSteps = opts.cruiseSteps ?? 100;
  const rideSteps = opts.rideSteps ?? 90;
  d.cruise(cruiseSteps);
  scriptOllie(d, {}); // plain ollie: q≈0.5 from timing, no yaw-inducing prep slide
  for (let i = 0; i < rideSteps; i++) d.drive({ nose: NOSE_POS, tail: TAIL_POS });
}

/**
 * Full-pipeline scripted BOARDSLIDE on the `grind-lab` ledge: cruise, then an
 * ollie with a gentle nose-prep SLIDE that steers the board ~50° off the rail
 * before takeoff (a bounded ground-steer yaw, NOT the 180°-targeting shuv). The
 * grind approach-align then completes the rotation toward the perpendicular as
 * the board descends onto the low-friction ledge, where the deck SLIDES (keeps
 * speed) → a stable boardslide that the yaw-align holds near 90°.
 */
export function scriptBoardslide(d: PadDriver, opts: { cruiseSteps?: number; rideSteps?: number } = {}): void {
  const cruiseSteps = opts.cruiseSteps ?? 96;
  const rideSteps = opts.rideSteps ?? 90;
  d.cruise(cruiseSteps);
  scriptOllie(d, { prepMoveFrames: 5, prepSpeedPerFrame: 0.12 }); // gentle steer → yawed approach
  for (let i = 0; i < rideSteps; i++) d.drive({ nose: NOSE_POS, tail: TAIL_POS });
}
