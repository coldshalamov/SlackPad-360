/**
 * shuv-180 (M5) — the FS/BS shuv envelope (final-input-and-trick-spec §5, 180
 * target; 360 deferred). A free-foot yaw SWEEP opens a shuv whose PD envelope
 * drives board-up yaw toward the 180° target; assist L1 quantize snaps the
 * caught yaw onto the level. An interrupted shuv (mid-air collision) keeps its
 * partial ω and bails, never a silent success (§7).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUT_PROFILE, DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { AgentHarness } from '../src/agent/AgentHarness';
import { OBSTACLE_WALL_Z } from '../src/sim/levels/test-obstacle';
import {
  settledProfiled,
  scriptOllie,
  flyWithGesture,
  eventsOf,
  NOSE_POS,
  TAIL_POS,
  PadDriver,
} from './helpers/maneuver';

async function shuv(
  seed: number,
  gesture: 'shuv-bs' | 'shuv-fs',
  catchAfterApexSteps: number | null,
  assistLevel: 0 | 1 | 2 = 1,
): Promise<ReturnType<typeof flyWithGesture>> {
  const d = await settledProfiled(seed, { stance: 'regular', assistLevel });
  d.cruise(90);
  scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
  return flyWithGesture(d, { gesture, catchAfterApexSteps, frames: 6, startAfterAir: 2 });
}

const TARGET = DEFAULT_SIM_CONFIG.recognition.shuvTargetDeg; // 180

describe('shuv-180: sweep → 180° yaw', () => {
  it('bs-shuv caught at L1 lands yaw ≈ 180° within the quantize cone', async () => {
    const r = await shuv(0x5b01, 'shuv-bs', 8, 1);
    console.info('[shuv-180] bs L1 caught:', JSON.stringify({ yaw: r.shuvDegrees, out: r.outcome, label: r.label }));
    expect(r.recLabel).toBe('bs-shuv');
    expect(r.label).toBe('bs-shuv');
    // 180° target within a generous cone (yaw does not tilt the deck, so the
    // land is clean regardless — the 180 contract is on the measured yaw).
    expect(Math.abs(r.shuvDegrees)).toBeGreaterThan(TARGET - 55);
    expect(Math.abs(r.shuvDegrees)).toBeLessThan(TARGET + 55);
    expect(r.outcome).toBe('clean');
  });

  it('fs-shuv mirrors to negative yaw of the same magnitude band', async () => {
    const r = await shuv(0x5f02, 'shuv-fs', 8, 1);
    console.info('[shuv-180] fs L1 caught:', JSON.stringify({ yaw: r.shuvDegrees, out: r.outcome, label: r.label }));
    expect(r.label).toBe('fs-shuv');
    expect(r.shuvDegrees).toBeLessThan(0);
    expect(Math.abs(r.shuvDegrees)).toBeGreaterThan(TARGET - 55);
  });

  it('L1 quantize pulls the caught yaw closer to 180 than quantize-off', async () => {
    // Isolation: same seed/trajectory, only quantizeExtraDamp differs.
    const mk = async (extra: [number, number, number]) => {
      const cfg = structuredClone(DEFAULT_SIM_CONFIG) as import('@slackpad/shared').SimConfig;
      (cfg.flip as { quantizeExtraDamp: [number, number, number] }).quantizeExtraDamp = extra;
      const { deepFreezeConfig } = await import('@slackpad/shared');
      const h = new AgentHarness(deepFreezeConfig(cfg), () => ({
        stance: 'regular',
        padYawOffset: 0,
        swapFeet: false,
        assistLevel: 1,
        bothClickMeans: 'push',
        kickAttribution: 'plantMask' as const,
        tapToClickIsKick: true,
        accessibility: { reducedMotion: false, highContrastHud: false },
      }));
      await h.reset(0x5b03, 'flat-dev');
      h.step(60);
      const d = new PadDriver(h);
      d.cruise(90);
      scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
      const r = flyWithGesture(d, { gesture: 'shuv-bs', catchAfterApexSteps: 10, frames: 6, startAfterAir: 2 });
      return { r, h };
    };
    const on = await mk([0, 0.5, 0.85]);
    const off = await mk([0, 0, 0]);
    const errOn = Math.abs(Math.abs(on.r.shuvDegrees) - TARGET);
    const errOff = Math.abs(Math.abs(off.r.shuvDegrees) - TARGET);
    console.info('[shuv-180] quantize on/off:', JSON.stringify({ on: on.r.shuvDegrees, off: off.r.shuvDegrees, errOn, errOff }));
    // The quantize path fired (cone gated) on the ON run, not the OFF run.
    expect(eventsOf(on.h, 'quantize').some((e) => e.axis === 'up')).toBe(true);
    expect(eventsOf(off.h, 'quantize').length).toBe(0);
    // And it did not push the yaw FURTHER from the level.
    expect(errOn).toBeLessThanOrEqual(errOff + 1e-6);
  });

  it('interrupted shuv (mid-air wall hit) bails with a partial yaw, never silent', async () => {
    // Speed-building uses plant-mask push kicks — pin the legacy attribution
    // (ship default is 'buttonSide', IMPL-007).
    const h = new AgentHarness(DEFAULT_SIM_CONFIG, () => ({
      ...DEFAULT_INPUT_PROFILE,
      kickAttribution: 'plantMask' as const,
    }));
    await h.reset(0x5b04, 'test-obstacle');
    h.step(60);
    const d = new PadDriver(h);

    // Build lots of speed toward the wall.
    d.cruise(30);
    for (let p = 0; p < 6; p++) {
      d.drive({ nose: NOSE_POS, tail: TAIL_POS, primary: true });
      d.cruise(12);
    }
    expect(Math.hypot(h.observe().board.lv.x, h.observe().board.lv.z)).toBeGreaterThan(6);

    // Approach CLOSE, pop with a SMALL gap (so the pop fires before the board
    // reaches the wall, not a ground ram), then start a shuv sweep — the board
    // rams the face mid-air before the yaw develops: a hard, interrupting hit.
    let guard = 0;
    while (h.observe().board.p.z < OBSTACLE_WALL_Z - 1.9 && guard++ < 900) d.cruise(1);
    scriptOllie(d, { gapSteps: 2 });
    const r = flyWithGesture(d, { gesture: 'shuv-bs', catchAfterApexSteps: null, maxSteps: 200 });

    const airborneImpulse = eventsOf(h, 'contactImpulse')
      .filter((e) => e.grounded === false)
      .reduce((s, e) => s + (e.impulse as number), 0);
    console.info('[shuv-180] interrupt:', JSON.stringify({ out: r.outcome, yaw: r.shuvDegrees, fail: r.failReason, airborneImpulse }));
    // A hard mid-air collision interrupts the maneuver (readable, not silent).
    expect(h.observe().phase).toBe('bail');
    expect(h.observe().lastFailReason).toBe('hard-impact');
    const bail = eventsOf(h, 'bail')[0]!;
    expect(bail.reason).toBe('hard-impact');
    // The partial yaw is on the bail telemetry (never undefined), and it is a
    // PARTIAL shuv — nowhere near the 180 target that a clean sweep reaches.
    expect(typeof bail.shuvDegrees).toBe('number');
    expect(Math.abs(bail.shuvDegrees as number)).toBeLessThan(TARGET - 30);
    // No clean shuv was silently scored — the maneuver was interrupted.
    expect(eventsOf(h, 'trickCompleted').length).toBe(0);
  });
});
