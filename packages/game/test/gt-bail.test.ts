/**
 * GT-bail (M4) — the bail state + deterministic checkpoint respawn
 * (final-input-and-trick-spec §7: "BAIL state, damping, checkpoint respawn";
 * every failure has state + telemetry):
 *  - bail → phase 'bail', lastFailReason set, board heavily damped;
 *  - after bail.recoverSteps → respawn at the level spawn marker (SimWorld
 *    internal game rule), phase returns to ground once settled;
 *  - determinism: the same script twice → identical checkpoint hashes through
 *    bail AND respawn.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG, deepFreezeConfig } from '@slackpad/shared';
import type { SessionTrace, SimConfig } from '@slackpad/shared';
import { AgentHarness } from '../src/agent/AgentHarness';
import { eventsOf, PadDriver, scriptOllie, settled, TAIL_POS } from './helpers/maneuver';

/** Over-pitched pops bail reliably (see gt-land): scale 0.056 over-rotates. */
function bailConfig(): SimConfig {
  const cfg = structuredClone(DEFAULT_SIM_CONFIG) as SimConfig;
  (cfg.pop as { pitchTorqueScale: number }).pitchTorqueScale = 0.056;
  return deepFreezeConfig(cfg);
}

/** Drive to a bail: settle, cruise, max-q ollie, fly uncaught until bail. */
async function driveToBail(h: AgentHarness): Promise<PadDriver> {
  const d = await settled(0xba11, 'flat-dev', h);
  d.cruise(90);
  scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
  for (let i = 0; i < 120 && h.observe().phase !== 'bail'; i++) d.drive({ tail: TAIL_POS });
  return d;
}

describe('GT-bail: fail state, damping, respawn', () => {
  it('bail sets phase + lastFailReason and heavily damps the board', async () => {
    const h = new AgentHarness(bailConfig());
    const d = await driveToBail(h);
    expect(h.observe().phase).toBe('bail');
    expect(h.observe().lastFailReason).toBe('over-rotation');
    expect(eventsOf(h, 'bail').length).toBe(1);

    // The board had cruise speed (~4+ m/s); bail damping kills it fast.
    d.idle(40);
    const lv = h.observe().board.lv;
    expect(Math.hypot(lv.x, lv.y, lv.z)).toBeLessThan(0.6);
  });

  it('after recoverSteps the board respawns at the spawn marker and re-grounds', async () => {
    const h = new AgentHarness(bailConfig());
    const d = await driveToBail(h);
    const bailStep = eventsOf(h, 'bail')[0]!.step as number;
    const preRespawn = h.observe().board.p;
    expect(Math.abs(preRespawn.z)).toBeGreaterThan(2); // travelled well away

    // Run through the bail window + the respawn drop + settling.
    d.idle(DEFAULT_SIM_CONFIG.bail.recoverSteps + 80);

    const obs = h.observe();
    // Respawn telemetry fired at bail + recoverSteps.
    const respawns = eventsOf(h, 'respawn');
    expect(respawns.length).toBe(1);
    expect((respawns[0]!.step as number) - bailStep).toBe(DEFAULT_SIM_CONFIG.bail.recoverSteps);
    // Back at the spawn marker (seeded jitter ±0.02 m) and riding again.
    expect(Math.abs(obs.board.p.x)).toBeLessThan(0.1);
    expect(Math.abs(obs.board.p.z)).toBeLessThan(0.1);
    expect(obs.phase).toBe('ground');
    // The fail reason REMAINS readable after respawn (cleared by the next pop).
    expect(obs.lastFailReason).toBe('over-rotation');
  });

  it('determinism: the same bail script twice → identical checkpoint hashes', async () => {
    const record = async (): Promise<SessionTrace> => {
      const h = new AgentHarness(bailConfig());
      await h.reset(0xba11, 'flat-dev');
      h.startRecording();
      const d = new PadDriver(h);
      d.idle(60);
      d.cruise(90);
      scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });
      for (let i = 0; i < 90; i++) d.drive({ tail: TAIL_POS }); // flight + bail (fixed length)
      d.idle(DEFAULT_SIM_CONFIG.bail.recoverSteps + 90); // respawn + settle
      return h.stopRecording();
    };
    const a = await record();
    const b = await record();
    const join = (t: SessionTrace): string => t.checkpoints.map((c) => `${c.step}:${c.hash}`).join('|');
    expect(a.checkpoints.length).toBeGreaterThan(5);
    expect(join(b)).toBe(join(a));

    // And the recorded trace replays to the same checkpoints (record/replay).
    const h = new AgentHarness(bailConfig());
    const replayed = await h.replay(a);
    expect(replayed).toEqual(a.checkpoints);
  });
});
