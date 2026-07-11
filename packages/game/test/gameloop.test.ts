/**
 * GameLoop accumulator semantics — pinned by unit test since every later
 * milestone builds on this loop. Uses tick(nowMs) directly (no rAF).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { GameLoop } from '../src/app/GameLoop';

const DT = 1000 / DEFAULT_SIM_CONFIG.physics.hz; // 16.667ms
const CAP = DEFAULT_SIM_CONFIG.runtime.loop.maxStepsPerFrame;
const MAX_FRAME = DEFAULT_SIM_CONFIG.runtime.loop.maxFrameMs;

interface Recorded {
  steps: number;
  alphas: number[];
  saturatedMs: number[];
}

function makeLoop(): { loop: GameLoop; rec: Recorded } {
  const rec: Recorded = { steps: 0, alphas: [], saturatedMs: [] };
  const loop = new GameLoop(
    {
      onStep: () => {
        rec.steps += 1;
      },
      onRender: (alpha) => {
        rec.alphas.push(alpha);
      },
      onSaturated: (dropped) => {
        rec.saturatedMs.push(dropped);
      },
    },
    DEFAULT_SIM_CONFIG,
  );
  // Establish lastMs without stepping (loop not started via rAF in tests).
  loop.tick(0);
  rec.steps = 0;
  rec.alphas.length = 0;
  return { loop, rec };
}

describe('GameLoop', () => {
  it('steps once per fixed dt at a steady 60 Hz cadence', () => {
    const { loop, rec } = makeLoop();
    for (let i = 1; i <= 60; i++) loop.tick(i * DT);
    // Float rounding may leave the final step one ulp short of draining.
    expect(rec.steps).toBeGreaterThanOrEqual(59);
    expect(rec.steps).toBeLessThanOrEqual(60);
  });

  it('alpha stays in [0, 1) always — including under sustained throttling', () => {
    const { loop, rec } = makeLoop();
    // Simulate 2 seconds of 4 fps rAF throttling (250ms callbacks).
    for (let i = 1; i <= 8; i++) loop.tick(i * 250);
    // Then recovery at 60 Hz.
    for (let i = 1; i <= 30; i++) loop.tick(2000 + i * DT);
    for (const a of rec.alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  it('discards backlog beyond the step cap instead of fast-forwarding after throttling', () => {
    const { loop, rec } = makeLoop();
    // One long stall folded to maxFrameMs, draining at most CAP steps.
    loop.tick(5000);
    expect(rec.steps).toBe(CAP);
    expect(rec.saturatedMs.length).toBe(1);
    // Next normal frame: at most one or two steps — NOT a burst catching up
    // the dropped backlog (i.e. accumulated debt was discarded).
    const before = rec.steps;
    loop.tick(5000 + DT);
    expect(rec.steps - before).toBeLessThanOrEqual(2);
  });

  it('clamps a single stall to maxFrameMs of intake', () => {
    const { loop, rec } = makeLoop();
    loop.tick(60_000); // a minute-long stall
    // Intake capped at maxFrameMs → at most cap steps + saturation drop.
    expect(rec.steps).toBeLessThanOrEqual(Math.min(CAP, Math.floor(MAX_FRAME / DT)));
  });

  it('folds negative elapsed (clock adjustment) to zero instead of corrupting state', () => {
    const { loop, rec } = makeLoop();
    loop.tick(100);
    const before = rec.steps;
    loop.tick(50); // clock went backwards
    expect(rec.steps).toBe(before);
    // Recovers normally afterwards.
    loop.tick(50 + DT * 2);
    expect(rec.steps).toBeGreaterThan(before);
  });
});
