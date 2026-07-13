import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { AgentHarness } from '../src/agent/AgentHarness';
import { SimWorld } from '../src/sim/SimWorld';
import {
  eventsOf,
  NOSE_POS,
  PadDriver,
  scriptOllie,
  settledProfiled,
  TAIL_POS,
} from './helpers/maneuver';

/** Hold the explicit Ctrl throttle; finger motion is never propulsion. */
function rideForward(d: PadDriver, steps: number): void {
  for (let i = 0; i < steps; i++) {
    d.drive({ nose: NOSE_POS, tail: TAIL_POS, auxiliary: true });
  }
}

describe('flat-dev world recovery', () => {
  it('does not expose a void when a rider crosses the old 30 m plaza boundary', async () => {
    const d = await settledProfiled(0x0b0a0d);
    rideForward(d, 800);

    const obs = d.harness.observe();
    expect(Math.hypot(obs.board.p.x, obs.board.p.z)).toBeGreaterThan(30);
    expect(obs.board.p.y).toBeGreaterThan(0.04);
    expect(eventsOf(d.harness, 'bail')).not.toContainEqual(
      expect.objectContaining({ reason: 'out-of-bounds' }),
    );
  });

  it('does not call a deck resting on its side grounded or rideable', async () => {
    const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
    await world.reset(0x51de, 'flat-dev');
    for (let i = 0; i < 60; i++) world.step();

    let foundSideContact = false;
    for (let i = 0; i < 180; i++) {
      if (i < 24) {
        world.applyManeuver({ kind: 'flipTorque', axis: 'long', omegaTarget: 12, tauMax: 8 });
      }
      world.step();
      const pose = world.boardPose();
      const deckUpY = 1 - 2 * (pose.q.x * pose.q.x + pose.q.z * pose.q.z);
      if (Math.abs(deckUpY) < 0.35 && pose.p.y < 0.16) {
        foundSideContact = true;
        expect(world.isGrounded()).toBe(false);
        break;
      }
    }

    expect(foundSideContact).toBe(true);
    world.free();
  });

  it('recovers a board that remains supported on its side instead of sliding forever', async () => {
    const world = new SimWorld(structuredClone(DEFAULT_SIM_CONFIG));
    await world.reset(0x51de, 'flat-dev');
    for (let i = 0; i < 60; i++) world.step();

    let tipped = false;
    for (let i = 0; i < 180; i++) {
      world.applyManeuver({ kind: 'flipTorque', axis: 'long', omegaTarget: 12, tauMax: 8 });
      world.step();
      const pose = world.boardPose();
      const deckUpY = 1 - 2 * (pose.q.x * pose.q.x + pose.q.z * pose.q.z);
      if (Math.abs(deckUpY) < 0.35 && pose.p.y < 0.16) {
        // Model the screenshot's already-settled edge slide, then leave Rapier
        // fully in charge of support and gravity for the recovery window.
        world.applyManeuver({ kind: 'catch', angularFactor: 0 });
        tipped = true;
        break;
      }
    }
    expect(tipped).toBe(true);

    let recovery: string | null = null;
    for (let i = 0; i < 240; i++) {
      recovery = world.step().recovery;
      if (recovery) break;
    }

    expect(recovery).toBe('unrideable');
    const pose = world.boardPose();
    expect(pose.p.y).toBeGreaterThan(0.45);
    expect(1 - 2 * (pose.q.x * pose.q.x + pose.q.z * pose.q.z)).toBeGreaterThan(0.99);
    world.free();
  });

  it('clears a live grind observation when the map boundary recovers the board', async () => {
    // Keep the grind latched long enough to reach the finite end of the
    // grind-lab floor; this exercises recovery immediately after an FSM grind
    // update, when a stale cached observation would otherwise render once.
    const config = structuredClone(DEFAULT_SIM_CONFIG);
    config.grind.speedEndSpeed = 0;
    config.grind.tangentDrag = 0;
    const harness = new AgentHarness(config);
    await harness.reset(12345, 'grind-lab');
    harness.step(60);
    const d = new PadDriver(harness);
    d.cruise(70);
    scriptOllie(d, {});

    let sawGrind = false;
    let recoveryArmed = false;
    let recovered = false;
    for (let i = 0; i < 200; i++) {
      d.drive({ nose: NOSE_POS, tail: TAIL_POS });
      const observation = harness.observe();
      if (observation.phase === 'grind') {
        sawGrind = true;
        if (!recoveryArmed) {
          // The next physics step must recover after the FSM has produced a
          // live grind snapshot, reproducing the exact stale-cache edge.
          config.physics.ground.halfExtents = {
            ...config.physics.ground.halfExtents,
            z: Math.max(0.01, Math.abs(observation.board.p.z) - 0.001),
          };
          recoveryArmed = true;
        }
      }
      if (eventsOf(harness, 'bail').some((event) => event.reason === 'out-of-bounds')) {
        recovered = true;
        break;
      }
    }

    expect(sawGrind).toBe(true);
    expect(recoveryArmed).toBe(true);
    expect(recovered).toBe(true);
    expect(harness.observe().grind).toBeNull();
  });
});
