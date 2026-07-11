/**
 * Ground locomotion (M3), driven ONLY by injecting synthetic ContactFrames
 * through the AgentHarness (inject-only — no pose/impulse shortcuts):
 *   (a) dual-plant cruise → forward speed rises and saturates ≤ maxGroundSpeed
 *   (b) push pulses add speed, capped at maxGroundSpeed
 *   (c) segment rotation → board yaw with the correct sign for BOTH stances
 *   (d) no ground forces while airborne (spawn drop)
 *   (e) mutated steering-sign regression guard (BoardController command sign)
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import type { Contact, InputProfile } from '@slackpad/shared';
import { AgentHarness } from '../src/agent/AgentHarness';
import type { InjectableFrame } from '../src/agent/AgentHarness';
import { BoardController } from '../src/control/BoardController';
import type { FeetState, SegmentState } from '../src/input/FootTracker';
import { rotateAboutCenter } from '../src/input/FootTracker';

const DT_MS = 1000 / DEFAULT_SIM_CONFIG.physics.hz;
const MAX = DEFAULT_SIM_CONFIG.physics.maxGroundSpeed;

let fid = 0;
function plantFrame(step: number, contacts: Contact[], primary = false): InjectableFrame {
  return {
    schemaVersion: 1,
    frameId: fid++,
    tPerfMs: step * DT_MS,
    contacts,
    buttons: { primary, secondary: false, auxiliary: false },
  };
}

const REST: Contact[] = [
  { id: 1, x: 0.4, y: 0.5, tip: true, confidence: true },
  { id: 2, x: 0.6, y: 0.5, tip: true, confidence: true },
];

function hSpeed(h: AgentHarness): number {
  const lv = h.observe().board.lv;
  return Math.hypot(lv.x, lv.z);
}

async function grounded(seed = 0x10c0): Promise<AgentHarness> {
  const h = new AgentHarness();
  await h.reset(seed, 'flat-dev');
  h.step(60); // drop from spawnHeight and settle onto the ground
  return h;
}

describe('ground locomotion (a) cruise', () => {
  it('holding both feet accelerates forward and saturates below maxGroundSpeed', async () => {
    const h = await grounded();
    let speed = 0;
    for (let i = 0; i < 180; i++) {
      h.injectContactFrame(plantFrame(60 + i, REST));
      h.step(1);
      speed = hSpeed(h);
    }
    // ~4 m/s target within ~3 s, never over the hard cap.
    expect(speed).toBeGreaterThan(3.5);
    expect(speed).toBeLessThanOrEqual(MAX + 0.5);

    // Saturation: another second adds little.
    let speed2 = speed;
    for (let i = 0; i < 60; i++) {
      h.injectContactFrame(plantFrame(240 + i, REST));
      h.step(1);
      speed2 = hSpeed(h);
    }
    expect(Math.abs(speed2 - speed)).toBeLessThan(0.6);
  });
});

describe('ground locomotion (b) push pulses', () => {
  it('a push adds a readable speed increment and pushes stay capped', async () => {
    const h = await grounded();
    // Cruise to terminal so cruise per-step drive is ~0 and the push jump is clean.
    for (let i = 0; i < 150; i++) {
      h.injectContactFrame(plantFrame(60 + i, REST));
      h.step(1);
    }
    const before = hSpeed(h);
    // Kick with both planted (rising edge on primary) → push pulse. Since M4
    // the KickArbiter holds a both-planted kick for popLookaheadMs (the
    // push-vs-ollie forgiveness window) before releasing it as a push, so keep
    // both feet planted through the window and measure after it resolves.
    h.injectContactFrame(plantFrame(210, REST, true));
    h.step(1);
    for (let i = 0; i < 6; i++) {
      h.injectContactFrame(plantFrame(211 + i, REST));
      h.step(1);
    }
    const after = hSpeed(h);
    const dv = DEFAULT_SIM_CONFIG.physics.pushImpulse / DEFAULT_SIM_CONFIG.physics.boardMass;
    expect(after - before).toBeGreaterThan(dv * 0.6); // ~1.2 m/s, minus a little drag
    expect(after - before).toBeLessThan(dv * 1.2);

    // Hammer pushes past the cap: speed climbs but never exceeds maxGroundSpeed.
    let step = 217;
    let primary = false;
    for (let p = 0; p < 12; p++) {
      // toggle primary to make repeated rising edges, spaced by the cooldown
      for (let k = 0; k < 15; k++) {
        primary = k === 1; // one rising edge per 15-step block
        h.injectContactFrame(plantFrame(step, REST, primary));
        h.step(1);
        step += 1;
      }
    }
    expect(hSpeed(h)).toBeGreaterThan(5);
    expect(hSpeed(h)).toBeLessThanOrEqual(MAX + 0.5);
  });
});

describe('ground locomotion (c) steering sign', () => {
  async function yawAfterRotation(stance: InputProfile['stance'], dir: 1 | -1): Promise<number> {
    const h = new AgentHarness(DEFAULT_SIM_CONFIG, () => ({ ...DEFAULT_SIM_CONFIG_PROFILE, stance }));
    await h.reset(0x5411, 'flat-dev');
    h.step(60);
    // Build forward speed.
    for (let i = 0; i < 90; i++) {
      h.injectContactFrame(plantFrame(60 + i, REST));
      h.step(1);
    }
    // Continuously rotate the segment (CCW when dir=+1) to sustain angular vel.
    let step = 150;
    for (let j = 1; j <= 30; j++) {
      const deg = dir * j * 2; // cumulative rotation
      const contacts = REST.map((c) => {
        const r = rotateAboutCenter(c.x, c.y, deg);
        return { ...c, x: r.x, y: r.y };
      });
      h.injectContactFrame(plantFrame(step, contacts));
      h.step(1);
      step += 1;
    }
    return h.observe().board.av.y;
  }

  it('regular: CCW rotation yaws left (av.y < 0), CW yaws right (av.y > 0)', async () => {
    expect(await yawAfterRotation('regular', 1)).toBeLessThan(-0.05);
    expect(await yawAfterRotation('regular', -1)).toBeGreaterThan(0.05);
  });

  it('goofy inverts the steering sign', async () => {
    expect(await yawAfterRotation('goofy', 1)).toBeGreaterThan(0.05);
    expect(await yawAfterRotation('goofy', -1)).toBeLessThan(-0.05);
  });
});

describe('ground locomotion (d) airborne', () => {
  it('applies no ground drive while the board is still falling', async () => {
    const h = new AgentHarness();
    await h.reset(0xa15, 'flat-dev');
    // First steps: board is high above the ground (airborne). Cruise+kick input
    // must be ignored (isGrounded false → idle command).
    for (let i = 0; i < 12; i++) {
      h.injectContactFrame(plantFrame(i, REST, i === 2));
      h.step(1);
    }
    const obs = h.observe();
    expect(obs.board.p.y).toBeGreaterThan(0.2); // still clearly in the air
    expect(Math.hypot(obs.board.lv.x, obs.board.lv.z)).toBeLessThan(0.2); // no horizontal drive
  });
});

// --- (e) mutated steering-sign regression guard (unit, no Rapier) -----------
const DEFAULT_SIM_CONFIG_PROFILE: InputProfile = {
  stance: 'regular',
  padYawOffset: 0,
  swapFeet: false,
  assistLevel: 1,
  bothClickMeans: 'push',
  tapToClickIsKick: true,
  accessibility: { reducedMotion: false, highContrastHud: false },
};

function segment(angVel: number): SegmentState {
  return {
    valid: true,
    angle: 0,
    angleFromRest: 0,
    angVel,
    midpoint: { x: 0.5, y: 0.5 },
    midpointOffsetFromRest: { x: 0, y: 0 },
    midpointVel: { x: 0, y: 0 },
    lengthRatio: 1,
  };
}

function feet(angVel: number): FeetState {
  const foot = (role: 'nose' | 'tail') => ({
    role,
    planted: true,
    pos: { x: 0.5, y: 0.5 },
    vel: { x: 0, y: 0 },
    offsetFromRest: { x: 0, y: 0 },
    contactId: role === 'nose' ? 1 : 2,
  });
  return { nose: foot('nose'), tail: foot('tail'), segment: segment(angVel), bothPlanted: true, plantCount: 2 };
}

describe('ground locomotion (e) steering-sign guard', () => {
  const make = (stance: InputProfile['stance']) =>
    new BoardController(DEFAULT_SIM_CONFIG.locomotion, DEFAULT_SIM_CONFIG.physics, {
      stance,
      bothClickMeans: 'push',
    });

  it('regular: +angVel (CCW) → negative (left) targetYawRate; −angVel → positive', () => {
    expect(make('regular').applyGroundControl(feet(1), [], true, 0).targetYawRate).toBeLessThan(0);
    expect(make('regular').applyGroundControl(feet(-1), [], true, 0).targetYawRate).toBeGreaterThan(0);
  });

  it('goofy: sign is inverted vs regular', () => {
    expect(make('goofy').applyGroundControl(feet(1), [], true, 0).targetYawRate).toBeGreaterThan(0);
    expect(make('goofy').applyGroundControl(feet(-1), [], true, 0).targetYawRate).toBeLessThan(0);
  });

  it('airborne → no command (targetYawRate 0, inactive)', () => {
    const cmd = make('regular').applyGroundControl(feet(1), [], false, 0);
    expect(cmd.active).toBe(false);
    expect(cmd.targetYawRate).toBe(0);
  });
});
