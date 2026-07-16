/**
 * S2 perceptual contract — RELATIVE steering (reviews/03 design law #1–#3).
 *
 * Landed red→green inside Sprint 02 S2: these pin the new steering spec.
 *  - Standstill pivot: rotating planted fingers pivots the deck in place —
 *    no speed gate on yaw authority.
 *  - Ratchet: lift, re-plant, keep turning accumulates heading by
 *    construction; the re-plant itself never snaps the board.
 *  - Anchor release: heading holds where the fingers left it.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { settled } from '../helpers/maneuver';
import type { PadDriver } from '../helpers/maneuver';
import { pairAt, yawRad } from '../feel/scenarios';

const HZ = DEFAULT_SIM_CONFIG.physics.hz;
const GAIN = DEFAULT_SIM_CONFIG.locomotion.steerDirectGain;

function unwrappedYawDeg(d: PadDriver, prev: { yaw: number; acc: number }): number {
  const yaw = yawRad(d.harness.observe().board.q);
  let dy = yaw - prev.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy <= -Math.PI) dy += Math.PI * 2;
  prev.acc += dy;
  prev.yaw = yaw;
  return (prev.acc * 180) / Math.PI;
}

function tracker(d: PadDriver): { yaw: number; acc: number } {
  return { yaw: yawRad(d.harness.observe().board.q), acc: 0 };
}

/** Rotate the planted pair `totalDeg` at 200°/s, driving each step. */
function rotate(d: PadDriver, totalDeg: number, track: { yaw: number; acc: number }): number {
  const steps = Math.ceil(Math.abs(totalDeg) / (200 / HZ));
  let out = 0;
  for (let k = 0; k < steps; k++) {
    const a = Math.sign(totalDeg) * Math.min(Math.abs(totalDeg), (200 / HZ) * (k + 1));
    d.drive(pairAt((a * Math.PI) / 180));
    out = unwrappedYawDeg(d, track);
  }
  return out;
}

describe('contract: relative steering (S2)', () => {
  it('standstill pivot: planted finger rotation turns the deck in place', async () => {
    const d = await settled(0x51e11);
    for (let i = 0; i < 30; i++) d.drive({ ...pairAt(0), auxiliary: false });
    const p0 = { ...d.harness.observe().board.p };
    const track = tracker(d);
    rotate(d, 45, track);
    let final = 0;
    for (let i = 0; i < 30; i++) {
      d.drive(pairAt((45 * Math.PI) / 180));
      final = unwrappedYawDeg(d, track);
    }
    expect(Math.abs(final - -45 * GAIN)).toBeLessThan(6);
    // The board never translated: pivot, not orbit.
    const p1 = d.harness.observe().board.p;
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(0.6);
  });

  it('ratchet: two 45° grips accumulate ~99° — the re-plant never snaps back', async () => {
    const d = await settled(0x51e12);
    for (let i = 0; i < 30; i++) d.drive({ ...pairAt(0), auxiliary: false });
    const track = tracker(d);
    rotate(d, 45, track);
    for (let i = 0; i < 6; i++) d.drive(pairAt((45 * Math.PI) / 180));
    let afterFirst = unwrappedYawDeg(d, track);

    // Lift BOTH (slower than motionTapMaxLiftMs so it can never read as a
    // pop), re-plant at neutral, verify no snap, then keep turning.
    for (let i = 0; i < 20; i++) d.drive({ nose: null, tail: null });
    for (let i = 0; i < 6; i++) d.drive(pairAt(0));
    const afterReplant = unwrappedYawDeg(d, track);
    expect(Math.abs(afterReplant - afterFirst)).toBeLessThan(3);

    rotate(d, 45, track);
    let final = afterReplant;
    for (let i = 0; i < 30; i++) {
      d.drive(pairAt((45 * Math.PI) / 180));
      final = unwrappedYawDeg(d, track);
    }
    expect(Math.abs(final - -90 * GAIN)).toBeLessThan(8);
    expect(afterFirst).toBeLessThan(-35); // first grip really turned
  });

  it('releasing the fingers holds the heading where they left it', async () => {
    const d = await settled(0x51e13);
    for (let i = 0; i < 30; i++) d.drive({ ...pairAt(0), auxiliary: false });
    const track = tracker(d);
    rotate(d, 30, track);
    for (let i = 0; i < 6; i++) d.drive(pairAt((30 * Math.PI) / 180));
    const atRelease = unwrappedYawDeg(d, track);
    let after = atRelease;
    for (let i = 0; i < 60; i++) {
      d.drive({ nose: null, tail: null });
      after = unwrappedYawDeg(d, track);
    }
    expect(Math.abs(after - atRelease)).toBeLessThan(3);
  });
});
