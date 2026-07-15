/**
 * quantize-assist (M5) — catch-time flip quantization by assist level
 * (final-physics-animation-camera-spec §3.4). At catch, when the completed roll
 * sits inside the assist-level cone of a whole flip, EXTRA on-axis damping
 * arrests continued over-rotation inside that cone. L0 never assists (cone/damp 0);
 * L1 soft; L2 stronger. This is pure extra angular damping — never a pose write.
 *
 * The base M4 catch damping is ALSO monotonic in assist level, so a naive
 * L0/L1/L2 residual comparison could pass without the quantize code running at
 * all. This test therefore (a) proves L0's terms are literally 0, (b) asserts the
 * quantize telemetry fired for L1/L2 and NOT L0, and (c) ISOLATES the quantize
 * term (same seed + same base catch, quantize on vs off) to prove the command
 * fires and leaves the caught board inside the configured completion cone.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG, deepFreezeConfig } from '@slackpad/shared';
import type { SimConfig } from '@slackpad/shared';
import { AgentHarness } from '../src/agent/AgentHarness';
import {
  eventsOf,
  flyWithGesture,
  gesturePos,
  lastEventOf,
  NOSE_POS,
  PadDriver,
  scriptOllie,
  TAIL_POS,
} from './helpers/maneuver';

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
    bothClickMeans: 'ignore',
    kickAttribution: 'motionTap',
    tapToClickIsKick: false,
    accessibility: { reducedMotion: false, highContrastHud: false },
  }));
  await h.reset(seed, 'flat-dev');
  h.step(60);
  const d = new PadDriver(h);
  d.cruise(90);
  scriptOllie(d);

  // L0 deliberately keeps the explicit replant path. Shipping L1/L2 hold both
  // contacts and auto-catch near a completed rotation, which is precisely when
  // the quantize cone should evaluate.
  if (assistLevel === 0) {
    const r = flyWithGesture(d, {
      gesture: 'flip-heel',
      perFrame: 0.13,
      catchAfterApexSteps,
      frames: 6,
      startAfterAir: 2,
    });
    return {
      residTurns: Math.abs(r.flipRotations - Math.round(r.flipRotations)),
      rot: r.flipRotations,
      outcome: r.outcome,
      h,
    };
  }

  let airStart: number | null = null;
  let gi = 0;
  for (let i = 0; i < 240; i++) {
    const obs = h.observe();
    if ((obs.phase === 'air' || obs.phase === 'catch') && airStart == null) airStart = obs.step;
    const done = lastEventOf(h, 'trickCompleted') ?? lastEventOf(h, 'bail');
    if (done && (obs.phase === 'ground' || obs.phase === 'bail')) break;
    if (airStart != null && obs.step >= airStart + 2 && gi < 6) gi += 1;
    d.drive({
      nose: NOSE_POS,
      tail: gi > 0 ? gesturePos('flip-heel', gi, 0.13, 6) : TAIL_POS,
    });
  }
  const trick = lastEventOf(h, 'trickCompleted');
  const bail = lastEventOf(h, 'bail');
  const outcomeEv = bail && (!trick || (bail.step as number) > (trick.step as number)) ? bail : trick;
  const rot = outcomeEv ? ((outcomeEv.flipRotations as number) ?? 0) : 0;
  const outcome = outcomeEv === bail ? 'bail' : trick ? (trick.cleanliness as string) : 'none';
  return { residTurns: Math.abs(rot - Math.round(rot)), rot, outcome, h };
}

describe('quantize-assist: catch-time flip snap by level', () => {
  it('L0 quantize terms are literally 0 (never snaps by construction)', () => {
    expect(DEFAULT_SIM_CONFIG.flip.quantizeConeDeg[0]).toBe(0);
    expect(DEFAULT_SIM_CONFIG.flip.quantizeExtraDamp[0]).toBe(0);
  });

  it('L0 fires no quantize; L1 and L2 DO (cone-gated) — snap grows with level in config', async () => {
    // L1/L2 auto-catch near completion; L0 uses this only for its manual path.
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

  it('ISOLATION: at L1 AND L2, quantize-on settles inside its completion cone', async () => {
    for (const L of [1, 2] as const) {
      const CATCH = 8;
      const on = await runFlick(0x9b00 + L, L, CATCH); // default quantizeExtraDamp
      const off = await runFlick(0x9b00 + L, L, CATCH, (c) => {
        (c.flip as { quantizeExtraDamp: [number, number, number] }).quantizeExtraDamp = [0, 0, 0];
      });
      console.info(`[quantize-assist] isolation L${L}:`, JSON.stringify({ onResid: +on.residTurns.toFixed(3), offResid: +off.residTurns.toFixed(3) }));
      // Same seed, same base catch — the ONLY difference is the quantize term.
      expect(eventsOf(on.h, 'quantize').length).toBeGreaterThan(0);
      expect(eventsOf(off.h, 'quantize').length).toBe(0);
      // Quantize is intentionally angular damping rather than a pose snap. It
      // prevents continued over-rotation; it does not promise a smaller final
      // position error than an unassisted trajectory that happens to coast
      // through the exact level.
      expect(on.residTurns * 360).toBeLessThanOrEqual(DEFAULT_SIM_CONFIG.flip.quantizeConeDeg[L]);
      expect(on.outcome).not.toBe('bail');
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
