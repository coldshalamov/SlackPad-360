/**
 * quantize-assist (M5) — catch-time flip quantization by assist level
 * (final-physics-animation-camera-spec §3.4). At catch, when the completed roll
 * sits inside the assist-level cone of a whole flip, EXTRA on-axis damping bleeds
 * the residual so the trick settles ON the level. L0 never snaps (cone/damp 0);
 * L1 soft; L2 stronger. This is pure extra angular damping — never a pose write.
 *
 * The base M4 catch damping is ALSO monotonic in assist level, so a naive
 * L0/L1/L2 residual comparison could pass without the quantize code running at
 * all. This test therefore (a) proves L0's terms are literally 0, (b) asserts the
 * quantize telemetry fired for L1/L2 and NOT L0, and (c) ISOLATES the quantize
 * term (same seed + same base catch, quantize on vs off) to show it snaps.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG, deepFreezeConfig } from '@slackpad/shared';
import type { SimConfig } from '@slackpad/shared';
import { AgentHarness } from '../src/agent/AgentHarness';
import { PadDriver, scriptOllie, flyWithGesture, eventsOf } from './helpers/maneuver';

async function runFlick(
  seed: number,
  assistLevel: 0 | 1 | 2,
  catchAfterApexSteps: number,
  patch?: (cfg: SimConfig) => void,
): Promise<{ residTurns: number; rot: number; outcome: string; h: AgentHarness }> {
  const cfg = structuredClone(DEFAULT_SIM_CONFIG) as SimConfig;
  patch?.(cfg);
  const h = new AgentHarness(deepFreezeConfig(cfg), () => ({
    stance: 'regular',
    padYawOffset: 0,
    swapFeet: false,
    assistLevel,
    bothClickMeans: 'push',
    kickAttribution: 'plantMask',
    tapToClickIsKick: true,
    accessibility: { reducedMotion: false, highContrastHud: false },
  }));
  await h.reset(seed, 'flat-dev');
  h.step(60);
  const d = new PadDriver(h);
  d.cruise(90);
  scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
  const r = flyWithGesture(d, { gesture: 'flip-heel', perFrame: 0.13, catchAfterApexSteps, frames: 6, startAfterAir: 2 });
  const residTurns = Math.abs(r.flipRotations - Math.round(r.flipRotations));
  return { residTurns, rot: r.flipRotations, outcome: r.outcome, h };
}

describe('quantize-assist: catch-time flip snap by level', () => {
  it('L0 quantize terms are literally 0 (never snaps by construction)', () => {
    expect(DEFAULT_SIM_CONFIG.flip.quantizeConeDeg[0]).toBe(0);
    expect(DEFAULT_SIM_CONFIG.flip.quantizeExtraDamp[0]).toBe(0);
  });

  it('L0 fires no quantize; L1 and L2 DO (cone-gated) — snap grows with level in config', async () => {
    // Catch late enough that there is residual roll for the cone to act on.
    const CATCH = 10;
    const l0 = await runFlick(0x9a00, 0, CATCH);
    const l1 = await runFlick(0x9a01, 1, CATCH);
    const l2 = await runFlick(0x9a02, 2, CATCH);
    console.info(
      '[quantize-assist] fired-by-level:',
      JSON.stringify({ L0: eventsOf(l0.h, 'quantize').length, L1: eventsOf(l1.h, 'quantize').length, L2: eventsOf(l2.h, 'quantize').length }),
    );

    // L0 never snaps; L1/L2 fire the long-axis quantize.
    expect(eventsOf(l0.h, 'quantize').length).toBe(0);
    expect(eventsOf(l1.h, 'quantize').some((e) => e.axis === 'long')).toBe(true);
    expect(eventsOf(l2.h, 'quantize').some((e) => e.axis === 'long')).toBe(true);
    // "Stronger at higher level" is a config invariant (cone widens, damp deepens);
    // the residual itself is trajectory-dependent (base catch also scales with L),
    // so the snap STRENGTH is asserted here, its EFFECT by the isolation below.
    const q = DEFAULT_SIM_CONFIG.flip;
    expect(q.quantizeConeDeg[2]).toBeGreaterThan(q.quantizeConeDeg[1]);
    expect(q.quantizeExtraDamp[2]).toBeGreaterThan(q.quantizeExtraDamp[1]);
  });

  it('ISOLATION: at L1 AND L2, quantize-on snaps closer to the level than quantize-off', async () => {
    const CATCH = 10;
    for (const L of [1, 2] as const) {
      const on = await runFlick(0x9b00 + L, L, CATCH); // default quantizeExtraDamp
      const off = await runFlick(0x9b00 + L, L, CATCH, (c) => {
        (c.flip as { quantizeExtraDamp: [number, number, number] }).quantizeExtraDamp = [0, 0, 0];
      });
      console.info(`[quantize-assist] isolation L${L}:`, JSON.stringify({ onResid: +on.residTurns.toFixed(3), offResid: +off.residTurns.toFixed(3) }));
      // Same seed, same base catch — the ONLY difference is the quantize term.
      expect(eventsOf(on.h, 'quantize').length).toBeGreaterThan(0);
      expect(eventsOf(off.h, 'quantize').length).toBe(0);
      expect(on.residTurns).toBeLessThanOrEqual(off.residTurns);
    }
  });

  it('quantization is damping only — it never flips the sign or teleports the roll', async () => {
    // A snap toward the level keeps the same rotation sign and stays within one
    // turn of the pre-catch rotation (no pose write / teleport).
    const on = await runFlick(0x9c02, 2, 10);
    const off = await runFlick(0x9c02, 2, 10, (c) => {
      (c.flip as { quantizeExtraDamp: [number, number, number] }).quantizeExtraDamp = [0, 0, 0];
    });
    expect(Math.sign(on.rot)).toBe(Math.sign(off.rot));
    expect(Math.abs(on.rot - off.rot)).toBeLessThan(1); // never jumps a whole turn
  });
});
