/**
 * grindLatchImpulse (M6) — the pure soft-snap force maths that SimWorld applies.
 * Unit-tested in isolation because the whole boardslide question ("does a board
 * yawed ~90° across a thin rail RIDE, or pivot off?") is a property of THIS force
 * — the yaw-alignment torque (the orientation analog of the lateral spring) — and
 * scripting a pixel-perfect physics entry to observe it is brittle.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import type { Quat } from '@slackpad/shared';
import { grindLatchImpulse } from '../src/sim/grindForces';
import type { GrindLatchParams } from '../src/sim/grindForces';

const G = DEFAULT_SIM_CONFIG.grind;
const HZ = DEFAULT_SIM_CONFIG.physics.hz;
const MASS = DEFAULT_SIM_CONFIG.physics.boardMass;

// Rail along +Z: tangent +Z, perpendicular +X.
const AXIS = { x: 0, y: 0, z: 1 };
const PERP = { x: 1, y: 0, z: 0 };

/** Quaternion for heading `deg` about world up (+Y). */
function yawQ(deg: number): Quat {
  const h = (deg * Math.PI) / 180 / 2;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}
/** Heading (deg) of board +Z about +Y. */
function headingDeg(q: Quat): number {
  const fx = 2 * (q.x * q.z + q.w * q.y);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  return (Math.atan2(fx, fz) * 180) / Math.PI;
}

function params(over: Partial<GrindLatchParams> = {}): GrindLatchParams {
  return {
    family: 'fifty-fifty',
    approachOnly: false,
    axis: AXIS,
    perp: PERP,
    lateralOffset: 0,
    springGain: G.latchLateralSpring[1],
    balanceLateral: 0,
    ...over,
  };
}

describe('grindLatchImpulse — yaw alignment', () => {
  it('a boardslide yawed below 90° gets a torque that INCREASES heading toward 90°', () => {
    const r = grindLatchImpulse(
      { q: yawQ(65), lv: { x: 0, y: 0, z: 3 }, av: { x: 0, y: 0, z: 0 } },
      params({ family: 'boardslide' }),
      G, MASS, HZ,
    );
    expect(r.yaw).toBeGreaterThan(0); // +Y torque raises heading toward the +X (90°) target
  });

  it('a boardslide yawed above 90° gets a torque that DECREASES heading toward 90°', () => {
    const r = grindLatchImpulse(
      { q: yawQ(115), lv: { x: 0, y: 0, z: 3 }, av: { x: 0, y: 0, z: 0 } },
      params({ family: 'boardslide' }),
      G, MASS, HZ,
    );
    expect(r.yaw).toBeLessThan(0);
  });

  it('an aligned 50-50 (heading 0, parallel target) gets ~zero yaw torque (stays stable)', () => {
    const r = grindLatchImpulse(
      { q: yawQ(0), lv: { x: 0, y: 0, z: 3 }, av: { x: 0, y: 0, z: 0 } },
      params({ family: 'fifty-fifty' }),
      G, MASS, HZ,
    );
    expect(Math.abs(r.yaw)).toBeLessThan(1e-6);
  });

  it('L0 (springGain 0) applies NO yaw alignment (pure physics)', () => {
    const r = grindLatchImpulse(
      { q: yawQ(65), lv: { x: 0, y: 0, z: 3 }, av: { x: 0, y: 0, z: 0 } },
      params({ family: 'boardslide', springGain: 0 }),
      G, MASS, HZ,
    );
    expect(r.yaw).toBe(0);
  });

  it('RIDES: a yawed, spinning boardslide converges to ~90° and holds (does not pivot off)', () => {
    // 1-DOF yaw integrator using the REAL force each step. I_yaw for a 0.8×0.2 deck.
    const L = DEFAULT_SIM_CONFIG.physics.boardLength;
    const W = DEFAULT_SIM_CONFIG.physics.boardWidth;
    const Iyaw = (MASS * (L * L + W * W)) / 12;
    const dt = 1 / HZ;
    let theta = 72; // entered a bit shy of 90°
    let omega = -2.0; // and still spinning the wrong way
    const headings: number[] = [];
    for (let s = 0; s < 120; s++) {
      const q = yawQ(theta);
      const { yaw } = grindLatchImpulse(
        { q, lv: { x: 0, y: 0, z: 3 }, av: { x: 0, y: omega, z: 0 } },
        params({ family: 'boardslide' }),
        G, MASS, HZ,
      );
      omega += yaw / Iyaw; // apply the torque impulse
      theta += (omega * dt * 180) / Math.PI;
      headings.push(theta);
    }
    const settled = headings.slice(-30);
    for (const h of settled) {
      // Stays within the boardslide envelope of 90° the whole tail — it RIDES.
      expect(Math.abs(h - 90)).toBeLessThan(G.boardslideEnvelopeDeg);
    }
    // And actually converged near 90° (not merely bounded).
    const mean = settled.reduce((a, b) => a + b, 0) / settled.length;
    expect(Math.abs(mean - 90)).toBeLessThan(6);
  });

  it('damps a fast entry spin into the boardslide envelope through the landing window', () => {
    const L = DEFAULT_SIM_CONFIG.physics.boardLength;
    const W = DEFAULT_SIM_CONFIG.physics.boardWidth;
    const Iyaw = (MASS * (L * L + W * W)) / 12;
    const dt = 1 / HZ;
    // Candidate assistance begins only after the free-spinning board enters
    // the boardslide family (~55 degrees), not at takeoff.
    let theta = -55;
    let omega = -6;
    const acuteHeadings: number[] = [];
    for (let s = 0; s < 42; s++) {
      const { yaw } = grindLatchImpulse(
        { q: yawQ(theta), lv: { x: 0, y: 0, z: 5 }, av: { x: 0, y: omega, z: 0 } },
        params({ family: 'boardslide', approachOnly: true }),
        G,
        MASS,
        HZ,
      );
      omega += yaw / Iyaw;
      theta += (omega * dt * 180) / Math.PI;
      const wrapped = ((theta % 180) + 180) % 180;
      acuteHeadings.push(Math.min(wrapped, 180 - wrapped));
    }

    // This is the descending/contact part of the scripted approach. Alignment
    // must not oscillate back out of the boardslide family before the rail hit.
    for (const acute of acuteHeadings.slice(26)) expect(acute).toBeGreaterThan(52);
  });

  it('WITHOUT alignment (L0, springGain 0) the same spinning board PIVOTS OFF — the fix is load-bearing', () => {
    const dt = 1 / HZ;
    const L = DEFAULT_SIM_CONFIG.physics.boardLength;
    const W = DEFAULT_SIM_CONFIG.physics.boardWidth;
    const Iyaw = (MASS * (L * L + W * W)) / 12;
    let theta = 72;
    let omega = -2.0;
    for (let s = 0; s < 60; s++) {
      const { yaw } = grindLatchImpulse(
        { q: yawQ(theta), lv: { x: 0, y: 0, z: 3 }, av: { x: 0, y: omega, z: 0 } },
        params({ family: 'boardslide', springGain: 0 }), // no yaw alignment
        G, MASS, HZ,
      );
      omega += yaw / Iyaw;
      theta += (omega * dt * 180) / Math.PI;
    }
    // No restoring torque → it just keeps rotating away, out of the envelope.
    expect(Math.abs(theta - 90)).toBeGreaterThan(G.boardslideEnvelopeDeg);
  });
});

