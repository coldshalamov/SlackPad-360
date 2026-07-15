import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { GestureFSM } from '../src/control/GestureFSM';
import type { FeetSample, FeetState, FootState, SegmentState } from '../src/input/FootTracker';
import type { BoardPose } from '../src/sim/SimWorld';

const segment: SegmentState = {
  valid: false,
  angle: 0,
  angleFromRest: 0,
  angVel: 0,
  midpoint: { x: 0.5, y: 0.5 },
  midpointOffsetFromRest: { x: 0, y: 0 },
  midpointVel: { x: 0, y: 0 },
  lengthRatio: 1,
};

function foot(role: 'nose' | 'tail', planted: boolean, vy = 0): FootState {
  return {
    role,
    planted,
    pos: { x: role === 'nose' ? 0.6 : 0.4, y: 0.5 },
    vel: { x: 0, y: vy },
    offsetFromRest: { x: 0, y: 0 },
    contactId: planted ? (role === 'nose' ? 2 : 1) : null,
  };
}

function feet(vy = 0): FeetState {
  return {
    nose: foot('nose', false),
    tail: foot('tail', true, vy),
    segment,
    bothPlanted: false,
    plantCount: 1,
  };
}

const pose: BoardPose = {
  p: { x: 0, y: 1, z: 0 },
  q: { x: 0, y: 0, z: 0, w: 1 },
  lv: { x: 0, y: 1, z: 0 },
  av: { x: 0, y: 0, z: 0 },
};

function samples(): FeetSample[] {
  return [0, 1, 2].map((index) => ({
    frameId: index,
    tPerfMs: 100 + index * 8,
    dtSeconds: 0.008,
    state: feet(2),
  }));
}

describe('high-rate click-plus-gesture recognition', () => {
  it('recognizes a three-sample flick that occurs inside one physics step', () => {
    const fsm = new GestureFSM(DEFAULT_SIM_CONFIG, 1, 'regular');
    const common = {
      feet: feet(),
      footSamples: [] as FeetSample[],
      grounded: true,
      pose,
      contactImpulse: 0,
      supportContactImpulse: 0,
      railProximity: null,
    };

    fsm.update({ ...common, pops: [], step: 0 });
    const popResult = fsm.update({
      ...common,
      pops: [{ step: 1, label: 'ollie', q: 0.6 }],
      step: 1,
    });
    expect(popResult.intent).toMatchObject({
      version: 1,
      base: 'ollie',
      family: 'ollie',
      popSide: 'tail',
      fallback: true,
    });
    fsm.update({ ...common, grounded: false, pops: [], step: 2 });
    const result = fsm.update({
      ...common,
      grounded: false,
      feet: feet(2),
      footSamples: samples(),
      pops: [],
      step: 3,
    });

    expect(result.label?.air?.label).toBe('kickflip');
    expect(result.intent).toMatchObject({
      version: 1,
      base: 'ollie',
      family: 'flip',
      direction: 'heelside',
      label: 'kickflip',
      fallback: false,
      source: { popStep: 1, recognizedStep: 3 },
    });
    expect(result.intent!.gestureSpeed).toBeGreaterThan(0);
    expect(result.intent!.gestureAccuracy).toBeGreaterThan(0.5);
  });
});
