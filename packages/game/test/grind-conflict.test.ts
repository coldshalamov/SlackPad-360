/**
 * Grind phase-exclusivity (M6; final-input-and-trick-spec §3.1):
 *   - "Boardslide entry vs air shuv" and "Catch vs grind regrab" are PHASE
 *     EXCLUSIVE. While grinding, free-foot flicks must NOT be read as flips/shuvs
 *     and a replant must NOT be read as a catch — otherwise air torque would fight
 *     the grind or a "catch" would fire mid-grind.
 *   - While a grind CANDIDATE is live in the air approach, air-gesture + catch
 *     recognition is suppressed so a sideways boardslide approach is routed to the
 *     grind path, not misread as a shuv.
 */
import { describe, expect, it } from 'vitest';
import { NOSE_POS, TAIL_POS, settledProfiled, scriptOllie, eventsOf } from './helpers/maneuver';

/** Drive cruise + ollie onto the grind-lab ledge and stop once latched. */
async function enterGrind() {
  const d = await settledProfiled(12345, { levelId: 'grind-lab', assistLevel: 1 });
  const h = d.harness;
  d.cruise(100);
  scriptOllie(d, {});
  for (let i = 0; i < 60; i++) {
    d.drive({ nose: NOSE_POS, tail: TAIL_POS });
    if (h.observe().phase === 'grind') return { d, h };
  }
  throw new Error('did not reach grind phase');
}

describe('grind phase-exclusive (§3.1)', () => {
  it('a free-foot flick while grinding is NOT read as a flip/shuv, and grind holds', async () => {
    const { d, h } = await enterGrind();
    const flipBefore = eventsOf(h, 'flipRecognized').length;
    const shuvBefore = eventsOf(h, 'shuvRecognized').length;

    // Flick the free (nose) foot laterally for several steps while the tail stays
    // planted — exactly a kickflip/shuv gesture, but we are grinding.
    let grinding = 0;
    for (let i = 0; i < 12; i++) {
      const y = NOSE_POS.y - 0.06 * (i + 1);
      d.drive({ nose: { x: NOSE_POS.x, y: Math.max(0.05, y) }, tail: TAIL_POS });
      if (h.observe().phase === 'grind') grinding += 1;
    }

    expect(grinding).toBeGreaterThan(0); // we really were grinding through the flick
    expect(eventsOf(h, 'flipRecognized').length).toBe(flipBefore);
    expect(eventsOf(h, 'shuvRecognized').length).toBe(shuvBefore);
  });

  it('a nose replant while grinding is NOT read as a catch (catch/grind exclusive)', async () => {
    const { d, h } = await enterGrind();
    const catchBefore = eventsOf(h, 'catch').length;
    // Lift the nose then replant it into what would be a catch volume mid-grind.
    for (let i = 0; i < 6; i++) {
      d.drive({ nose: i < 3 ? null : NOSE_POS, tail: TAIL_POS });
    }
    expect(eventsOf(h, 'catch').length).toBe(catchBefore);
  });

  it('a flick during the airborne grind approach does not derail the latch', async () => {
    // Cruise + ollie while continuously flicking the free foot through the whole
    // air approach. The grind candidate must still win and latch (phase exclusive),
    // and no shuv/flip should be recognised once the candidate is live.
    const d = await settledProfiled(12345, { levelId: 'grind-lab', assistLevel: 1 });
    const h = d.harness;
    d.cruise(100);
    scriptOllie(d, {});
    let latched = false;
    for (let i = 0; i < 60; i++) {
      const y = Math.max(0.05, NOSE_POS.y - 0.05 * (i + 1));
      d.drive({ nose: { x: NOSE_POS.x, y }, tail: TAIL_POS });
      if (h.observe().phase === 'grind') {
        latched = true;
        break;
      }
    }
    expect(latched).toBe(true);
    expect(eventsOf(h, 'grindLatched').length).toBeGreaterThanOrEqual(1);
  });
});
