/**
 * GT-interrupt (M4) — the maneuver interrupt rule (final-physics §3.3): a hard
 * mid-air collision (contact impulse > physics.interruptCollisionImpulse while
 * airborne) cancels the open label + assists and routes to the bail path with
 * reason 'hard-impact'.
 *
 * Scenario ('test-obstacle' level): push up to ~6 m/s, ollie just before the
 * wall, smack the face mid-air. The solver spreads the crash across ~3 steps
 * (~6 N·s each); the windowed interrupt sum (~18 N·s) crosses the 8 N·s
 * threshold decisively. This focused fixture lowers the interrupt threshold
 * slightly so normal wheel/contact tuning cannot turn the state-machine test
 * into a wall-material calibration test.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_CONFIG } from '@slackpad/shared';
import { AgentHarness } from '../src/agent/AgentHarness';
import { OBSTACLE_WALL_Z } from '../src/sim/levels/test-obstacle';
import { eventsOf, NOSE_POS, scriptOllie, settled, TAIL_POS } from './helpers/maneuver';

describe('GT-interrupt: mid-air hard collision', () => {
  it('fast wall hit mid-air → bail(hard-impact), open label + assists cleared', async () => {
    const config = structuredClone(DEFAULT_SIM_CONFIG);
    config.physics.interruptCollisionImpulse = 6;
    const h = new AgentHarness(config);
    const d = await settled(0x0b57, 'test-obstacle', h);

    // Hold the explicit accelerator until fast, but stop accelerating while
    // there is still a clean run-up to the wall.
    let speedGuard = 0;
    while (
      Math.hypot(h.observe().board.lv.x, h.observe().board.lv.z) <= 5.2 &&
      h.observe().board.p.z < OBSTACLE_WALL_Z - 3 &&
      speedGuard++ < 300
    ) d.cruise(1);
    const speed = Math.hypot(h.observe().board.lv.x, h.observe().board.lv.z);
    expect(speed).toBeGreaterThan(5.2);

    // Approach, then pop a modest armed ollie so the nose meets the face while
    // the board is clearly airborne.
    let guard = 0;
    while (h.observe().board.p.z < OBSTACLE_WALL_Z - 1.9 && guard++ < 900) d.cruise(1);
    scriptOllie(d, { prepMoveFrames: 4, prepSpeedPerFrame: 0.06 });

    expect(eventsOf(h, 'popRecognized').length).toBe(1);

    // The label is open during the air phase…
    let sawOpenLabel = false;
    for (let i = 0; i < 150 && h.observe().phase !== 'bail'; i++) {
      const obs = h.observe();
      if (obs.phase === 'air' && obs.label === 'ollie') sawOpenLabel = true;
      d.drive({ tail: TAIL_POS });
    }
    expect(sawOpenLabel).toBe(true);

    // …until the wall interrupt clears everything.
    const obs = h.observe();
    expect(obs.phase).toBe('bail');
    expect(obs.lastFailReason).toBe('hard-impact');
    expect(obs.label).toBeNull(); // open label cancelled (§3.3 interrupt)
    const bails = eventsOf(h, 'bail');
    expect(bails.length).toBe(1);
    expect(bails[0]!.reason).toBe('hard-impact');
    // No catch/trick ever completed — the interrupt preempted the maneuver.
    expect(eventsOf(h, 'trickCompleted').length).toBe(0);
    // The recorded impact itself is on the telemetry record: airborne contact
    // impulses whose windowed sum crossed the 8 N·s interrupt threshold.
    const airborneImpulse = eventsOf(h, 'contactImpulse')
      .filter((e) => e.grounded === false)
      .reduce((sum, e) => sum + (e.impulse as number), 0);
    expect(airborneImpulse).toBeGreaterThan(config.physics.interruptCollisionImpulse);
  });
});
