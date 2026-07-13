/**
 * Ground locomotion (M3), driven ONLY by injecting synthetic ContactFrames
 * through the AgentHarness (inject-only — no pose/impulse shortcuts):
 *   (a) dual-plant cruise → forward speed rises and saturates ≤ maxGroundSpeed
 *   (b) push pulses add speed, capped at maxGroundSpeed
 *   (c) common-mode lateral travel → board yaw in the same direction for both stances
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

  it("releasing Ctrl brakes monotonically to a controllable stop in about two seconds", async () => {
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
    expect(samples.at(-1)).toBeLessThan(0.25);
  });

  it("still brakes after Ctrl release when both fingers lift off the pad", async () => {
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
    expect(hSpeed(h)).toBeLessThan(0.25);
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
      DEFAULT_SIM_CONFIG.physics.boardMass;
    expect(after - before).toBeGreaterThan(dv * 0.6); // ~1.2 m/s, minus a little drag
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

describe("ground locomotion (c) analog steering", () => {
  async function yawAfterLateralTravel(
    stance: InputProfile["stance"],
    dir: 1 | -1,
  ): Promise<number> {
    const h = new AgentHarness(DEFAULT_SIM_CONFIG, () => ({
      ...DEFAULT_SIM_CONFIG_PROFILE,
      stance,
    }));
    await h.reset(0x5411, "flat-dev");
    h.step(60);
    // Build forward speed.
    for (let i = 0; i < 90; i++) {
      h.injectContactFrame(plantFrame(60 + i, REST));
      h.step(1);
    }
    // Translate both contacts together and hold the offset like an analog stick.
    const contacts = REST.map((c) => ({ ...c, x: c.x + dir * 0.1 }));
    for (let j = 0; j < 30; j++) {
      h.injectContactFrame(plantFrame(150 + j, contacts));
      h.step(1);
    }
    return h.observe().board.av.y;
  }

  it("sliding both fingers right yaws right and left yaws left", async () => {
    expect(await yawAfterLateralTravel("regular", 1)).toBeGreaterThan(0.05);
    expect(await yawAfterLateralTravel("regular", -1)).toBeLessThan(-0.05);
  });

  it("keeps the steering direction stance-independent", async () => {
    expect(await yawAfterLateralTravel("goofy", 1)).toBeGreaterThan(0.05);
    expect(await yawAfterLateralTravel("goofy", -1)).toBeLessThan(-0.05);
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

describe("ground locomotion (e) analog steering guard", () => {
  const make = (stance: InputProfile["stance"]) =>
    new BoardController(
      DEFAULT_SIM_CONFIG.locomotion,
      DEFAULT_SIM_CONFIG.physics,
      {
        stance,
        bothClickMeans: "push",
      },
    );

  it("positive lateral offset turns right and negative turns left", () => {
    expect(
      make("regular").applyGroundControl(feet(0.1), [], true, 0).targetYawRate,
    ).toBeGreaterThan(0);
    expect(
      make("regular").applyGroundControl(feet(-0.1), [], true, 0).targetYawRate,
    ).toBeLessThan(0);
  });

  it("goofy uses the same screen-space steering direction", () => {
    expect(
      make("goofy").applyGroundControl(feet(0.1), [], true, 0).targetYawRate,
    ).toBeGreaterThan(0);
    expect(
      make("goofy").applyGroundControl(feet(-0.1), [], true, 0).targetYawRate,
    ).toBeLessThan(0);
  });

  it("ignores pad noise inside the deadzone", () => {
    expect(
      make("regular").applyGroundControl(feet(0.01), [], true, 0).targetYawRate,
    ).toBe(0);
  });

  it("airborne → no command (targetYawRate 0, inactive)", () => {
    const cmd = make("regular").applyGroundControl(feet(1), [], false, 0);
    expect(cmd.active).toBe(false);
    expect(cmd.targetYawRate).toBe(0);
  });
});
