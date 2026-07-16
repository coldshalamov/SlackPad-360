/**
 * Ground locomotion (M3), driven ONLY by injecting synthetic ContactFrames
 * through the AgentHarness (inject-only — no pose/impulse shortcuts):
 *   (a) dual-plant cruise → forward speed rises and saturates ≤ maxGroundSpeed
 *   (b) push pulses add speed, capped at maxGroundSpeed
 *   (c) absolute two-finger segment angle → absolute board heading
 *   (d) no ground forces while airborne (spawn drop)
 *   (e) mutated steering-sign regression guard (BoardController command sign)
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_INPUT_PROFILE, DEFAULT_SIM_CONFIG } from "@slackpad/shared";
import type { Contact, InputProfile } from "@slackpad/shared";
import { AgentHarness } from "../src/agent/AgentHarness";
import type { InjectableFrame } from "../src/agent/AgentHarness";
import { BoardController } from "../src/control/BoardController";
import type { FeetState, SegmentState } from "../src/input/FootTracker";

const DT_MS = 1000 / DEFAULT_SIM_CONFIG.physics.hz;
const MAX = DEFAULT_SIM_CONFIG.physics.maxGroundSpeed;

let fid = 0;
function plantFrame(
  step: number,
  contacts: Contact[],
  primary = false,
  auxiliary = true,
): InjectableFrame {
  return {
    schemaVersion: 1,
    frameId: fid++,
    tPerfMs: step * DT_MS,
    contacts,
    buttons: { primary, secondary: false, auxiliary },
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

// These suites exercise the M3/M4 plant-mask push semantics (both-planted
// click → push after the lookahead). Hardware defaults to an ollie on a
// both-planted click, so pin the explicit push profile here.
const PLANT_MASK_PROFILE = () => ({
  ...DEFAULT_INPUT_PROFILE,
  kickAttribution: "plantMask" as const,
  bothClickMeans: "push" as const,
});

async function grounded(seed = 0x10c0): Promise<AgentHarness> {
  const h = new AgentHarness(DEFAULT_SIM_CONFIG, PLANT_MASK_PROFILE);
  await h.reset(seed, "flat-dev");
  h.step(60); // drop from spawnHeight and settle onto the ground
  return h;
}

describe("ground locomotion (a) cruise", () => {
  it("holding Ctrl with both feet accelerates forward and saturates below maxGroundSpeed", async () => {
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

  it("releasing Ctrl coasts with smooth resistance instead of applying an automatic brake", async () => {
    const h = await grounded(0x5709);
    for (let i = 0; i < 150; i++) {
      h.injectContactFrame(plantFrame(60 + i, REST));
      h.step(1);
    }
    const start = hSpeed(h);
    expect(start).toBeGreaterThan(3.5);

    const samples: number[] = [];
    for (let i = 0; i < 150; i++) {
      h.injectContactFrame(plantFrame(210 + i, REST, false, false));
      h.step(1);
      if (i % 10 === 9) samples.push(hSpeed(h));
    }
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeLessThanOrEqual(samples[i - 1]! + 0.03);
    }
    expect(samples.at(-1)).toBeGreaterThan(start * 0.35);
    expect(samples.at(-1)).toBeLessThan(start);
  });

  it("still coasts after Ctrl release when both fingers lift off the pad", async () => {
    const h = await grounded(0x5710);
    for (let i = 0; i < 150; i++) {
      h.injectContactFrame(plantFrame(60 + i, REST));
      h.step(1);
    }
    expect(hSpeed(h)).toBeGreaterThan(3.5);

    for (let i = 0; i < 150; i++) {
      h.injectContactFrame(plantFrame(210 + i, [], false, false));
      h.step(1);
    }
    expect(hSpeed(h)).toBeGreaterThan(1.25);
  });
});

describe("ground locomotion (b) push pulses", () => {
  it("a push adds a readable speed increment and pushes stay capped", async () => {
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
    const dv =
      DEFAULT_SIM_CONFIG.physics.pushImpulse /
      (DEFAULT_SIM_CONFIG.physics.boardMass + DEFAULT_SIM_CONFIG.physics.riderMass);
    expect(after - before).toBeGreaterThan(dv * 0.6);
    expect(after - before).toBeLessThan(dv * 1.2);

    // Hammer pushes past the cap: speed climbs but never exceeds maxGroundSpeed.
    let step = 217;
    let primary = false;
    // Six cooldown-spaced pushes are enough to prove the cap while remaining
    // inside the finite playable plaza. Boundary recovery is intentionally
    // covered by world-recovery.test.ts rather than bypassed here.
    for (let p = 0; p < 6; p++) {
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

describe("ground locomotion (c) finger-line steering (RELATIVE, reviews/03)", () => {
  // Sprint 02 S2 superseded the absolute finger-angle heading: steering now
  // follows the CHANGE in segment angle since dual-plant (ratchet steering),
  // with no speed gate. These tests replace the absolute-semantics originals.
  async function pipeline(
    stance: InputProfile["stance"] = "regular",
  ): Promise<AgentHarness> {
    const h = new AgentHarness(DEFAULT_SIM_CONFIG, () => ({
      ...DEFAULT_SIM_CONFIG_PROFILE,
      stance,
    }));
    await h.reset(0x5411, "flat-dev");
    h.step(60);
    return h;
  }

  function yawOf(h: AgentHarness): { yaw: number; yawRate: number } {
    const { q, av } = h.observe().board;
    const forwardX = 2 * (q.x * q.z + q.w * q.y);
    const forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);
    return { yaw: Math.atan2(forwardX, forwardZ), yawRate: av.y };
  }

  /** Contact pair rotated `a` rad about the rest midpoint (0.5, 0.5). */
  function rotated(a: number): Contact[] {
    const c = 0.1 * Math.cos(a);
    const s = 0.1 * Math.sin(a);
    return [
      { ...REST[0]!, x: 0.5 - c, y: 0.5 - s },
      { ...REST[1]!, x: 0.5 + c, y: 0.5 + s },
    ];
  }

  it("planting an already-rotated finger line never snaps the board (no absolute authority)", async () => {
    const h = await pipeline();
    const vertical: Contact[] = [
      { ...REST[0]!, x: 0.5, y: 0.4 },
      { ...REST[1]!, x: 0.5, y: 0.6 },
    ];
    for (let i = 0; i < 120; i++) {
      h.injectContactFrame(plantFrame(60 + i, vertical, false, false));
      h.step(1);
    }
    const result = yawOf(h);
    expect(Math.abs(result.yaw)).toBeLessThan(0.12);
    expect(Math.abs(result.yawRate)).toBeLessThan(0.08);
  });

  it("rotating the planted line turns the board by the delta — standstill pivot included", async () => {
    const h = await pipeline();
    // Anchor at rest angle, THEN rotate +90° at ~200°/s, hold. No drive at all:
    // the rideMotionFullSpeed dead zone is gone by design.
    for (let i = 0; i < 20; i++) {
      h.injectContactFrame(plantFrame(60 + i, rotated(0), false, false));
      h.step(1);
    }
    const rotSteps = 27;
    for (let k = 1; k <= rotSteps; k++) {
      const a = (Math.PI / 2) * (k / rotSteps);
      h.injectContactFrame(plantFrame(80 + k, rotated(a), false, false));
      h.step(1);
    }
    for (let i = 0; i < 60; i++) {
      h.injectContactFrame(plantFrame(140 + i, rotated(Math.PI / 2), false, false));
      h.step(1);
    }
    const settled = yawOf(h);
    // Pad +rotation → world −yaw, scaled by steerDirectGain (1.1): ≈ −99°.
    const expected = -(Math.PI / 2) * DEFAULT_SIM_CONFIG.locomotion.steerDirectGain;
    expect(Math.abs(settled.yaw - expected)).toBeLessThan(0.25);
  });

  it("sliding both fingers together without rotating them does not steer", async () => {
    const h = await pipeline();
    for (let i = 0; i < 20; i++) {
      h.injectContactFrame(plantFrame(60 + i, REST, false, false));
      h.step(1);
    }
    const translated = REST.map((contact) => ({ ...contact, x: contact.x + 0.1 }));
    for (let i = 0; i < 100; i++) {
      h.injectContactFrame(plantFrame(80 + i, translated, false, false));
      h.step(1);
    }
    const result = yawOf(h);
    expect(Math.abs(result.yaw)).toBeLessThan(0.08);
    expect(Math.abs(result.yawRate)).toBeLessThan(0.08);
  });
});

