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

function tapAndImmediateGestureSamples(
  gestureVelocities: Array<{ x: number; y: number }>,
): FeetSample[] {
  const state = (tailPlanted: boolean, noseVel: { x: number; y: number }): FeetState => ({
    nose: { ...foot('nose', true, noseVel.y), vel: { ...noseVel } },
    tail: foot('tail', tailPlanted),
    segment: tailPlanted ? { ...segment, valid: true } : segment,
    bothPlanted: tailPlanted,
    plantCount: tailPlanted ? 2 : 1,
  });
  const sequence = [
    // Pre-tap movement is deliberately opposite to the intended trick. It
    // must never become post-pop gesture evidence.
    state(true, { x: 0, y: -3 }),
    state(false, { x: 0, y: -3 }),
    state(false, { x: 0, y: -3 }),
    // This replant is the tail retap that resolves the ollie.
    state(true, { x: 0, y: 0 }),
    // The player begins the intended flick immediately, before the board has
    // left the grounded band and before the 60 Hz FSM phase reads `air`.
    ...gestureVelocities.map((velocity) => state(true, velocity)),
  ];
  return sequence.map((sampleState, index) => ({
    frameId: 100 + index,
    tPerfMs: 200 + index * 8,
    dtSeconds: 0.008,
    state: sampleState,
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

  it('keeps only post-retap samples when a flick starts before the air phase', () => {
    const fsm = new GestureFSM(DEFAULT_SIM_CONFIG, 1, 'regular');
    const tapSamples = tapAndImmediateGestureSamples([
      { x: 0, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 1 },
    ]);
    const planted = tapSamples.at(-1)!.state;
    const common = {
      feet: planted,
      grounded: true,
      pose,
      contactImpulse: 0,
      supportContactImpulse: 0,
      railProximity: null,
    };

    fsm.update({ ...common, footSamples: [], pops: [], step: 0 });
    const pop = fsm.update({
      ...common,
      footSamples: tapSamples,
      pops: [{ step: 1, label: 'ollie', q: 0.6 }],
      step: 1,
    });
    expect(pop.phase).toBe('pop');
    expect(pop.label?.air).toBeNull();

    // Liftoff is observed on the next physics step. No new input arrives: the
    // post-retap suffix from the preceding high-rate batch is the only gesture
    // evidence available and must be consumed exactly once now.
    const air = fsm.update({
      ...common,
      grounded: false,
      footSamples: [],
      pops: [],
      step: 2,
    });

    expect(air.phase).toBe('air');
    expect(air.label?.air?.label).toBe('kickflip');
    expect(air.intent).toMatchObject({
      family: 'flip',
      label: 'kickflip',
      fallback: false,
      source: { popStep: 1, recognizedStep: 2 },
    });
    const recognizedAccuracy = air.intent!.gestureAccuracy;

    // Empty later steps must hold the recognized intent, not replay the buffer
    // and grow its path evidence a second time.
    const later = fsm.update({
      ...common,
      feet: tapSamples[3]!.state,
      grounded: false,
      footSamples: [],
      pops: [],
      step: 3,
    });
    expect(later.label?.air?.label).toBe('kickflip');
    expect(later.intent?.gestureAccuracy).toBe(recognizedAccuracy);
  });

  it('keeps an immediate curved sweep through pop-to-air latency', () => {
    const fsm = new GestureFSM(DEFAULT_SIM_CONFIG, 1, 'regular');
    const sweep = Array.from({ length: 7 }, (_, index) => {
      const angle = Math.PI * 0.9 * (index / 6);
      return { x: 3 * Math.cos(angle), y: 3 * Math.sin(angle) };
    });
    const tapSamples = tapAndImmediateGestureSamples(sweep);
    const common = {
      feet: tapSamples.at(-1)!.state,
      grounded: true,
      pose,
      contactImpulse: 0,
      supportContactImpulse: 0,
      railProximity: null,
    };

    fsm.update({ ...common, footSamples: [], pops: [], step: 0 });
    fsm.update({
      ...common,
      footSamples: tapSamples,
      pops: [{ step: 1, label: 'ollie', q: 0.6 }],
      step: 1,
    });
    const air = fsm.update({
      ...common,
      grounded: false,
      footSamples: [],
      pops: [],
      step: 2,
    });

    expect(air.phase).toBe('air');
    expect(air.label?.air?.label).toBe('bs-shuv');
    expect(air.intent).toMatchObject({
      family: 'shuv',
      label: 'bs-shuv',
      fallback: false,
      source: { popStep: 1, recognizedStep: 2 },
    });
  });
});
