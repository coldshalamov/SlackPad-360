/**
 * S1 perceptual contract — steering direction (reviews/03 §Stage 0.1).
 *
 * Pins the sign chain finger-line rotation → world yaw through the REAL
 * pipeline. Repo convention (BoardController boundary, ground-locomotion (c)):
 * calibrated pad angle is negated exactly once, so a POSITIVE pad segment
 * rotation (nose contact toward +y, i.e. toward the player's palm — the
 * physical clockwise hand rotation seen from above) yields NEGATIVE world yaw
 * (the physical clockwise board turn under the side-on/behind camera frame).
 * Fingers and board turn the same physical way; the code signs pinned here are
 * the implementation of that statement.
 *
 * CURRENT-BEHAVIOR contracts: they pass on the untouched build (rolling above
 * rideMotionFullSpeed) and must survive the S2 relative-steering rework
 * unchanged — S2 alters authority/latency, never direction.
 */

import { describe, expect, it } from 'vitest';
import { settled, settledProfiled } from '../helpers/maneuver';
import type { PadDriver } from '../helpers/maneuver';
import { pairAt, yawRad } from '../feel/scenarios';

const HZ = 60;

/** Rotate the planted pair by `totalDeg` at 200°/s while rolling; Δyaw deg. */
async function rollingRotationYawDelta(
  d: PadDriver,
  totalDeg: number,
): Promise<number> {
  for (let i = 0; i < 30; i++) d.drive({ ...pairAt(0), auxiliary: false });
  for (let i = 0; i < 150; i++) d.drive({ ...pairAt(0), auxiliary: true });
  const y0 = yawRad(d.harness.observe().board.q);
  const steps = Math.ceil(Math.abs(totalDeg) / (200 / HZ));
  let angle = 0;
  for (let k = 0; k < steps; k++) {
    angle = Math.sign(totalDeg) * Math.min(Math.abs(totalDeg), (200 / HZ) * (k + 1));
    d.drive(pairAt((angle * Math.PI) / 180));
  }
  for (let i = 0; i < 51; i++) d.drive(pairAt((angle * Math.PI) / 180));
  const y1 = yawRad(d.harness.observe().board.q);
  let delta = y1 - y0;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return (delta * 180) / Math.PI;
}

describe('contract: steering direction', () => {
  it('positive pad rotation turns the board to negative world yaw', async () => {
    const d = await settled(0xc0de1);
    const deltaDeg = await rollingRotationYawDelta(d, 30);
    expect(deltaDeg).toBeLessThan(-8);
  });

  it('negative pad rotation turns the board to positive world yaw', async () => {
    const d = await settled(0xc0de2);
    const deltaDeg = await rollingRotationYawDelta(d, -30);
    expect(deltaDeg).toBeGreaterThan(8);
  });

  it('goofy stance preserves the rotation direction mapping', async () => {
    // The stance offset flips which end is the nose, not which way a hand
    // rotation turns the board.
    const reg = await rollingRotationYawDelta(await settled(0xc0de3), 30);
    const goo = await rollingRotationYawDelta(
      await settledProfiled(0xc0de3, { stance: 'goofy' }),
      30,
    );
    expect(Math.sign(goo)).toBe(Math.sign(reg));
    expect(goo).toBeLessThan(-8);
  });

  it('translating both fingers together does not steer', async () => {
    const d = await settled(0xc0de4);
    for (let i = 0; i < 30; i++) d.drive({ ...pairAt(0), auxiliary: false });
    for (let i = 0; i < 150; i++) d.drive({ ...pairAt(0), auxiliary: true });
    const y0 = yawRad(d.harness.observe().board.q);
    const base = pairAt(0);
    for (let k = 1; k <= 20; k++) {
      const dx = 0.005 * k;
      d.drive({
        nose: { x: base.nose.x + dx, y: base.nose.y },
        tail: { x: base.tail.x + dx, y: base.tail.y },
      });
    }
    for (let i = 0; i < 40; i++) {
      d.drive({
        nose: { x: base.nose.x + 0.1, y: base.nose.y },
        tail: { x: base.tail.x + 0.1, y: base.tail.y },
      });
    }
    const y1 = yawRad(d.harness.observe().board.q);
    let delta = y1 - y0;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    expect(Math.abs((delta * 180) / Math.PI)).toBeLessThan(3);
  });
});