describe("ground locomotion (d) airborne", () => {
  it("applies no ground drive while the board is still falling", async () => {
    const h = new AgentHarness(DEFAULT_SIM_CONFIG, PLANT_MASK_PROFILE);
    await h.reset(0xa15, "flat-dev");
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
  stance: "regular",
  padYawOffset: 0,
  swapFeet: false,
  assistLevel: 1,
  bothClickMeans: "push",
  kickAttribution: "plantMask",
  tapToClickIsKick: true,
  accessibility: { reducedMotion: false, highContrastHud: false },
};

function segment(lateral: number): SegmentState {
  return {
    valid: true,
    angle: 0,
    angleFromRest: 0,
    angVel: 0,
    midpoint: { x: 0.5, y: 0.5 },
    midpointOffsetFromRest: { x: lateral, y: 0 },
    midpointVel: { x: 0, y: 0 },
    lengthRatio: 1,
  };
}

function headingFeet(angle: number, angularVelocity = 0): FeetState {
  const state = feet(0);
  state.segment.angle = angle;
  state.segment.angleFromRest = angle;
  state.segment.angVel = angularVelocity;
  return state;
}

function feet(lateral: number): FeetState {
  const foot = (role: "nose" | "tail") => ({
    role,
    planted: true,
    pos: { x: 0.5, y: 0.5 },
    vel: { x: 0, y: 0 },
    offsetFromRest: { x: 0, y: 0 },
    contactId: role === "nose" ? 1 : 2,
  });
  return {
    nose: foot("nose"),
    tail: foot("tail"),
    segment: segment(lateral),
    bothPlanted: true,
    plantCount: 2,
  };
}

describe("ground locomotion (e) relative steering-sign guard", () => {
  const GAIN = DEFAULT_SIM_CONFIG.locomotion.steerDirectGain;
  const make = (stance: InputProfile["stance"]) =>
    new BoardController(
      DEFAULT_SIM_CONFIG.locomotion,
      DEFAULT_SIM_CONFIG.physics,
      {
        stance,
        bothClickMeans: "push",
      },
    );

  it("common-mode finger translation has no steering or cosmetic lean authority", () => {
    const c = make("regular");
    expect(c.applyGroundControl(feet(0), [], true, 0).headingDelta).toBe(0); // anchor
    const cmd = c.applyGroundControl(feet(0.1), [], true, 1);
    expect(cmd.headingDelta).toBeCloseTo(0, 12);
    expect(cmd.rollTorque).toBe(0);
  });

  it("emits the negated wrapPi segment delta × steerDirectGain (pad CW = world CW)", () => {
    const c = make("regular");
    c.applyGroundControl(headingFeet(0), [], true, 0); // anchor
    const cmd = c.applyGroundControl(headingFeet(0.35), [], true, 1);
    expect(cmd.headingDelta).toBeCloseTo(-0.35 * GAIN, 6);
  });

  it("goofy stance emits identical deltas — the π role offset cancels", () => {
    // Goofy reverses tail→nose ordering (segment reads π for the same hands),
    // but RELATIVE steering only sees the change, so direction is preserved
    // with no stance term at all.
    const c = make("goofy");
    c.applyGroundControl(headingFeet(Math.PI), [], true, 0); // anchor
    const cmd = c.applyGroundControl(headingFeet(Math.PI + 0.35), [], true, 1);
    expect(cmd.headingDelta).toBeCloseTo(-0.35 * GAIN, 6);
  });

  it("re-planting at ANY absolute angle re-anchors with a zero delta (no snap)", () => {
    const c = make("regular");
    c.applyGroundControl(headingFeet(0), [], true, 0);
    c.applyGroundControl(headingFeet(0.35), [], true, 1);
    const lifted = feet(0);
    lifted.bothPlanted = false;
    lifted.segment.valid = false;
    expect(c.applyGroundControl(lifted, [], true, 2).headingDelta).toBeNull();
    const cmd = c.applyGroundControl(headingFeet(-1.2), [], true, 3);
    expect(cmd.headingDelta).toBe(0);
  });

  it("finger rotation SPEED adds no second command channel (delta only)", () => {
    const slow = make("regular");
    slow.applyGroundControl(headingFeet(0, 0), [], true, 0);
    const a = slow.applyGroundControl(headingFeet(0.35, 0), [], true, 1);
    const fast = make("regular");
    fast.applyGroundControl(headingFeet(0, 8), [], true, 0);
    const b = fast.applyGroundControl(headingFeet(0.35, 8), [], true, 1);
    expect(b.headingDelta).toBeCloseTo(a.headingDelta!, 12);
  });

  it("airborne → inactive command with steering disengaged", () => {
    const cmd = make("regular").applyGroundControl(feet(1), [], false, 0);
    expect(cmd.active).toBe(false);
    expect(cmd.headingDelta).toBeNull();
  });
});
