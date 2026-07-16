import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { BoardController } from '../src/control/BoardController';
import type { FeetState, FootState } from '../src/input/FootTracker';

function feet(midpointForwardSpeed: number): FeetState {
  const foot = (role: 'nose' | 'tail'): FootState => ({
    role,
    planted: true,
    pos: { x: role === 'nose' ? 0.58 : 0.42, y: 0.5 },
    vel: { x: 0, y: -midpointForwardSpeed },
    offsetFromRest: { x: 0, y: 0 },
    contactId: role === 'nose' ? 1 : 2,
  });
  return {
    nose: foot('nose'),
    tail: foot('tail'),
    bothPlanted: true,
    plantCount: 2,
    segment: {
      valid: true,
      angle: 0,
      angleFromRest: 0,
      angVel: 0,
      midpoint: { x: 0.5, y: 0.5 },
      midpointOffsetFromRest: { x: 0, y: 0 },
      midpointVel: { x: 0, y: -midpointForwardSpeed },
      lengthRatio: 1,
    },
  };
}

function controller(): BoardController {
  return new BoardController(DEFAULT_SIM_CONFIG.locomotion, DEFAULT_SIM_CONFIG.physics, {
    stance: 'regular',
    bothClickMeans: 'ollie',
  });
}

describe('Tech Deck riding contract', () => {
  it('does not ghost-drive when both fingers are merely resting on the pad', () => {
    expect(controller().applyGroundControl(feet(0), [], true, 1).driveForce).toBe(0);
  });

  it('finger swipes never accelerate without Ctrl', () => {
    const c = controller();
    const forward = c.applyGroundControl(feet(0.35), [], true, 1).driveForce;
    const backward = c.applyGroundControl(feet(-0.35), [], true, 2).driveForce;
    expect(forward).toBe(0);
    expect(backward).toBe(0);
  });

  it('uses the explicit Ctrl action as predictable beginner acceleration', () => {
    const planted = feet(0) as FeetState & { accelerating: boolean };
    planted.accelerating = true;
    const firstStroke = controller().applyGroundControl(planted, [], true, 1).driveForce;
    expect(firstStroke).toBeGreaterThan(0);
    expect(firstStroke).toBeLessThan(DEFAULT_SIM_CONFIG.locomotion.accelerationStrokePeakForce);
  });

  it('coasts instead of auto-braking whenever grounded Ctrl is released', () => {
    expect(controller().applyGroundControl(feet(0), [], true, 1).brakeForce).toBe(0);
    const planted = feet(0) as FeetState & { accelerating: boolean };
    planted.accelerating = true;
    expect(controller().applyGroundControl(planted, [], true, 2).brakeForce).toBe(0);
  });

  it('turns held Ctrl into eased push strokes with a real coast gap', () => {
    const c = controller();
    const planted = feet(0) as FeetState & { accelerating: boolean };
    planted.accelerating = true;
    const forces: number[] = [];
    for (let step = 0; step < DEFAULT_SIM_CONFIG.locomotion.accelerationCadenceSteps; step++) {
      forces.push(c.applyGroundControl(planted, [], true, step).driveForce);
    }

    expect(forces.some((force) => force === 0)).toBe(true);
    expect(forces.some((force) => force > DEFAULT_SIM_CONFIG.locomotion.cruiseDriveForce)).toBe(true);
    expect(Math.max(...forces)).toBeLessThanOrEqual(
      DEFAULT_SIM_CONFIG.locomotion.accelerationStrokePeakForce,
    );
    expect(forces[0]).toBeLessThan(Math.max(...forces) * 0.35);
  });
});
