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

describe("ground locomotion (c) finger-line heading", () => {
  async function headingAfterContacts(
    contacts: Contact[],
    stance: InputProfile["stance"] = "regular",
    steps = 120,
    accelerating = false,
  ): Promise<{ yaw: number; yawRate: number }> {
    const h = new AgentHarness(DEFAULT_SIM_CONFIG, () => ({
      ...DEFAULT_SIM_CONFIG_PROFILE,
      stance,
    }));
    await h.reset(0x5411, "flat-dev");
    h.step(60);
    // The very first confident two-finger placement establishes the requested
    // board heading. There is no hidden re-anchor to the board's old yaw.
    for (let i = 0; i < steps; i++) {
      h.injectContactFrame(plantFrame(60 + i, contacts, false, accelerating));
      h.step(1);
    }
    const { q, av } = h.observe().board;
    const forwardX = 2 * (q.x * q.z + q.w * q.y);
    const forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);
    return { yaw: Math.atan2(forwardX, forwardZ), yawRate: av.y };
  }

  it("a clockwise 90-degree finger line does not rotate a stationary board", async () => {
    // Native pad Y grows toward the player. Moving the nose contact downward
    // is a physical clockwise hand rotation, which is world -yaw in the
    // side-on camera frame (world +Z reads screen-right, world -X toward us).
    const vertical: Contact[] = [
      { ...REST[0]!, x: 0.5, y: 0.4 },
      { ...REST[1]!, x: 0.5, y: 0.6 },
    ];
    const result = await headingAfterContacts(vertical);
    expect(Math.abs(result.yaw)).toBeLessThan(0.12);
    expect(Math.abs(result.yawRate)).toBeLessThan(0.08);
  });

  it("turns toward the requested heading while rolling without snapping in 300 ms", async () => {
    const vertical: Contact[] = [
      { ...REST[0]!, x: 0.5, y: 0.4 },
      { ...REST[1]!, x: 0.5, y: 0.6 },
    ];
    const early = await headingAfterContacts(vertical, "regular", 18, true);
    expect(Math.abs(early.yaw)).toBeGreaterThan(0.02);
    expect(Math.abs(early.yaw)).toBeLessThan(Math.PI / 3);

    const settled = await headingAfterContacts(vertical, "regular", 180, true);
    expect(Math.abs(-Math.PI / 2 - settled.yaw)).toBeLessThan(Math.PI / 5);
  });

  it("sliding both fingers together without rotating them does not steer", async () => {
    const translated = REST.map((contact) => ({ ...contact, x: contact.x + 0.1 }));
    const result = await headingAfterContacts(translated);
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

describe("ground locomotion (e) direct heading guard", () => {
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
    const cmd = make("regular").applyGroundControl(feet(0.1), [], true, 0);
    expect(cmd.targetYawRate).toBe(0);
    expect(cmd.rollTorque).toBe(0);
    expect(cmd.steerAngle).toBe(0);
  });

  it("converts pad-clockwise angle to the matching world-clockwise heading", () => {
    const cmd = make("regular").applyGroundControl(
      headingFeet(0.35),
      [],
      true,
      0,
    );
    expect(cmd.steerAngle).toBeCloseTo(-0.35, 6);
  });

  it("keeps the same physical finger-line heading in goofy stance", () => {
    // Goofy reverses tail→nose role ordering, so its directed segment is π
    // for the same horizontal hand placement. Heading must remain zero.
    const cmd = make("goofy").applyGroundControl(
      headingFeet(Math.PI),
      [],
      true,
      0,
    );
    expect(cmd.steerAngle).toBeCloseTo(0, 6);
  });

  it("does not turn finger rotation speed into a separate yaw-rate command", () => {
    const cmd = make("regular").applyGroundControl(
      headingFeet(0.35, 8),
      [],
      true,
      0,
    );
    expect(cmd.targetYawRate).toBe(0);
  });

  it("airborne → no command (targetYawRate 0, inactive)", () => {
    const cmd = make("regular").applyGroundControl(feet(1), [], false, 0);
    expect(cmd.active).toBe(false);
    expect(cmd.targetYawRate).toBe(0);
  });
});