describe('grindLatchImpulse — positional (latched only)', () => {
  it('a latched board off-centre gets a RESTORING lateral impulse toward the centre-line', () => {
    const r = grindLatchImpulse(
      { q: yawQ(0), lv: { x: 0, y: 0, z: 3 }, av: { x: 0, y: 0, z: 0 } },
      params({ lateralOffset: 0.06 }), // +perp (+X) off-centre
      G, MASS, HZ,
    );
    expect(r.lin.x).toBeLessThan(0); // pushed back toward -X (the centre-line)
  });

  it('tangent drag opposes along-rail motion so the grind speed-ends', () => {
    const r = grindLatchImpulse(
      { q: yawQ(0), lv: { x: 0, y: 0, z: 4 }, av: { x: 0, y: 0, z: 0 } },
      params({ lateralOffset: 0 }),
      G, MASS, HZ,
    );
    expect(r.lin.z).toBeLessThan(0); // opposes +Z travel
  });

  it('APPROACH-ONLY applies zero positional force (no magnetism), only yaw help', () => {
    const r = grindLatchImpulse(
      { q: yawQ(70), lv: { x: 0, y: 0, z: 3 }, av: { x: 0, y: 0, z: 0 } },
      params({ family: 'boardslide', approachOnly: true, lateralOffset: 0.2 }),
      G, MASS, HZ,
    );
    expect(r.lin.x).toBe(0);
    expect(r.lin.z).toBe(0);
    expect(Math.abs(r.yaw)).toBeGreaterThan(0); // orientation help still applies
  });
});

// Sanity: the heading helper matches the yaw convention the force uses.
it('heading helper sanity', () => {
  expect(headingDeg(yawQ(90))).toBeCloseTo(90, 3);
});
